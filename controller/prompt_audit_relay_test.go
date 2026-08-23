package controller

import (
	"context"
	"errors"
	"net/http/httptest"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	promptauditsetting "github.com/QuantumNous/new-api/setting/prompt_audit_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type promptAuditRelayTester struct {
	result  service.PromptAuditResult
	err     error
	started chan struct{}
	release chan struct{}
	once    sync.Once
	mu      sync.Mutex
	calls   int
}

func (tester *promptAuditRelayTester) Test(ctx context.Context, _ promptauditsetting.Settings, _ string) (service.PromptAuditResult, error) {
	tester.mu.Lock()
	tester.calls++
	tester.mu.Unlock()
	if tester.started != nil {
		tester.once.Do(func() { close(tester.started) })
	}
	if tester.release != nil {
		select {
		case <-tester.release:
		case <-ctx.Done():
			return service.PromptAuditResult{}, ctx.Err()
		}
	}
	return tester.result, tester.err
}

func (tester *promptAuditRelayTester) callCount() int {
	tester.mu.Lock()
	defer tester.mu.Unlock()
	return tester.calls
}

func TestRunPromptAuditBlockingBlocksAtThresholdAndPersistsMetadata(t *testing.T) {
	c := setupPromptAuditRelayTest(t, promptauditsetting.ModeBlocking, 1)
	reason := strings.Repeat("高风险", 100)
	SetPromptAuditTester(&promptAuditRelayTester{result: service.PromptAuditResult{Confidence: 0.9, Reason: reason}})
	request := &dto.GeneralOpenAIRequest{Messages: []dto.Message{{Role: "user", Content: "danger"}}}
	relayInfo := &relaycommon.RelayInfo{UserId: 7, UsingGroup: "audit", OriginModelName: "gpt-test"}

	err := runPromptAudit(c, types.RelayFormatOpenAI, request, relayInfo)
	require.NotNil(t, err)
	assert.Equal(t, types.ErrorCodePromptAuditBlocked, err.GetErrorCode())
	assert.Equal(t, 400, err.StatusCode)
	assert.Equal(t, "提示词审计拦截："+string([]rune(reason)[:200]), err.Error())
	err.SetMessage(common.MessageWithRequestId(err.Error(), "request-123"))
	assert.Contains(t, err.ToOpenAIError().Message, "request-123")

	require.Eventually(t, func() bool {
		var count int64
		return model.DB.Model(&model.PromptAuditLog{}).Count(&count).Error == nil && count > 0
	}, time.Second, 10*time.Millisecond)
	var log model.PromptAuditLog
	require.NoError(t, model.DB.First(&log).Error)
	assert.Equal(t, model.PromptAuditActionBlocked, log.Action)
	assert.True(t, log.ActuallyBlocked)
	assert.Equal(t, 7, log.UserID)
	assert.Equal(t, "alice", log.Username)
	assert.Equal(t, "audit", log.Group)
	assert.Equal(t, "gpt-test", log.Model)
	assert.Equal(t, "request-123", log.RequestID)
	assert.Equal(t, model.PromptAuditText("user: danger"), log.Prompt)
	assert.NotNil(t, log.Confidence)
	assert.Equal(t, 0.9, *log.Confidence)
	assert.Equal(t, model.PromptAuditLongText(reason), log.Reason)
	assert.Empty(t, log.CacheSourceRequestID)
	assert.Empty(t, log.CacheSourceReason)
	assert.Empty(t, log.BlockSourceRequestID)
	assert.Empty(t, log.BlockSourceReason)
	assert.GreaterOrEqual(t, log.DurationMs, int64(1))
	assert.Equal(t, 1, promptAuditUserViolationCount(t, 7))
}

func TestRunPromptAuditPersistentConversationBlockBypassesSamplingCacheAndPolicy(t *testing.T) {
	c := setupPromptAuditRelayTest(t, promptauditsetting.ModeBlocking, 1)
	tester := &promptAuditRelayTester{result: service.PromptAuditResult{Confidence: 0.95, Reason: "risk"}}
	SetPromptAuditTester(tester)
	prefix := strings.Repeat("界", 256)
	request := func(suffix string) *dto.GeneralOpenAIRequest {
		return &dto.GeneralOpenAIRequest{Messages: []dto.Message{{Role: "user", Content: prefix + suffix}}}
	}
	info := &relaycommon.RelayInfo{UserId: 7, UsingGroup: "audit"}

	require.NotNil(t, runPromptAudit(c, types.RelayFormatOpenAI, request("first"), info))
	assert.Equal(t, 1, tester.callCount())

	settings := promptauditsetting.Get()
	settings.Model = "changed-policy"
	settings.SamplingRate = 0
	require.NoError(t, promptauditsetting.Replace(settings))
	SetPromptAuditTester(&promptAuditRelayTester{result: service.PromptAuditResult{Confidence: 0.1}})
	c.Set(common.RequestIdKey, "request-456")
	c.Set(string(constant.ContextKeyRequestStartTime), time.Now())
	err := runPromptAudit(c, types.RelayFormatOpenAI, request("second"), info)
	require.NotNil(t, err)
	assert.Equal(t, types.ErrorCodePromptAuditBlocked, err.GetErrorCode())

	var logs []model.PromptAuditLog
	require.NoError(t, model.DB.Order("id").Find(&logs).Error)
	require.Len(t, logs, 2)
	assert.Equal(t, model.PromptAuditActionBlocked, logs[1].Action)
	assert.True(t, logs[1].ActuallyBlocked)
	assert.Nil(t, logs[1].Confidence)
	assert.Equal(t, model.PromptAuditLongText(promptAuditConversationBlockReason), logs[1].Reason)
	assert.Equal(t, "request-456", logs[1].RequestID)
	assert.Equal(t, "request-123", logs[1].BlockSourceRequestID)
	assert.Equal(t, model.PromptAuditLongText("risk"), logs[1].BlockSourceReason)
	assert.Equal(t, 2, promptAuditUserViolationCount(t, 7))
}

