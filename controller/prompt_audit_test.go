package controller

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	promptauditsetting "github.com/QuantumNous/new-api/setting/prompt_audit_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type promptAuditTestDouble struct {
	settings promptauditsetting.Settings
	prompt   string
}

func (d *promptAuditTestDouble) Test(_ context.Context, settings promptauditsetting.Settings, prompt string) (PromptAuditTestResult, error) {
	d.settings = settings
	d.prompt = prompt
	return PromptAuditTestResult{Confidence: 0.12, Reason: "ok", AuditModelOutput: "must-not-leak"}, nil
}

func setupPromptAuditController(t *testing.T) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open("file:"+strings.ReplaceAll(t.Name(), "/", "_")+"?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Option{}, &model.PromptAuditLog{}, &model.PromptAuditConversationBlock{}))
	oldDB := model.DB
	model.DB = db
	oldPromptSettings := promptauditsetting.Get()
	promptAuditDecisionCache.reset()
	common.OptionMapRWMutex.Lock()
	oldOptions := common.OptionMap
	common.OptionMap = map[string]string{}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		model.DB = oldDB
		common.OptionMapRWMutex.Lock()
		common.OptionMap = oldOptions
		common.OptionMapRWMutex.Unlock()
		require.NoError(t, promptauditsetting.Replace(oldPromptSettings))
		promptAuditDecisionCache.reset()
		SetPromptAuditTester(nil)
	})
	r := gin.New()
	r.GET("/settings", GetPromptAuditSettings)
	r.PUT("/settings", UpdatePromptAuditSettings)
	r.POST("/test", TestPromptAuditSettings)
	r.GET("/logs", GetPromptAuditLogs)
	r.POST("/logs/cleanup", CleanupPromptAuditLogs)
	r.GET("/logs/:id", GetPromptAuditLog)
	r.DELETE("/logs/:id/conversation-block", ReleasePromptAuditConversationBlock)
	return r
}

func TestPromptAuditSettingsAPIHidesAndPreservesKey(t *testing.T) {
	r := setupPromptAuditController(t)
	require.NoError(t, promptauditsetting.Update(promptauditsetting.UpdateRequest{APIKey: "saved-secret"}))

	get := httptest.NewRecorder()
	r.ServeHTTP(get, httptest.NewRequest(http.MethodGet, "/settings", nil))
	assert.Equal(t, http.StatusOK, get.Code)
	assert.NotContains(t, get.Body.String(), "saved-secret")
	assert.NotContains(t, get.Body.String(), `"api_key"`)
	assert.Contains(t, get.Body.String(), `"key_configured":true`)

	put := httptest.NewRecorder()
	body := `{"threshold":0.8,"api_key":""}`
	req := httptest.NewRequest(http.MethodPut, "/settings", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(put, req)
	assert.Equal(t, http.StatusOK, put.Code)
	assert.Equal(t, "saved-secret", promptauditsetting.Get().APIKey)
	assert.Equal(t, 0.8, promptauditsetting.Get().Threshold)
}

func TestPromptAuditSettingsAPIClearsAllowCacheAfterSuccessfulSave(t *testing.T) {
	r := setupPromptAuditController(t)
	promptAuditDecisionCache.store("existing-policy-entry", promptAuditAllowCacheSource{})

	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPut, "/settings", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(recorder, req)

	assert.Equal(t, http.StatusOK, recorder.Code)
	_, hit := promptAuditDecisionCache.hit("existing-policy-entry")
	assert.False(t, hit)
}

func TestPromptAuditSettingsAPIRejectsUnknownGroup(t *testing.T) {
	r := setupPromptAuditController(t)
	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPut, "/settings", strings.NewReader(`{"audit_groups":["does-not-exist"]}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(recorder, req)
	assert.Equal(t, http.StatusBadRequest, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "does-not-exist")
}

func TestPromptAuditSettingsAPIRemovesPreviouslySavedUnknownGroup(t *testing.T) {
	r := setupPromptAuditController(t)
	unknownGroups := []string{"does-not-exist"}
	require.NoError(t, promptauditsetting.Update(promptauditsetting.UpdateRequest{AuditGroups: &unknownGroups}))

	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPut, "/settings", strings.NewReader(`{"audit_groups":[]}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(recorder, req)

	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Empty(t, promptauditsetting.Get().AuditGroups)
}

func TestPromptAuditTestAPIUsesSavedKeyWhenRequestKeyIsEmpty(t *testing.T) {
	r := setupPromptAuditController(t)
	require.NoError(t, promptauditsetting.Update(promptauditsetting.UpdateRequest{APIKey: "saved-secret"}))
	tester := &promptAuditTestDouble{}
	SetPromptAuditTester(tester)

	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/test", strings.NewReader(`{"prompt":"hello","api_key":"","sampling_rate":0}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(recorder, req)

	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(t, "saved-secret", tester.settings.APIKey)
	assert.Equal(t, "hello", tester.prompt)
	assert.Zero(t, tester.settings.SamplingRate)
	assert.Contains(t, recorder.Body.String(), `"confidence":0.12`)
	assert.Contains(t, recorder.Body.String(), `"blocked":false`)
	assert.NotContains(t, recorder.Body.String(), "audit_model_output")
}

func TestPromptAuditTestAPIReportsThresholdDecision(t *testing.T) {
	r := setupPromptAuditController(t)
	SetPromptAuditTester(&promptAuditTestDouble{})

	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/test", strings.NewReader(`{"prompt":"hello","threshold":0.12}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(recorder, req)

	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), `"blocked":true`)
}

