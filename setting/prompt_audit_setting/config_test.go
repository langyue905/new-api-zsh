package prompt_audit_setting

import (
	"errors"
	"math"
	"strconv"
	"sync"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDefaultsAndSnapshotIsolation(t *testing.T) {
	settings := NewManager()

	got := settings.Snapshot()
	assert.False(t, got.Enabled)
	assert.Equal(t, ModeBlocking, got.Mode)
	assert.Equal(t, "deepseek-v4-flash", got.Model)
	assert.Equal(t, 0.9, got.Threshold)
	assert.Equal(t, 5, got.TimeoutSeconds)
	assert.Equal(t, 10, got.AsyncConcurrency)
	assert.Equal(t, 1000, got.AsyncQueueSize)
	assert.Equal(t, 1, got.AllowedRetentionDays)
	assert.Equal(t, 7, got.BlockedRetentionDays)
	assert.False(t, got.LatestContextOnly)
	assert.Equal(t, 1.0, got.SamplingRate)
	assert.Equal(t, DefaultSystemPrompt, got.SystemPrompt)
	require.NotNil(t, got.AuditGroups)
	assert.Empty(t, got.AuditGroups)

	got.AuditGroups = append(got.AuditGroups, "vip")
	assert.Empty(t, settings.Snapshot().AuditGroups)
}

func TestSamplingRateRoundTripsAndRejectsInvalidValues(t *testing.T) {
	settings := NewManager()
	require.NoError(t, settings.Update(UpdateRequest{SamplingRate: ptr(0.2)}))
	assert.Equal(t, 0.2, settings.Snapshot().SamplingRate)
	assert.Equal(t, 0.2, settings.PublicSnapshot().SamplingRate)

	values, err := SettingsToMap(settings.Snapshot())
	require.NoError(t, err)
	assert.Equal(t, "0.2", values["sampling_rate"])
	require.NoError(t, settings.UpdateConfigFromMap(map[string]string{"sampling_rate": "0"}))
	assert.Zero(t, settings.Snapshot().SamplingRate)

	for _, invalid := range []float64{-0.01, 1.01, math.NaN(), math.Inf(1), math.Inf(-1)} {
		candidate := settings.Snapshot()
		candidate.SamplingRate = invalid
		assert.Error(t, Validate(candidate))
	}
}

func TestLatestContextOnlyRoundTripsThroughPublicUpdateMapAndOptionMap(t *testing.T) {
	settings := NewManager()
	require.NoError(t, settings.Update(UpdateRequest{LatestContextOnly: ptr(true)}))
	assert.True(t, settings.Snapshot().LatestContextOnly)
	assert.True(t, settings.PublicSnapshot().LatestContextOnly)

	values, err := SettingsToMap(settings.Snapshot())
	require.NoError(t, err)
	assert.Equal(t, "true", values["latest_context_only"])
	common.OptionMapRWMutex.RLock()
	assert.Equal(t, "true", common.OptionMap["prompt_audit_setting.latest_context_only"])
	common.OptionMapRWMutex.RUnlock()

	require.NoError(t, settings.UpdateConfigFromMap(map[string]string{"latest_context_only": "false"}))
	assert.False(t, settings.Snapshot().LatestContextOnly)
}

func TestUpdateValidatesAndPreservesOrClearsAPIKey(t *testing.T) {
	settings := NewManager()
	require.NoError(t, settings.Update(UpdateRequest{APIKey: "secret"}))
	require.NoError(t, settings.Update(UpdateRequest{APIKey: "", Threshold: ptr(0.75)}))
	assert.Equal(t, "secret", settings.Snapshot().APIKey)
	assert.Equal(t, 0.75, settings.Snapshot().Threshold)
	public := settings.PublicSnapshot()
	assert.True(t, public.KeyConfigured)

	require.NoError(t, settings.Update(UpdateRequest{ClearKey: true}))
	assert.Empty(t, settings.Snapshot().APIKey)
	assert.False(t, settings.PublicSnapshot().KeyConfigured)

	cases := []UpdateRequest{
		{Mode: "invalid"},
		{Threshold: ptr(-0.1)},
		{Threshold: ptr(1.1)},
		{TimeoutSeconds: ptr(0)},
		{TimeoutSeconds: ptr(31)},
		{AsyncConcurrency: ptr(0)},
		{AsyncConcurrency: ptr(101)},
		{AsyncQueueSize: ptr(0)},
		{AsyncQueueSize: ptr(10001)},
		{AllowedRetentionDays: ptr(0)},
		{BlockedRetentionDays: ptr(366)},
	}
	for _, tc := range cases {
		assert.Error(t, settings.Update(tc), "%+v", tc)
	}
}

func TestPublicSnapshotOnlyExposesKeyConfigured(t *testing.T) {
	settings := NewManager()
	require.NoError(t, settings.Update(UpdateRequest{APIKey: "secret"}))

	encoded, err := common.Marshal(settings.PublicSnapshot())
	require.NoError(t, err)
	assert.Contains(t, string(encoded), `"key_configured":true`)
	assert.NotContains(t, string(encoded), "api_key")
	assert.NotContains(t, string(encoded), "secret")
}

func TestValidateBaseURL(t *testing.T) {
	settings := NewManager()
	for _, valid := range []string{"", "https://audit.example.com/v1", "http://localhost:8080/v1?api-version=1"} {
		assert.NoError(t, settings.Update(UpdateRequest{BaseURL: &valid}), valid)
	}
	for _, invalid := range []string{"audit.example.com/v1", "://bad", "ftp://audit.example.com/v1", "https:///missing-host"} {
		assert.Error(t, settings.Update(UpdateRequest{BaseURL: &invalid}), invalid)
	}

}

func TestValidateRequiresEndpointAndKeyWhenEnabled(t *testing.T) {
	settings := NewManager()
	enabled := true
	assert.Error(t, settings.Update(UpdateRequest{Enabled: &enabled}))

	baseURL := "https://audit.example.com/v1"
	assert.NoError(t, settings.Update(UpdateRequest{BaseURL: &baseURL, APIKey: "secret"}))
	assert.NoError(t, settings.Update(UpdateRequest{Enabled: &enabled}))
}

func TestRegisteredConfigUsesConcurrentSafeCodec(t *testing.T) {
	settings := NewManager()
	require.NoError(t, config.UpdateConfigFromMap(settings, map[string]string{
		"enabled":      "true",
		"base_url":     "https://audit.example.com/v1",
		"api_key":      "secret",
		"audit_groups": `["vip"]`,
	}))

	got := settings.Snapshot()
	assert.True(t, got.Enabled)
	assert.Equal(t, []string{"vip"}, got.AuditGroups)

	exported, err := config.ConfigToMap(settings)
	require.NoError(t, err)
	assert.Equal(t, "true", exported["enabled"])
	assert.Equal(t, `["vip"]`, exported["audit_groups"])
}

func TestValidateAndConfigUpdateRejectNonFiniteThreshold(t *testing.T) {
	settings := NewManager()
	for _, threshold := range []float64{math.NaN(), math.Inf(1), math.Inf(-1)} {
		candidate := settings.Snapshot()
		candidate.Threshold = threshold
		assert.Error(t, Validate(candidate))
		assert.Error(t, settings.UpdateConfigFromMap(map[string]string{
			"threshold": strconv.FormatFloat(threshold, 'g', -1, 64),
		}))
	}
}

func TestPersistedUpdateAndReloadUseSameLock(t *testing.T) {
	settings := NewManager()
	persistStarted := make(chan struct{})
	releasePersist := make(chan struct{})
	reloadFinished := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		err := settings.UpdatePersisted(UpdateRequest{Threshold: ptr(0.73)}, func(Settings) error {
			close(persistStarted)
			<-releasePersist
			return nil
		})
		require.NoError(t, err)
	}()
	<-persistStarted
	go func() {
		defer wg.Done()
		require.NoError(t, settings.UpdateConfigFromMap(map[string]string{"timeout_seconds": "9"}))
		close(reloadFinished)
	}()
	select {
	case <-reloadFinished:
		t.Fatal("reload completed while persisted update held the lock")
	default:
	}
	close(releasePersist)
	wg.Wait()
	assert.Equal(t, 0.73, settings.Snapshot().Threshold)
	assert.Equal(t, 9, settings.Snapshot().TimeoutSeconds)
}