func TestRunPromptAuditPersistentBlockObeysAuditSwitchAndGroup(t *testing.T) {
	c := setupPromptAuditRelayTest(t, promptauditsetting.ModeBlocking, 1)
	tester := &promptAuditRelayTester{result: service.PromptAuditResult{Confidence: 0.95}}
	SetPromptAuditTester(tester)
	request := &dto.GeneralOpenAIRequest{Messages: []dto.Message{{Role: "user", Content: "danger"}}}
	info := &relaycommon.RelayInfo{UserId: 7, UsingGroup: "audit"}
	require.NotNil(t, runPromptAudit(c, types.RelayFormatOpenAI, request, info))

	settings := promptauditsetting.Get()
	settings.Enabled = false
	require.NoError(t, promptauditsetting.Replace(settings))
	assert.Nil(t, runPromptAudit(c, types.RelayFormatOpenAI, request, info))
	settings.Enabled = true
	settings.AuditGroups = []string{"other"}
	require.NoError(t, promptauditsetting.Replace(settings))
	assert.Nil(t, runPromptAudit(c, types.RelayFormatOpenAI, request, info))

	settings.AuditGroups = []string{"audit"}
	require.NoError(t, promptauditsetting.Replace(settings))
	c.Set(string(constant.ContextKeyRequestStartTime), time.Now())
	require.NotNil(t, runPromptAudit(c, types.RelayFormatOpenAI, request, info))
	assert.Equal(t, 1, tester.callCount())
}

func TestRunPromptAuditConversationBlockLookupFailureFallsBackToRealAudit(t *testing.T) {
	c := setupPromptAuditRelayTest(t, promptauditsetting.ModeBlocking, 1)
	settings := promptauditsetting.Get()
	settings.SamplingRate = 0
	require.NoError(t, promptauditsetting.Replace(settings))
	tester := &promptAuditRelayTester{result: service.PromptAuditResult{Confidence: 0.1}}
	SetPromptAuditTester(tester)
	require.NoError(t, model.DB.Migrator().DropTable(&model.PromptAuditConversationBlock{}))

	err := runPromptAudit(c, types.RelayFormatOpenAI,
		&dto.GeneralOpenAIRequest{Messages: []dto.Message{{Role: "user", Content: "maybe"}}},
		&relaycommon.RelayInfo{UserId: 7, UsingGroup: "audit"})

	assert.Nil(t, err)
	assert.Equal(t, 1, tester.callCount(), "a marker lookup failure must use the normal audit client instead of trusting cache or sampling")
}

func TestRunPromptAuditAsyncDecisionPermanentlyBlocksFollowingRequest(t *testing.T) {
	c := setupPromptAuditRelayTest(t, promptauditsetting.ModeAsync, 2)
	tester := &promptAuditRelayTester{result: service.PromptAuditResult{Confidence: 0.95, Reason: "risk"}}
	SetPromptAuditTester(tester)
	request := &dto.GeneralOpenAIRequest{Messages: []dto.Message{{Role: "user", Content: "danger"}}}
	info := &relaycommon.RelayInfo{UserId: 7, UsingGroup: "audit"}

	assert.Nil(t, runPromptAudit(c, types.RelayFormatOpenAI, request, info))
	require.Eventually(t, func() bool {
		active, err := model.IsPromptAuditConversationBlocked(context.Background(), 7, promptAuditConversationHash("user: danger"))
		return err == nil && active
	}, time.Second, 10*time.Millisecond)
	assert.Zero(t, promptAuditUserViolationCount(t, 7), "an async observation must not count until a later request is actually blocked")
	c.Set(common.RequestIdKey, "request-async-next")
	c.Set(string(constant.ContextKeyRequestStartTime), time.Now())
	require.NotNil(t, runPromptAudit(c, types.RelayFormatOpenAI, request, info))
	assert.Equal(t, 1, tester.callCount())
	assert.Equal(t, 1, promptAuditUserViolationCount(t, 7))
}

func TestRunPromptAuditReleasePreventsInFlightAsyncDecisionFromRestoringBlock(t *testing.T) {
	c := setupPromptAuditRelayTest(t, promptauditsetting.ModeAsync, 2)
	request := &dto.GeneralOpenAIRequest{Messages: []dto.Message{{Role: "user", Content: "danger"}}}
	info := &relaycommon.RelayInfo{UserId: 7, UsingGroup: "audit"}
	started := make(chan struct{})
	releaseAudit := make(chan struct{})
	tester := &promptAuditRelayTester{
		result:  service.PromptAuditResult{Confidence: 0.95, Reason: "risk"},
		started: started, release: releaseAudit,
	}
	SetPromptAuditTester(tester)
	assert.Nil(t, runPromptAudit(c, types.RelayFormatOpenAI, request, info))
	<-started

	hash := promptAuditConversationHash("user: danger")
	created, err := model.MarkPromptAuditConversationBlocked(context.Background(), 7, hash, "source-before-release", "risk", time.Now().Add(-time.Second))
	require.NoError(t, err)
	require.True(t, created)
	released, err := model.ReleasePromptAuditConversationBlock(context.Background(), 7, hash, time.Now())
	require.NoError(t, err)
	require.True(t, released)
	close(releaseAudit)
	require.Eventually(t, func() bool { return tester.callCount() == 1 }, time.Second, 10*time.Millisecond)
	time.Sleep(25 * time.Millisecond)

	active, err := model.IsPromptAuditConversationBlocked(context.Background(), 7, hash)
	require.NoError(t, err)
	assert.False(t, active)
}