func TestPromptAuditLogListOmitsFullPromptAndDetailIncludesIt(t *testing.T) {
	r := setupPromptAuditController(t)
	reason := strings.Repeat("理", 250)
	log := model.PromptAuditLog{
		CreatedAt: 1, Action: model.PromptAuditActionAllowed,
		Prompt: model.PromptAuditText(strings.Repeat("x", 250)), Reason: model.PromptAuditText(reason),
		AuditModelOutput: "raw-result-secret", UserID: 9,
		CacheSourceRequestID: "source-request-secret", CacheSourceReason: "source-reason-secret",
		BlockSourceRequestID: "block-request-secret", BlockSourceReason: "block-reason-secret",
	}
	require.NoError(t, model.DB.Create(&log).Error)

	list := httptest.NewRecorder()
	r.ServeHTTP(list, httptest.NewRequest(http.MethodGet, "/logs?action=allowed&user_id=9", nil))
	assert.Equal(t, http.StatusOK, list.Code)
	assert.NotContains(t, list.Body.String(), strings.Repeat("x", 250))
	assert.Contains(t, list.Body.String(), strings.Repeat("x", 200))
	assert.NotContains(t, list.Body.String(), reason)
	assert.Contains(t, list.Body.String(), strings.Repeat("理", 200))
	assert.Contains(t, list.Body.String(), `"reason_summary":`)
	assert.NotContains(t, list.Body.String(), `"reason":`)
	assert.NotContains(t, list.Body.String(), "raw-result-secret")
	assert.NotContains(t, list.Body.String(), "audit_model_output")
	assert.NotContains(t, list.Body.String(), "source-request-secret")
	assert.NotContains(t, list.Body.String(), "source-reason-secret")
	assert.NotContains(t, list.Body.String(), "cache_source_request_id")
	assert.NotContains(t, list.Body.String(), "cache_source_reason")
	assert.NotContains(t, list.Body.String(), "block-request-secret")
	assert.NotContains(t, list.Body.String(), "block-reason-secret")
	assert.NotContains(t, list.Body.String(), "block_source_request_id")
	assert.NotContains(t, list.Body.String(), "block_source_reason")

	detail := httptest.NewRecorder()
	r.ServeHTTP(detail, httptest.NewRequest(http.MethodGet, "/logs/"+strings.TrimSpace(common.Interface2String(log.ID)), nil))
	assert.Equal(t, http.StatusOK, detail.Code)
	assert.Contains(t, detail.Body.String(), strings.Repeat("x", 250))
	assert.Contains(t, detail.Body.String(), reason)
	assert.Contains(t, detail.Body.String(), `"audit_model_output":"raw-result-secret"`)
	assert.Contains(t, detail.Body.String(), `"cache_source_request_id":"source-request-secret"`)
	assert.Contains(t, detail.Body.String(), `"cache_source_reason":"source-reason-secret"`)
	assert.Contains(t, detail.Body.String(), `"block_source_request_id":"block-request-secret"`)
	assert.Contains(t, detail.Body.String(), `"block_source_reason":"block-reason-secret"`)
}