func TestPersistedUpdateFailureDoesNotPublish(t *testing.T) {
	settings := NewManager()
	common.OptionMapRWMutex.Lock()
	oldOptions := common.OptionMap
	common.OptionMap = map[string]string{"prompt_audit_setting.threshold": "0.9"}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = oldOptions
		common.OptionMapRWMutex.Unlock()
	})
	err := settings.UpdatePersisted(UpdateRequest{Threshold: ptr(0.73)}, func(Settings) error {
		return errors.New("database unavailable")
	})
	assert.EqualError(t, err, "database unavailable")
	assert.Equal(t, 0.9, settings.Snapshot().Threshold)
	common.OptionMapRWMutex.RLock()
	assert.Equal(t, "0.9", common.OptionMap["prompt_audit_setting.threshold"])
	common.OptionMapRWMutex.RUnlock()
}

func TestPersistedUpdatePublishesSettingsAndInternalOptionMapTogether(t *testing.T) {
	settings := NewManager()
	common.OptionMapRWMutex.Lock()
	oldOptions := common.OptionMap
	common.OptionMap = map[string]string{}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = oldOptions
		common.OptionMapRWMutex.Unlock()
	})
	var persisted map[string]string
	require.NoError(t, settings.UpdatePersisted(UpdateRequest{
		Threshold: ptr(0.73), APIKey: "secret",
	}, func(next Settings) error {
		var err error
		persisted, err = SettingsToMap(next)
		return err
	}))

	assert.Equal(t, 0.73, settings.Snapshot().Threshold)
	assert.Equal(t, "0.73", persisted["threshold"])
	assert.Equal(t, "secret", persisted["api_key"])
	common.OptionMapRWMutex.RLock()
	assert.Equal(t, persisted["threshold"], common.OptionMap["prompt_audit_setting.threshold"])
	assert.Equal(t, persisted["api_key"], common.OptionMap["prompt_audit_setting.api_key"])
	common.OptionMapRWMutex.RUnlock()
}

func TestReloadLoaderRunsAfterPersistedUpdateCompletes(t *testing.T) {
	settings := NewManager()
	persistStarted := make(chan struct{})
	releasePersist := make(chan struct{})
	loaderStarted := make(chan struct{})
	storedThreshold := "0.9"
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		require.NoError(t, settings.UpdatePersisted(UpdateRequest{Threshold: ptr(0.73)}, func(Settings) error {
			close(persistStarted)
			<-releasePersist
			storedThreshold = "0.73"
			return nil
		}))
	}()
	<-persistStarted
	go func() {
		defer wg.Done()
		require.NoError(t, settings.ReloadFrom(func() (map[string]string, error) {
			close(loaderStarted)
			return map[string]string{"threshold": storedThreshold}, nil
		}))
	}()
	select {
	case <-loaderStarted:
		t.Fatal("reload loader read storage before persisted update completed")
	default:
	}
	close(releasePersist)
	wg.Wait()
	assert.Equal(t, 0.73, settings.Snapshot().Threshold)
}

func ptr[T any](value T) *T { return &value }