func TestRunPromptAuditRequestStartedBeforeReleaseDoesNotStartNewAsyncAudit(t *testing.T) {
	c := setupPromptAuditRelayTest(t, promptauditsetting.ModeAsync, 2)
	prompt := "user: danger"
	hash := promptAuditConversationHash(prompt)
	created, err := model.MarkPromptAuditConversationBlocked(context.Background(), 7, hash, "source", "risk", time.Now().Add(-time.Second))
	require.NoError(t, err)
	require.True(t, created)
	requestStarted := time.Now()
	released, err := model.ReleasePromptAuditConversationBlock(context.Background(), 7, hash, requestStarted.Add(time.Second))
	require.NoError(t, err)
	require.True(t, released)
	tester := &promptAuditRelayTester{result: service.PromptAuditResult{Confidence: 0.95}}
	SetPromptAuditTester(tester)
	c.Set(string(constant.ContextKeyRequestStartTime), requestStarted)

	assert.Nil(t, runPromptAudit(c, types.RelayFormatOpenAI,
		&dto.GeneralOpenAIRequest{Messages: []dto.Message{{Role: "user", Content: "danger"}}},
		&relaycommon.RelayInfo{UserId: 7, UsingGroup: "audit"}))
	time.Sleep(25 * time.Millisecond)
	assert.Zero(t, tester.callCount())
}

func TestRunPromptAuditBlockingFailsOpenAndSkipsUnsupportedPaths(t *testing.T) {
	c := setupPromptAuditRelayTest(t, promptauditsetting.ModeBlocking, 1)
	SetPromptAuditTester(&promptAuditRelayTester{
		result: service.PromptAuditResult{AuditModelOutput: "  invalid raw output  "},
		err:    errors.New("审计请求失败"),
	})
	request := &dto.GeneralOpenAIRequest{Messages: []dto.Message{{Role: "user", Content: "private"}}}
	relayInfo := &relaycommon.RelayInfo{UserId: 7, UsingGroup: "audit", OriginModelName: "gpt-test"}

	err := runPromptAudit(c, types.RelayFormatOpenAI, request, relayInfo)
	assert.Nil(t, err)
	var log model.PromptAuditLog
	require.NoError(t, model.DB.First(&log).Error)
	assert.Equal(t, model.PromptAuditActionAllowed, log.Action)
	assert.Nil(t, log.Confidence)
	assert.Equal(t, model.PromptAuditText("审计失败：审计请求失败"), log.Reason)
	assert.Equal(t, model.PromptAuditText("  invalid raw output  "), log.AuditModelOutput)
	assert.Empty(t, log.CacheSourceRequestID)
	assert.Empty(t, log.CacheSourceReason)
	assert.Zero(t, promptAuditUserViolationCount(t, 7))

	c.Request = httptest.NewRequest("POST", "/v1/moderations", nil)
	err = runPromptAudit(c, types.RelayFormatOpenAI, request, relayInfo)
	assert.Nil(t, err)
	var count int64
	require.NoError(t, model.DB.Model(&model.PromptAuditLog{}).Count(&count).Error)
	assert.Equal(t, int64(1), count)
}

func TestRunPromptAuditUsesConfiguredLatestContextOnly(t *testing.T) {
	c := setupPromptAuditRelayTest(t, promptauditsetting.ModeBlocking, 1)
	settings := promptauditsetting.Get()
	settings.LatestContextOnly = true
	require.NoError(t, promptauditsetting.Replace(settings))
	SetPromptAuditTester(&promptAuditRelayTester{result: service.PromptAuditResult{Confidence: 0.1}})
	request := &dto.GeneralOpenAIRequest{Messages: []dto.Message{
		{Role: "system", Content: "rules"},
		{Role: "assistant", Content: "old answer"},
		{Role: "user", Content: "old followup"},
		{Role: "assistant", Content: "latest answer"},
		{Role: "user", Content: "current question"},
	}}

	assert.Nil(t, runPromptAudit(c, types.RelayFormatOpenAI, request, &relaycommon.RelayInfo{UserId: 7, UsingGroup: "audit"}))

	var log model.PromptAuditLog
	require.NoError(t, model.DB.First(&log).Error)
	assert.Equal(t, model.PromptAuditText("system: rules\nassistant: latest answer\nuser: current question"), log.Prompt)
}

func TestRunPromptAuditBlockingUsesRequestContext(t *testing.T) {
	c := setupPromptAuditRelayTest(t, promptauditsetting.ModeBlocking, 1)
	release := make(chan struct{})
	SetPromptAuditTester(&promptAuditRelayTester{release: release})
	ctx, cancel := context.WithCancel(c.Request.Context())
	c.Request = c.Request.WithContext(ctx)
	cancel()
	returned := make(chan *types.NewAPIError, 1)
	go func() {
		returned <- runPromptAudit(c, types.RelayFormatOpenAI, &dto.GeneralOpenAIRequest{Messages: []dto.Message{{Role: "user", Content: "hello"}}}, &relaycommon.RelayInfo{UserId: 7, UsingGroup: "audit"})
	}()
	select {
	case err := <-returned:
		assert.Nil(t, err)
	case <-time.After(200 * time.Millisecond):
		close(release)
		t.Fatal("blocking audit did not receive the canceled request context")
	}
}