func TestPromptAuditLogDetailReportsActiveConversationBlockAndReleaseIsIdempotent(t *testing.T) {
	r := setupPromptAuditController(t)
	log := model.PromptAuditLog{Action: model.PromptAuditActionBlocked, UserID: 7, Prompt: "user: danger", RequestID: "current"}
	require.NoError(t, model.DB.Create(&log).Error)
	hash := promptAuditConversationHash(string(log.Prompt))
	created, err := model.MarkPromptAuditConversationBlocked(context.Background(), log.UserID, hash, "current", "risk", time.Now().Add(-time.Second))
	require.NoError(t, err)
	require.True(t, created)

	detail := httptest.NewRecorder()
	r.ServeHTTP(detail, httptest.NewRequest(http.MethodGet, "/logs/"+strconv.Itoa(log.ID), nil))
	assert.Equal(t, http.StatusOK, detail.Code)
	assert.Contains(t, detail.Body.String(), `"conversation_blocked":true`)

	for index := range 2 {
		release := httptest.NewRecorder()
		r.ServeHTTP(release, httptest.NewRequest(http.MethodDelete, "/logs/"+strconv.Itoa(log.ID)+"/conversation-block", nil))
		assert.Equal(t, http.StatusOK, release.Code)
		if index == 0 {
			assert.Contains(t, release.Body.String(), `"released":true`)
		} else {
			assert.Contains(t, release.Body.String(), `"released":false`)
		}
	}

	detail = httptest.NewRecorder()
	r.ServeHTTP(detail, httptest.NewRequest(http.MethodGet, "/logs/"+strconv.Itoa(log.ID), nil))
	assert.Contains(t, detail.Body.String(), `"conversation_blocked":false`)
}

func TestPromptAuditOldBlockedLogCannotReleaseNewConversationMarker(t *testing.T) {
	r := setupPromptAuditController(t)
	oldLog := model.PromptAuditLog{Action: model.PromptAuditActionBlocked, Confidence: new(float64), UserID: 7, Prompt: "user: danger", RequestID: "old"}
	require.NoError(t, model.DB.Create(&oldLog).Error)
	hash := promptAuditConversationHash(string(oldLog.Prompt))
	created, err := model.MarkPromptAuditConversationBlocked(context.Background(), oldLog.UserID, hash, "new-source", "risk", time.Now())
	require.NoError(t, err)
	require.True(t, created)

	detail := httptest.NewRecorder()
	r.ServeHTTP(detail, httptest.NewRequest(http.MethodGet, "/logs/"+strconv.Itoa(oldLog.ID), nil))
	assert.Contains(t, detail.Body.String(), `"conversation_blocked":false`)

	release := httptest.NewRecorder()
	r.ServeHTTP(release, httptest.NewRequest(http.MethodDelete, "/logs/"+strconv.Itoa(oldLog.ID)+"/conversation-block", nil))
	assert.Equal(t, http.StatusOK, release.Code)
	assert.Contains(t, release.Body.String(), `"released":false`)
	active, err := model.IsPromptAuditConversationBlocked(context.Background(), oldLog.UserID, hash)
	require.NoError(t, err)
	assert.True(t, active)
}

