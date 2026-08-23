package model

import (
	"context"
	"math"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupPromptAuditLogDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+strings.ReplaceAll(t.Name(), "/", "_")+"?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&PromptAuditLog{}))
	oldDB := DB
	oldDatabaseType := common.MainDatabaseType()
	DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	t.Cleanup(func() {
		DB = oldDB
		common.SetMainDatabaseType(oldDatabaseType)
	})
	return db
}

func TestQueryPromptAuditLogsFiltersAndSummarizesByRunes(t *testing.T) {
	db := setupPromptAuditLogDB(t)
	confidence := 0.91
	prompt := strings.Repeat("界", 201) + "tail"
	reason := strings.Repeat("理", 201) + "tail"
	require.NoError(t, db.Create(&PromptAuditLog{
		CreatedAt: 20, Action: PromptAuditActionBlocked, Confidence: &confidence,
		UserID: 7, Username: "alice", Group: "vip", Model: "m", Prompt: PromptAuditText(prompt),
		Reason: PromptAuditText(reason), DurationMs: 12, Mode: "blocking", ActuallyBlocked: true,
		RequestID: "req-1", AuditModelOutput: PromptAuditText(" raw model output "),
	}).Error)
	require.NoError(t, db.Create(&PromptAuditLog{CreatedAt: 10, Action: PromptAuditActionAllowed, UserID: 8, Prompt: PromptAuditText("safe")}).Error)

	items, total, err := QueryPromptAuditLogs(context.Background(), PromptAuditLogQuery{
		Action: PromptAuditActionBlocked, UserID: 7, Page: 1, PageSize: 10,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	require.Len(t, items, 1)
	assert.Equal(t, strings.Repeat("界", 200), items[0].PromptSummary)
	assert.NotContains(t, items[0].PromptSummary, "tail")
	assert.Equal(t, strings.Repeat("理", 200), items[0].ReasonSummary)
	assert.NotContains(t, items[0].ReasonSummary, "tail")
	listJSON, err := common.Marshal(items[0])
	require.NoError(t, err)
	assert.NotContains(t, string(listJSON), "audit_model_output")
	assert.NotContains(t, string(listJSON), `"reason":`)
	assert.Contains(t, string(listJSON), `"reason_summary":`)

	detail, err := GetPromptAuditLog(context.Background(), items[0].ID)
	require.NoError(t, err)
	assert.Equal(t, PromptAuditText(prompt), detail.Prompt)
	assert.Equal(t, PromptAuditText(reason), detail.Reason)
	assert.Equal(t, PromptAuditText(" raw model output "), detail.AuditModelOutput)
}

func TestQueryPromptAuditLogsSelectsOnlySummariesForLargeTextFields(t *testing.T) {
	db := setupPromptAuditLogDB(t)
	require.NoError(t, db.Create(&PromptAuditLog{
		CreatedAt: 1, Action: PromptAuditActionAllowed, Prompt: "visible prompt", Reason: "full private reason", AuditModelOutput: "large private raw output",
		CacheSourceRequestID: "private source request", CacheSourceReason: "private source reason",
		BlockSourceRequestID: "private block request", BlockSourceReason: "private block reason",
	}).Error)
	var querySQL string
	callbackName := "test:capture_prompt_audit_list_query"
	require.NoError(t, db.Callback().Query().After("gorm:query").Register(callbackName, func(tx *gorm.DB) {
		if tx.Statement.Table == (PromptAuditLog{}).TableName() && strings.Contains(strings.ToLower(tx.Statement.SQL.String()), "order by") {
			querySQL = tx.Statement.SQL.String()
		}
	}))
	t.Cleanup(func() { _ = db.Callback().Query().Remove(callbackName) })

	items, total, err := QueryPromptAuditLogs(context.Background(), PromptAuditLogQuery{Page: 1, PageSize: 20})

	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	require.Len(t, items, 1)
	assert.NotEmpty(t, querySQL)
	lowerSQL := strings.ToLower(querySQL)
	assert.NotContains(t, lowerSQL, "audit_model_output")
	assert.NotContains(t, lowerSQL, "cache_source_request_id")
	assert.NotContains(t, lowerSQL, "cache_source_reason")
	assert.NotContains(t, lowerSQL, "block_source_request_id")
	assert.NotContains(t, lowerSQL, "block_source_reason")
	assert.NotContains(t, lowerSQL, "select *")
	assert.Contains(t, lowerSQL, "reason_summary")
	assert.Contains(t, lowerSQL, "prompt_summary")
}

func TestQueryPromptAuditLogsCombinesActionUserAndInclusiveTimeRange(t *testing.T) {
	db := setupPromptAuditLogDB(t)
	logs := []PromptAuditLog{
		{CreatedAt: 99, Action: PromptAuditActionBlocked, UserID: 7, Prompt: "before"},
		{CreatedAt: 100, Action: PromptAuditActionBlocked, UserID: 7, Prompt: "start"},
		{CreatedAt: 150, Action: PromptAuditActionAllowed, UserID: 7, Prompt: "wrong-action"},
		{CreatedAt: 175, Action: PromptAuditActionBlocked, UserID: 8, Prompt: "wrong-user"},
		{CreatedAt: 200, Action: PromptAuditActionBlocked, UserID: 7, Prompt: "end"},
		{CreatedAt: 201, Action: PromptAuditActionBlocked, UserID: 7, Prompt: "after"},
	}
	require.NoError(t, db.Create(&logs).Error)
	start, end := int64(100), int64(200)

	items, total, err := QueryPromptAuditLogs(context.Background(), PromptAuditLogQuery{
		Action: PromptAuditActionBlocked, UserID: 7, StartTimestamp: &start, EndTimestamp: &end,
		Page: 1, PageSize: 20,
	})

	require.NoError(t, err)
	assert.Equal(t, int64(2), total)
	require.Len(t, items, 2)
	assert.Equal(t, int64(200), items[0].CreatedAt)
	assert.Equal(t, int64(100), items[1].CreatedAt)
}

func TestCleanupPromptAuditLogsOnceUsesSeparateRetentionWindows(t *testing.T) {
	db := setupPromptAuditLogDB(t)
	now := time.Unix(20*86400, 0)
	logs := []PromptAuditLog{
		{CreatedAt: now.Add(-25 * time.Hour).Unix(), Action: PromptAuditActionAllowed},
		{CreatedAt: now.Add(-23 * time.Hour).Unix(), Action: PromptAuditActionAllowed},
		{CreatedAt: now.Add(-8 * 24 * time.Hour).Unix(), Action: PromptAuditActionBlocked},
		{CreatedAt: now.Add(-6 * 24 * time.Hour).Unix(), Action: PromptAuditActionBlocked},
	}
	require.NoError(t, db.Create(&logs).Error)

	result, err := CleanupPromptAuditLogsOnce(context.Background(), now, 1, 7, 100)
	require.NoError(t, err)
	assert.Equal(t, int64(1), result.AllowedDeleted)
	assert.Equal(t, int64(1), result.BlockedDeleted)

	var remaining []PromptAuditLog
	require.NoError(t, db.Order("id").Find(&remaining).Error)
	require.Len(t, remaining, 2)
	assert.Equal(t, int64(now.Add(-23*time.Hour).Unix()), remaining[0].CreatedAt)
	assert.Equal(t, int64(now.Add(-6*24*time.Hour).Unix()), remaining[1].CreatedAt)
}

func TestCreatePromptAuditLogRejectsInvalidAction(t *testing.T) {
	setupPromptAuditLogDB(t)
	err := CreatePromptAuditLog(context.Background(), &PromptAuditLog{Action: "unknown"})
	assert.Error(t, err)
}

func TestCreatePromptAuditLogRejectsNonFiniteConfidence(t *testing.T) {
	setupPromptAuditLogDB(t)
	for _, confidence := range []float64{math.NaN(), math.Inf(1), math.Inf(-1)} {
		err := CreatePromptAuditLog(context.Background(), &PromptAuditLog{
			Action: PromptAuditActionAllowed, Confidence: &confidence,
		})
		assert.Error(t, err)
	}
}

func TestPromptAuditTextUsesLongTextOnlyForMySQL(t *testing.T) {
	assert.IsType(t, PromptAuditLongText(""), PromptAuditLog{}.Reason)
	assert.IsType(t, PromptAuditLongText(""), PromptAuditLog{}.CacheSourceReason)
	assert.IsType(t, PromptAuditLongText(""), PromptAuditLog{}.BlockSourceReason)
	assert.Equal(t, "LONGTEXT", promptAuditTextDatabaseType("mysql"))
	assert.Equal(t, "TEXT", promptAuditTextDatabaseType("postgres"))
	assert.Equal(t, "TEXT", promptAuditTextDatabaseType("sqlite"))
}

func TestCleanupPromptAuditLogsDeletesAcrossMultipleBatches(t *testing.T) {
	db := setupPromptAuditLogDB(t)
	now := time.Unix(20*86400, 0)
	logs := make([]PromptAuditLog, 0, 7)
	for range 4 {
		logs = append(logs, PromptAuditLog{CreatedAt: now.Add(-2 * 24 * time.Hour).Unix(), Action: PromptAuditActionAllowed})
	}
	for range 3 {
		logs = append(logs, PromptAuditLog{CreatedAt: now.Add(-8 * 24 * time.Hour).Unix(), Action: PromptAuditActionBlocked})
	}
	require.NoError(t, db.Create(&logs).Error)

	result, err := CleanupPromptAuditLogs(context.Background(), now, 1, 7, 2)

	require.NoError(t, err)
	assert.Equal(t, int64(4), result.AllowedDeleted)
	assert.Equal(t, int64(3), result.BlockedDeleted)
}