func TestRunPromptAuditAllowedDecisionCachesExactlyTenFollowingRequests(t *testing.T) {
	c := setupPromptAuditRelayTest(t, promptauditsetting.ModeBlocking, 1)
	tester := &promptAuditRelayTester{result: service.PromptAuditResult{Confidence: 0.1, Reason: "safe"}}
	SetPromptAuditTester(tester)
	request := &dto.GeneralOpenAIRequest{Messages: []dto.Message{{Role: "user", Content: strings.Repeat("前", 256) + "tail-one"}}}
	info := &relaycommon.RelayInfo{UserId: 7, UsingGroup: "audit"}

	for i := 0; i < 11; i++ {
		c.Set(common.RequestIdKey, "request-"+common.Interface2String(i))
		assert.Nil(t, runPromptAudit(c, types.RelayFormatOpenAI, request, info))
	}
	assert.Equal(t, 1, tester.callCount(), "initial audit plus ten following calls must consume one real audit")
	c.Set(common.RequestIdKey, "request-11")
	assert.Nil(t, runPromptAudit(c, types.RelayFormatOpenAI, request, info))
	assert.Equal(t, 2, tester.callCount(), "the eleventh following call must be audited again")

	require.Eventually(t, func() bool {
		var count int64
		return model.DB.Model(&model.PromptAuditLog{}).Where("reason = ?", promptAuditAllowCacheReason).Count(&count).Error == nil && count == 10
	}, time.Second, 10*time.Millisecond)
	var cachedLogs []model.PromptAuditLog
	require.NoError(t, model.DB.Where("reason = ?", promptAuditAllowCacheReason).Order("id").Find(&cachedLogs).Error)
	require.Len(t, cachedLogs, 10)
	for index, cachedLog := range cachedLogs {
		assert.Nil(t, cachedLog.Confidence)
		assert.Empty(t, cachedLog.AuditModelOutput)
		assert.Equal(t, model.PromptAuditText("user: "+strings.Repeat("前", 256)+"tail-one"), cachedLog.Prompt)
		assert.False(t, cachedLog.ActuallyBlocked)
		assert.Equal(t, "request-"+common.Interface2String(index+1), cachedLog.RequestID)
		assert.Equal(t, "request-0", cachedLog.CacheSourceRequestID)
		assert.Equal(t, model.PromptAuditLongText("safe"), cachedLog.CacheSourceReason)
	}
	var realAuditLogs []model.PromptAuditLog
	require.NoError(t, model.DB.Where("reason = ?", "safe").Order("id").Find(&realAuditLogs).Error)
	require.Len(t, realAuditLogs, 2)
	for _, realAuditLog := range realAuditLogs {
		assert.Empty(t, realAuditLog.CacheSourceRequestID)
		assert.Empty(t, realAuditLog.CacheSourceReason)
	}
}

func TestRunPromptAuditCacheIsIsolatedByUserUnicodePrefixAndPolicy(t *testing.T) {
	c := setupPromptAuditRelayTest(t, promptauditsetting.ModeBlocking, 1)
	tester := &promptAuditRelayTester{result: service.PromptAuditResult{Confidence: 0.1}}
	SetPromptAuditTester(tester)
	base := strings.Repeat("界", 256)
	info := &relaycommon.RelayInfo{UserId: 7, UsingGroup: "audit"}
	request := func(suffix string) *dto.GeneralOpenAIRequest {
		return &dto.GeneralOpenAIRequest{Messages: []dto.Message{{Role: "user", Content: base + suffix}}}
	}

	assert.Nil(t, runPromptAudit(c, types.RelayFormatOpenAI, request("one"), info))
	assert.Nil(t, runPromptAudit(c, types.RelayFormatOpenAI, request("two"), info))
	assert.Equal(t, 1, tester.callCount(), "same first 256 Unicode characters should share cache")

	info.UserId = 8
	assert.Nil(t, runPromptAudit(c, types.RelayFormatOpenAI, request("two"), info))
	assert.Equal(t, 2, tester.callCount())

	settings := promptauditsetting.Get()
	settings.Threshold = 0.8
	require.NoError(t, promptauditsetting.Replace(settings))
	assert.Nil(t, runPromptAudit(c, types.RelayFormatOpenAI, request("two"), info))
	assert.Equal(t, 3, tester.callCount(), "policy fingerprint must isolate old cache entries")
}

func TestRunPromptAuditSamplingZeroSkipsAuditAndLogs(t *testing.T) {
	c := setupPromptAuditRelayTest(t, promptauditsetting.ModeBlocking, 1)
	settings := promptauditsetting.Get()
	settings.SamplingRate = 0
	require.NoError(t, promptauditsetting.Replace(settings))
	tester := &promptAuditRelayTester{result: service.PromptAuditResult{Confidence: 1}}
	SetPromptAuditTester(tester)

	err := runPromptAudit(c, types.RelayFormatOpenAI, &dto.GeneralOpenAIRequest{Messages: []dto.Message{{Role: "user", Content: "danger"}}}, &relaycommon.RelayInfo{UserId: 7, UsingGroup: "audit"})

	assert.Nil(t, err)
	assert.Zero(t, tester.callCount())
	var count int64
	require.NoError(t, model.DB.Model(&model.PromptAuditLog{}).Count(&count).Error)
	assert.Zero(t, count)
	assert.Zero(t, promptAuditUserViolationCount(t, 7))
}