func TestPromptAuditConversationBlockHitLogCanReleaseAfterSourceLogIsGone(t *testing.T) {
	r := setupPromptAuditController(t)
	hash := promptAuditConversationHash("user: danger")
	created, err := model.MarkPromptAuditConversationBlocked(context.Background(), 7, hash, "deleted-source", "risk", time.Now().Add(-time.Second))
	require.NoError(t, err)
	require.True(t, created)
	hitLog := model.PromptAuditLog{
		CreatedAt: time.Now().Unix(), Action: model.PromptAuditActionBlocked, Confidence: nil,
		UserID: 7, Prompt: "user: danger", RequestID: "later-hit", Reason: model.PromptAuditLongText(promptAuditConversationBlockReason),
	}
	require.NoError(t, model.DB.Create(&hitLog).Error)

	detail := httptest.NewRecorder()
	r.ServeHTTP(detail, httptest.NewRequest(http.MethodGet, "/logs/"+strconv.Itoa(hitLog.ID), nil))
	assert.Contains(t, detail.Body.String(), `"conversation_blocked":true`)
	release := httptest.NewRecorder()
	r.ServeHTTP(release, httptest.NewRequest(http.MethodDelete, "/logs/"+strconv.Itoa(hitLog.ID)+"/conversation-block", nil))
	assert.Contains(t, release.Body.String(), `"released":true`)
}

func TestPromptAuditConversationReleaseRejectsAllowedLog(t *testing.T) {
	r := setupPromptAuditController(t)
	log := model.PromptAuditLog{Action: model.PromptAuditActionAllowed, UserID: 7, Prompt: "user: safe"}
	require.NoError(t, model.DB.Create(&log).Error)

	recorder := httptest.NewRecorder()
	r.ServeHTTP(recorder, httptest.NewRequest(http.MethodDelete, "/logs/"+strconv.Itoa(log.ID)+"/conversation-block", nil))
	assert.Equal(t, http.StatusBadRequest, recorder.Code)
}

func TestPromptAuditManualCleanupUsesSavedRetentionAndReturnsTotals(t *testing.T) {
	r := setupPromptAuditController(t)
	allowedRetentionDays, blockedRetentionDays := 1, 7
	require.NoError(t, promptauditsetting.Update(promptauditsetting.UpdateRequest{
		AllowedRetentionDays: &allowedRetentionDays, BlockedRetentionDays: &blockedRetentionDays,
	}))
	now := time.Now()
	logs := []model.PromptAuditLog{
		{CreatedAt: now.Add(-48 * time.Hour).Unix(), Action: model.PromptAuditActionAllowed},
		{CreatedAt: now.Add(-8 * 24 * time.Hour).Unix(), Action: model.PromptAuditActionBlocked},
		{CreatedAt: now.Unix(), Action: model.PromptAuditActionAllowed},
	}
	require.NoError(t, model.DB.Create(&logs).Error)

	recorder := httptest.NewRecorder()
	r.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/logs/cleanup", nil))

	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), `"allowed_deleted":1`)
	assert.Contains(t, recorder.Body.String(), `"blocked_deleted":1`)
	var remaining int64
	require.NoError(t, model.DB.Model(&model.PromptAuditLog{}).Count(&remaining).Error)
	assert.Equal(t, int64(1), remaining)
}

func TestPromptAuditLogListNormalizesPaginationInResponse(t *testing.T) {
	r := setupPromptAuditController(t)

	tests := []struct {
		name string
		url  string
		page string
		size string
	}{
		{name: "zero values", url: "/logs?page=0&page_size=0", page: `"page":1`, size: `"page_size":20`},
		{name: "oversized page size", url: "/logs?page=2&page_size=101", page: `"page":2`, size: `"page_size":100`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			r.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, tt.url, nil))
			assert.Equal(t, http.StatusOK, recorder.Code)
			assert.Contains(t, recorder.Body.String(), tt.page)
			assert.Contains(t, recorder.Body.String(), tt.size)
		})
	}
}