func TestRunPromptAuditCountFailureDoesNotChangeBlockingDecision(t *testing.T) {
	c := setupPromptAuditRelayTest(t, promptauditsetting.ModeBlocking, 1)
	SetPromptAuditTester(&promptAuditRelayTester{result: service.PromptAuditResult{Confidence: 0.95, Reason: "risk"}})
	require.NoError(t, model.DB.Migrator().DropTable(&model.User{}))

	err := runPromptAudit(c, types.RelayFormatOpenAI,
		&dto.GeneralOpenAIRequest{Messages: []dto.Message{{Role: "user", Content: "danger"}}},
		&relaycommon.RelayInfo{UserId: 7, UsingGroup: "audit"})

	require.NotNil(t, err)
	assert.Equal(t, types.ErrorCodePromptAuditBlocked, err.GetErrorCode())
}

func TestRunPromptAuditCacheHitDurationIsCapturedBeforeDeferredLogging(t *testing.T) {
	c := setupPromptAuditRelayTest(t, promptauditsetting.ModeBlocking, 1)
	requestStartedAt := time.Unix(1000, 0)
	currentTime := requestStartedAt.Add(10 * time.Millisecond)
	c.Set(string(constant.ContextKeyRequestStartTime), requestStartedAt)
	promptAuditNow = func() time.Time { return currentTime }
	prompt := "user: cached"
	settings := promptauditsetting.Get()
	promptAuditDecisionCache.store(promptAuditCacheKey(settings, 7, prompt), promptAuditAllowCacheSource{
		requestID: "source-request", reason: "source reason",
	})
	request := &dto.GeneralOpenAIRequest{Messages: []dto.Message{{Role: "user", Content: "cached"}}}
	info := &relaycommon.RelayInfo{UserId: 7, UsingGroup: "audit"}

	logs := make(chan model.PromptAuditLog, 2)
	releaseFirst := make(chan struct{})
	var calls int
	var mu sync.Mutex
	setPromptAuditLogWriter(func(_ context.Context, log *model.PromptAuditLog) error {
		logs <- *log
		mu.Lock()
		calls++
		call := calls
		mu.Unlock()
		if call == 1 {
			<-releaseFirst
		}
		return nil
	})

	assert.Nil(t, runPromptAudit(c, types.RelayFormatOpenAI, request, info))
	first := <-logs
	assert.Nil(t, runPromptAudit(c, types.RelayFormatOpenAI, request, info))
	currentTime = currentTime.Add(time.Hour)
	close(releaseFirst)
	second := <-logs

	assert.Equal(t, int64(10), first.DurationMs)
	assert.Equal(t, int64(10), second.DurationMs, "deferred writer queue time must not inflate cache-hit decision latency")
}

func TestPromptAuditStableSamplingIsDeterministicAndBounded(t *testing.T) {
	prompt := strings.Repeat("好", 300)
	first := promptAuditSampled(0.2, 7, "request-123", prompt)
	for range 20 {
		assert.Equal(t, first, promptAuditSampled(0.2, 7, "request-123", prompt))
	}
	assert.False(t, promptAuditSampled(0, 7, "request-123", prompt))
	assert.True(t, promptAuditSampled(1, 7, "request-123", prompt))
}

func TestPromptAuditAllowCacheEnforcesConcurrentHitLimitAndSlidingExpiry(t *testing.T) {
	now := time.Unix(1000, 0)
	cache := newPromptAuditAllowCache(100, 10, 10*time.Minute)
	cache.now = func() time.Time { return now }
	cache.store("key", promptAuditAllowCacheSource{requestID: "source-request", reason: "source reason"})

	var hits int
	var mu sync.Mutex
	var wg sync.WaitGroup
	for range 20 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, ok := cache.hit("key"); ok {
				mu.Lock()
				hits++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	assert.Equal(t, 10, hits)
	_, ok := cache.hit("key")
	assert.False(t, ok)

	cache.store("sliding", promptAuditAllowCacheSource{})
	now = now.Add(9 * time.Minute)
	_, ok = cache.hit("sliding")
	assert.True(t, ok)
	now = now.Add(9 * time.Minute)
	_, ok = cache.hit("sliding")
	assert.True(t, ok, "each hit must renew idle expiration")
	now = now.Add(11 * time.Minute)
	_, ok = cache.hit("sliding")
	assert.False(t, ok)
}

func TestPromptAuditAllowCacheRepeatedSuccessfulStoresKeepFirstSourceAndHitBudget(t *testing.T) {
	now := time.Unix(1000, 0)
	cache := newPromptAuditAllowCache(100, 10, 10*time.Minute)
	cache.now = func() time.Time { return now }
	first := promptAuditAllowCacheSource{requestID: "first-request", reason: "first reason"}
	cache.store("key", first)
	for range 3 {
		source, ok := cache.hit("key")
		assert.True(t, ok)
		assert.Equal(t, first, source)
	}

	var wg sync.WaitGroup
	for range 20 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			cache.store("key", promptAuditAllowCacheSource{requestID: "later-request", reason: "later reason"})
		}()
	}
	wg.Wait()
	for range 7 {
		source, ok := cache.hit("key")
		assert.True(t, ok)
		assert.Equal(t, first, source)
	}
	_, ok := cache.hit("key")
	assert.False(t, ok, "a concurrent successful audit must not reset an active entry's remaining hit count")
}

func TestPromptAuditAllowCacheRemovesConversationAcrossPolicies(t *testing.T) {
	cache := newPromptAuditAllowCache(100, 10, 10*time.Minute)
	settings := promptauditsetting.Get()
	prompt := strings.Repeat("界", 256) + "one"
	firstKey := promptAuditCacheKey(settings, 7, prompt)
	cache.store(firstKey, promptAuditAllowCacheSource{})
	settings.Model = "other-policy"
	secondKey := promptAuditCacheKey(settings, 7, strings.Repeat("界", 256)+"two")
	cache.store(secondKey, promptAuditAllowCacheSource{})
	otherUserKey := promptAuditCacheKey(settings, 8, prompt)
	cache.store(otherUserKey, promptAuditAllowCacheSource{})

	cache.removeConversation(7, prompt)
	_, firstHit := cache.hit(firstKey)
	_, secondHit := cache.hit(secondKey)
	_, otherUserHit := cache.hit(otherUserKey)
	assert.False(t, firstHit)
	assert.False(t, secondHit)
	assert.True(t, otherUserHit)
}

func TestPromptAuditAllowCacheRejectsStoreFromEpochBeforeReset(t *testing.T) {
	cache := newPromptAuditAllowCache(100, 10, 10*time.Minute)
	staleEpoch := cache.currentEpoch()
	cache.reset()

	assert.False(t, cache.storeIfCurrent("stale", staleEpoch, promptAuditAllowCacheSource{}))
	_, ok := cache.hit("stale")
	assert.False(t, ok)

	currentEpoch := cache.currentEpoch()
	assert.True(t, cache.storeIfCurrent("current", currentEpoch, promptAuditAllowCacheSource{}))
	_, ok = cache.hit("current")
	assert.True(t, ok)
}

func TestPromptAuditAllowCacheEvictsLeastRecentlyUsedAtCapacity(t *testing.T) {
	now := time.Unix(1000, 0)
	cache := newPromptAuditAllowCache(2, 10, 10*time.Minute)
	cache.now = func() time.Time { return now }
	cache.store("old", promptAuditAllowCacheSource{})
	now = now.Add(time.Second)
	cache.store("recent", promptAuditAllowCacheSource{})
	now = now.Add(time.Second)
	_, ok := cache.hit("old")
	assert.True(t, ok)
	now = now.Add(time.Second)
	cache.store("new", promptAuditAllowCacheSource{})

	_, ok = cache.hit("old")
	assert.True(t, ok)
	_, ok = cache.hit("recent")
	assert.False(t, ok)
	_, ok = cache.hit("new")
	assert.True(t, ok)
}

type promptAuditLifecycleTester struct {
	mu       sync.Mutex
	calls    []string
	started  chan string
	canceled chan string
	hold     <-chan struct{}
}

func (tester *promptAuditLifecycleTester) Test(ctx context.Context, _ promptauditsetting.Settings, prompt string) (service.PromptAuditResult, error) {
	tester.mu.Lock()
	tester.calls = append(tester.calls, prompt)
	tester.mu.Unlock()
	tester.started <- prompt
	if strings.Contains(prompt, "third") {
		return service.PromptAuditResult{}, nil
	}
	<-ctx.Done()
	if tester.canceled != nil {
		tester.canceled <- prompt
	}
	if tester.hold != nil {
		<-tester.hold
	}
	return service.PromptAuditResult{}, ctx.Err()
}

func TestPromptAuditSchedulerCancelsOldGenerationAndDropsQueuedJobs(t *testing.T) {
	c := setupPromptAuditRelayTest(t, promptauditsetting.ModeAsync, 2)
	tester := &promptAuditLifecycleTester{started: make(chan string, 4), canceled: make(chan string, 2)}
	SetPromptAuditTester(tester)
	info := &relaycommon.RelayInfo{UserId: 7, UsingGroup: "audit"}
	requestFor := func(text string) *dto.GeneralOpenAIRequest {
		return &dto.GeneralOpenAIRequest{Messages: []dto.Message{{Role: "user", Content: text}}}
	}
	assert.Nil(t, runPromptAudit(c, types.RelayFormatOpenAI, requestFor("first"), info))
	require.Contains(t, <-tester.started, "first")
	assert.Nil(t, runPromptAudit(c, types.RelayFormatOpenAI, requestFor("second"), info))
	settings := promptauditsetting.Get()
	settings.AsyncConcurrency = 2
	require.NoError(t, promptauditsetting.Replace(settings))
	assert.Nil(t, runPromptAudit(c, types.RelayFormatOpenAI, requestFor("third"), info))
	require.Contains(t, <-tester.canceled, "first")
	require.Eventually(t, func() bool {
		tester.mu.Lock()
		defer tester.mu.Unlock()
		return slices.ContainsFunc(tester.calls, func(call string) bool { return strings.Contains(call, "third") })
	}, time.Second, 10*time.Millisecond)
	time.Sleep(50 * time.Millisecond)
	tester.mu.Lock()
	defer tester.mu.Unlock()
	assert.False(t, slices.ContainsFunc(tester.calls, func(call string) bool { return strings.Contains(call, "second") }))
}

func TestPromptAuditSchedulerResetWaitsForCanceledWorker(t *testing.T) {
	c := setupPromptAuditRelayTest(t, promptauditsetting.ModeAsync, 1)
	hold := make(chan struct{})
	tester := &promptAuditLifecycleTester{started: make(chan string, 1), hold: hold}
	SetPromptAuditTester(tester)
	assert.Nil(t, runPromptAudit(c, types.RelayFormatOpenAI, &dto.GeneralOpenAIRequest{Messages: []dto.Message{{Role: "user", Content: "first"}}}, &relaycommon.RelayInfo{UsingGroup: "audit"}))
	<-tester.started
	resetDone := make(chan struct{})
	go func() {
		promptAuditScheduler.reset()
		close(resetDone)
	}()
	select {
	case <-resetDone:
		t.Fatal("reset returned before the canceled worker exited")
	case <-time.After(50 * time.Millisecond):
	}
	close(hold)
	select {
	case <-resetDone:
	case <-time.After(time.Second):
		t.Fatal("reset did not wait for worker shutdown")
	}
}