func TestPromptAuditLogListFiltersInclusiveTimestampRange(t *testing.T) {
	r := setupPromptAuditController(t)
	logs := []model.PromptAuditLog{
		{CreatedAt: 99, Action: model.PromptAuditActionAllowed, UserID: 9, Prompt: "before"},
		{CreatedAt: 100, Action: model.PromptAuditActionAllowed, UserID: 9, Prompt: "start"},
		{CreatedAt: 200, Action: model.PromptAuditActionAllowed, UserID: 9, Prompt: "end"},
		{CreatedAt: 201, Action: model.PromptAuditActionAllowed, UserID: 9, Prompt: "after"},
	}
	require.NoError(t, model.DB.Create(&logs).Error)

	recorder := httptest.NewRecorder()
	r.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/logs?user_id=9&start_timestamp=100&end_timestamp=200", nil))

	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), `"total":2`)
	assert.Contains(t, recorder.Body.String(), `"created_at":100`)
	assert.Contains(t, recorder.Body.String(), `"created_at":200`)
	assert.NotContains(t, recorder.Body.String(), `"created_at":99`)
	assert.NotContains(t, recorder.Body.String(), `"created_at":201`)
}

func TestPromptAuditLogListRejectsInvalidTimestampRange(t *testing.T) {
	r := setupPromptAuditController(t)
	for _, query := range []string{
		"start_timestamp=",
		"end_timestamp=",
		"start_timestamp=-1",
		"end_timestamp=-1",
		"start_timestamp=abc",
		"end_timestamp=1.5",
		"start_timestamp=200&end_timestamp=100",
	} {
		recorder := httptest.NewRecorder()
		r.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/logs?"+query, nil))
		assert.Equal(t, http.StatusBadRequest, recorder.Code, query)
	}
}

func TestPromptAuditSettingsConcurrentPartialUpdatesDoNotLoseChanges(t *testing.T) {
	r := setupPromptAuditController(t)
	start := make(chan struct{})
	requests := []string{`{"threshold":0.73}`, `{"timeout_seconds":9}`}
	responses := make([]*httptest.ResponseRecorder, len(requests))
	var wg sync.WaitGroup
	for i, body := range requests {
		wg.Add(1)
		go func(i int, body string) {
			defer wg.Done()
			<-start
			responses[i] = httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPut, "/settings", strings.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			r.ServeHTTP(responses[i], req)
		}(i, body)
	}
	close(start)
	wg.Wait()
	for _, response := range responses {
		assert.Equal(t, http.StatusOK, response.Code)
	}

	settings := promptauditsetting.Get()
	assert.Equal(t, 0.73, settings.Threshold)
	assert.Equal(t, 9, settings.TimeoutSeconds)
	var threshold, timeout model.Option
	require.NoError(t, model.DB.First(&threshold, "key = ?", "prompt_audit_setting.threshold").Error)
	require.NoError(t, model.DB.First(&timeout, "key = ?", "prompt_audit_setting.timeout_seconds").Error)
	assert.Equal(t, "0.73", threshold.Value)
	assert.Equal(t, "9", timeout.Value)
	common.OptionMapRWMutex.RLock()
	assert.Equal(t, threshold.Value, common.OptionMap["prompt_audit_setting.threshold"])
	assert.Equal(t, timeout.Value, common.OptionMap["prompt_audit_setting.timeout_seconds"])
	common.OptionMapRWMutex.RUnlock()
}

func TestPromptAuditLogListValidatesActionBeforeDatabaseQuery(t *testing.T) {
	r := setupPromptAuditController(t)
	recorder := httptest.NewRecorder()
	r.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/logs?action=invalid", nil))
	assert.Equal(t, http.StatusBadRequest, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "invalid action")
}

func TestPromptAuditLogListDatabaseErrorUsesAPIError(t *testing.T) {
	r := setupPromptAuditController(t)
	sqlDB, err := model.DB.DB()
	require.NoError(t, err)
	require.NoError(t, sqlDB.Close())
	recorder := httptest.NewRecorder()
	r.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/logs?action=allowed", nil))
	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), `"success":false`)
}