func TestRunPromptAuditAsyncReturnsBeforeAuditAndRecordsObservedDecision(t *testing.T) {
	c := setupPromptAuditRelayTest(t, promptauditsetting.ModeAsync, 2)
	started := make(chan struct{})
	release := make(chan struct{})
	SetPromptAuditTester(&promptAuditRelayTester{
		result:  service.PromptAuditResult{Confidence: 0.95, Reason: "would block"},
		started: started, release: release,
	})
	request := &dto.GeneralOpenAIRequest{Messages: []dto.Message{{Role: "user", Content: "danger"}}}
	relayInfo := &relaycommon.RelayInfo{UserId: 7, UsingGroup: "audit", OriginModelName: "gpt-test"}

	returned := make(chan *types.NewAPIError, 1)
	go func() { returned <- runPromptAudit(c, types.RelayFormatOpenAI, request, relayInfo) }()
	select {
	case err := <-returned:
		assert.Nil(t, err)
	case <-time.After(time.Second):
		t.Fatal("async audit waited for the audit client")
	}
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("async audit worker did not start")
	}
	close(release)
	require.Eventually(t, func() bool {
		var log model.PromptAuditLog
		if err := model.DB.First(&log).Error; err != nil {
			return false
		}
		return log.Action == model.PromptAuditActionBlocked && !log.ActuallyBlocked
	}, 2*time.Second, 10*time.Millisecond)
}

func TestRunPromptAuditAsyncDoesNotAssumeAllowedBeforeFirstResult(t *testing.T) {
	c := setupPromptAuditRelayTest(t, promptauditsetting.ModeAsync, 2)
	started := make(chan struct{})
	release := make(chan struct{})
	tester := &promptAuditRelayTester{
		result: service.PromptAuditResult{Confidence: 0.1}, started: started, release: release,
	}
	SetPromptAuditTester(tester)
	request := &dto.GeneralOpenAIRequest{Messages: []dto.Message{{Role: "user", Content: "same conversation"}}}
	info := &relaycommon.RelayInfo{UserId: 7, UsingGroup: "audit"}

	assert.Nil(t, runPromptAudit(c, types.RelayFormatOpenAI, request, info))
	<-started
	assert.Nil(t, runPromptAudit(c, types.RelayFormatOpenAI, request, info))
	close(release)
	require.Eventually(t, func() bool { return tester.callCount() == 2 }, time.Second, 10*time.Millisecond)

	assert.Nil(t, runPromptAudit(c, types.RelayFormatOpenAI, request, info))
	time.Sleep(50 * time.Millisecond)
	assert.Equal(t, 2, tester.callCount(), "a completed successful async audit should enable the cache")
}

func TestRunPromptAuditBlockedAndFailedDecisionsNeverCreateCache(t *testing.T) {
	t.Run("blocked", func(t *testing.T) {
		c := setupPromptAuditRelayTest(t, promptauditsetting.ModeBlocking, 1)
		tester := &promptAuditRelayTester{result: service.PromptAuditResult{Confidence: 0.95}}
		SetPromptAuditTester(tester)
		request := &dto.GeneralOpenAIRequest{Messages: []dto.Message{{Role: "user", Content: "danger"}}}
		info := &relaycommon.RelayInfo{UserId: 7, UsingGroup: "audit"}
		require.NotNil(t, runPromptAudit(c, types.RelayFormatOpenAI, request, info))
		require.NotNil(t, runPromptAudit(c, types.RelayFormatOpenAI, request, info))
		assert.Equal(t, 1, tester.callCount(), "the second blocked request must use the persistent conversation marker")
	})

	t.Run("failed", func(t *testing.T) {
		c := setupPromptAuditRelayTest(t, promptauditsetting.ModeBlocking, 1)
		tester := &promptAuditRelayTester{err: errors.New("failed")}
		SetPromptAuditTester(tester)
		request := &dto.GeneralOpenAIRequest{Messages: []dto.Message{{Role: "user", Content: "maybe"}}}
		info := &relaycommon.RelayInfo{UserId: 7, UsingGroup: "audit"}
		assert.Nil(t, runPromptAudit(c, types.RelayFormatOpenAI, request, info))
		assert.Nil(t, runPromptAudit(c, types.RelayFormatOpenAI, request, info))
		assert.Equal(t, 2, tester.callCount())
	})
}

func TestRunPromptAuditInFlightDecisionCannotRepopulateCacheAfterReset(t *testing.T) {
	c := setupPromptAuditRelayTest(t, promptauditsetting.ModeBlocking, 1)
	started := make(chan struct{})
	release := make(chan struct{})
	tester := &promptAuditRelayTester{
		result: service.PromptAuditResult{Confidence: 0.1}, started: started, release: release,
	}
	SetPromptAuditTester(tester)
	request := &dto.GeneralOpenAIRequest{Messages: []dto.Message{{Role: "user", Content: "old policy request"}}}
	info := &relaycommon.RelayInfo{UserId: 7, UsingGroup: "audit"}
	returned := make(chan *types.NewAPIError, 1)
	go func() { returned <- runPromptAudit(c, types.RelayFormatOpenAI, request, info) }()
	<-started

	promptAuditDecisionCache.reset()
	close(release)
	assert.Nil(t, <-returned)
	assert.Nil(t, runPromptAudit(c, types.RelayFormatOpenAI, request, info))

	assert.Equal(t, 2, tester.callCount(), "the pre-reset in-flight decision must not repopulate the current cache generation")
}

func TestRunPromptAuditAsyncQueueFullWritesFailOpenLog(t *testing.T) {
	c := setupPromptAuditRelayTest(t, promptauditsetting.ModeAsync, 1)
	started := make(chan struct{})
	release := make(chan struct{})
	SetPromptAuditTester(&promptAuditRelayTester{started: started, release: release})
	request := &dto.GeneralOpenAIRequest{Messages: []dto.Message{{Role: "user", Content: "danger"}}}
	relayInfo := &relaycommon.RelayInfo{UserId: 7, UsingGroup: "audit", OriginModelName: "gpt-test"}

	assert.Nil(t, runPromptAudit(c, types.RelayFormatOpenAI, request, relayInfo))
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("async audit worker did not start")
	}
	assert.Nil(t, runPromptAudit(c, types.RelayFormatOpenAI, request, relayInfo))
	assert.Nil(t, runPromptAudit(c, types.RelayFormatOpenAI, request, relayInfo))

	require.Eventually(t, func() bool {
		var count int64
		return model.DB.Model(&model.PromptAuditLog{}).Count(&count).Error == nil && count > 0
	}, time.Second, 10*time.Millisecond)
	var log model.PromptAuditLog
	require.NoError(t, model.DB.Where("reason = ?", "审计失败：审计队列已满").First(&log).Error)
	assert.Equal(t, model.PromptAuditActionAllowed, log.Action)
	assert.Nil(t, log.Confidence)
	assert.False(t, log.ActuallyBlocked)
	assert.Empty(t, log.CacheSourceRequestID)
	assert.Empty(t, log.CacheSourceReason)
	assert.Zero(t, promptAuditUserViolationCount(t, 7))
	close(release)
}

func TestRunPromptAuditAsyncQueueFullDoesNotWaitForLogWriter(t *testing.T) {
	c := setupPromptAuditRelayTest(t, promptauditsetting.ModeAsync, 1)
	started := make(chan struct{})
	releaseAudit := make(chan struct{})
	SetPromptAuditTester(&promptAuditRelayTester{started: started, release: releaseAudit})
	request := &dto.GeneralOpenAIRequest{Messages: []dto.Message{{Role: "user", Content: "danger"}}}
	relayInfo := &relaycommon.RelayInfo{UserId: 7, UsingGroup: "audit", OriginModelName: "gpt-test"}

	assert.Nil(t, runPromptAudit(c, types.RelayFormatOpenAI, request, relayInfo))
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("async audit worker did not start")
	}
	assert.Nil(t, runPromptAudit(c, types.RelayFormatOpenAI, request, relayInfo))

	oldWriter := model.CreatePromptAuditLog
	writerStarted := make(chan struct{})
	releaseWriter := make(chan struct{})
	var once sync.Once
	setPromptAuditLogWriter(func(ctx context.Context, log *model.PromptAuditLog) error {
		once.Do(func() { close(writerStarted) })
		<-releaseWriter
		return oldWriter(ctx, log)
	})
	defer func() {
		setPromptAuditLogWriter(oldWriter)
		close(releaseAudit)
	}()

	returned := make(chan *types.NewAPIError, 1)
	go func() { returned <- runPromptAudit(c, types.RelayFormatOpenAI, request, relayInfo) }()
	select {
	case err := <-returned:
		assert.Nil(t, err)
	case <-time.After(time.Second):
		t.Fatal("queue-full logging blocked the relay request")
	}
	select {
	case <-writerStarted:
	case <-time.After(time.Second):
		t.Fatal("queue-full failure log was not attempted")
	}
	close(releaseWriter)
}

func setupPromptAuditRelayTest(t *testing.T, mode string, queueSize int) *gin.Context {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open("file:"+strings.ReplaceAll(t.Name(), "/", "_")+"?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.PromptAuditLog{}, &model.PromptAuditConversationBlock{}, &model.User{}))
	require.NoError(t, db.Create(&model.User{Id: 7, Username: "alice", Password: "password", Group: "audit", AffCode: "prompt-audit-user"}).Error)
	oldDB := model.DB
	oldSettings := promptauditsetting.Get()
	model.DB = db
	settings := oldSettings
	settings.Enabled = true
	settings.Mode = mode
	settings.Model = "audit-model"
	settings.BaseURL = "https://audit.invalid/v1"
	settings.APIKey = "secret"
	settings.SystemPrompt = "audit"
	settings.Threshold = 0.9
	settings.TimeoutSeconds = 1
	settings.AuditGroups = []string{"audit"}
	settings.AsyncConcurrency = 1
	settings.AsyncQueueSize = queueSize
	settings.SamplingRate = 1
	require.NoError(t, promptauditsetting.Replace(settings))
	promptAuditScheduler.reset()
	promptAuditOverflowLogScheduler.reset()
	promptAuditDecisionCache.reset()
	promptAuditNow = time.Now
	t.Cleanup(func() {
		promptAuditScheduler.reset()
		promptAuditOverflowLogScheduler.reset()
		promptAuditDecisionCache.reset()
		promptAuditNow = time.Now
		setPromptAuditLogWriter(model.CreatePromptAuditLog)
		SetPromptAuditTester(nil)
		model.DB = oldDB
		require.NoError(t, promptauditsetting.Replace(oldSettings))
	})
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/chat/completions", nil)
	c.Set(string(constant.ContextKeyRequestStartTime), time.Now().Add(-10*time.Millisecond))
	c.Set(string(constant.ContextKeyUserName), "alice")
	c.Set(common.RequestIdKey, "request-123")
	return c
}

func promptAuditUserViolationCount(t *testing.T, userID int) int {
	t.Helper()
	var count int
	require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", userID).Pluck("violation_count", &count).Error)
	return count
}
