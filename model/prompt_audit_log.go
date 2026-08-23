package model

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	promptauditsetting "github.com/QuantumNous/new-api/setting/prompt_audit_setting"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

const (
	PromptAuditActionAllowed = "allowed"
	PromptAuditActionBlocked = "blocked"
)

type PromptAuditLog struct {
	ID                   int                 `json:"id" gorm:"primaryKey"`
	CreatedAt            int64               `json:"created_at" gorm:"index"`
	Action               string              `json:"action" gorm:"type:varchar(16);index"`
	Confidence           *float64            `json:"confidence"`
	UserID               int                 `json:"user_id" gorm:"index"`
	Username             string              `json:"username"`
	Group                string              `json:"group"`
	Model                string              `json:"model"`
	Prompt               PromptAuditText     `json:"prompt"`
	AuditModelOutput     PromptAuditText     `json:"audit_model_output"`
	Reason               PromptAuditLongText `json:"reason"`
	DurationMs           int64               `json:"duration_ms"`
	Mode                 string              `json:"mode"`
	ActuallyBlocked      bool                `json:"actually_blocked"`
	RequestID            string              `json:"request_id"`
	CacheSourceRequestID string              `json:"cache_source_request_id"`
	CacheSourceReason    PromptAuditLongText `json:"cache_source_reason"`
	BlockSourceRequestID string              `json:"block_source_request_id"`
	BlockSourceReason    PromptAuditLongText `json:"block_source_reason"`
}

type PromptAuditLongText string

type PromptAuditText = PromptAuditLongText

func (PromptAuditLongText) GormDataType() string { return "text" }

func (PromptAuditLongText) GormDBDataType(db *gorm.DB, _ *schema.Field) string {
	return promptAuditTextDatabaseType(db.Dialector.Name())
}

func promptAuditTextDatabaseType(dialect string) string {
	if dialect == "mysql" {
		return "LONGTEXT"
	}
	return "TEXT"
}

const promptAuditCleanupBatchSize = 1000

func (PromptAuditLog) TableName() string { return "prompt_audit_logs" }

func migratePromptAuditPromptToLongText() error {
	if !common.UsingMainDatabase(common.DatabaseTypeMySQL) || !DB.Migrator().HasTable(&PromptAuditLog{}) || !DB.Migrator().HasColumn(&PromptAuditLog{}, "prompt") {
		return nil
	}
	var columnType string
	if err := DB.Raw(`SELECT COLUMN_TYPE FROM information_schema.columns
		WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
		"prompt_audit_logs", "prompt").Scan(&columnType).Error; err != nil {
		return fmt.Errorf("failed to inspect prompt_audit_logs.prompt: %w", err)
	}
	if strings.EqualFold(columnType, "longtext") {
		return nil
	}
	if err := DB.Exec("ALTER TABLE prompt_audit_logs MODIFY COLUMN prompt LONGTEXT").Error; err != nil {
		return fmt.Errorf("failed to migrate prompt_audit_logs.prompt to LONGTEXT: %w", err)
	}
	return nil
}

type PromptAuditLogListItem struct {
	ID              int      `json:"id"`
	CreatedAt       int64    `json:"created_at"`
	Action          string   `json:"action"`
	Confidence      *float64 `json:"confidence"`
	UserID          int      `json:"user_id"`
	Username        string   `json:"username"`
	Group           string   `json:"group"`
	Model           string   `json:"model"`
	PromptSummary   string   `json:"prompt_summary"`
	ReasonSummary   string   `json:"reason_summary"`
	DurationMs      int64    `json:"duration_ms"`
	Mode            string   `json:"mode"`
	ActuallyBlocked bool     `json:"actually_blocked"`
	RequestID       string   `json:"request_id"`
}

type PromptAuditLogQuery struct {
	Action         string
	UserID         int
	StartTimestamp *int64
	EndTimestamp   *int64
	Page           int
	PageSize       int
}

type PromptAuditCleanupResult struct {
	AllowedDeleted int64 `json:"allowed_deleted"`
	BlockedDeleted int64 `json:"blocked_deleted"`
}

func CreatePromptAuditLog(ctx context.Context, log *PromptAuditLog) error {
	if log == nil {
		return errors.New("prompt audit log is required")
	}
	if log.Action != PromptAuditActionAllowed && log.Action != PromptAuditActionBlocked {
		return errors.New("prompt audit action must be allowed or blocked")
	}
	if log.Confidence != nil && (math.IsNaN(*log.Confidence) || math.IsInf(*log.Confidence, 0) || *log.Confidence < 0 || *log.Confidence > 1) {
		return errors.New("prompt audit confidence must be between 0 and 1")
	}
	if log.CreatedAt == 0 {
		log.CreatedAt = time.Now().Unix()
	}
	return DB.WithContext(ctx).Create(log).Error
}

func QueryPromptAuditLogs(ctx context.Context, query PromptAuditLogQuery) ([]PromptAuditLogListItem, int64, error) {
	page := query.Page
	if page < 1 {
		page = 1
	}
	pageSize := query.PageSize
	if pageSize < 1 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}
	tx := DB.WithContext(ctx).Model(&PromptAuditLog{})
	if query.Action != "" {
		if query.Action != PromptAuditActionAllowed && query.Action != PromptAuditActionBlocked {
			return nil, 0, errors.New("invalid prompt audit action")
		}
		tx = tx.Where("action = ?", query.Action)
	}
	if query.UserID > 0 {
		tx = tx.Where("user_id = ?", query.UserID)
	}
	if query.StartTimestamp != nil {
		tx = tx.Where("created_at >= ?", *query.StartTimestamp)
	}
	if query.EndTimestamp != nil {
		tx = tx.Where("created_at <= ?", *query.EndTimestamp)
	}
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	groupColumn := "`group`"
	if DB.Dialector.Name() == "postgres" {
		groupColumn = `"group"`
	}
	columns := "id, created_at, action, confidence, user_id, username, " + groupColumn + ", model, " +
		"SUBSTR(prompt, 1, 200) AS prompt_summary, SUBSTR(reason, 1, 200) AS reason_summary, " +
		"duration_ms, mode, actually_blocked, request_id"
	var items []PromptAuditLogListItem
	if err := tx.Select(columns).Order("created_at DESC, id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&items).Error; err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

func GetPromptAuditLog(ctx context.Context, id int) (*PromptAuditLog, error) {
	var log PromptAuditLog
	if err := DB.WithContext(ctx).First(&log, id).Error; err != nil {
		return nil, err
	}
	return &log, nil
}

func CleanupPromptAuditLogsOnce(ctx context.Context, now time.Time, allowedRetentionDays, blockedRetentionDays, batchSize int) (PromptAuditCleanupResult, error) {
	if allowedRetentionDays < 1 || blockedRetentionDays < 1 {
		return PromptAuditCleanupResult{}, errors.New("retention days must be positive")
	}
	if batchSize < 1 {
		batchSize = 1000
	}
	allowed, err := deletePromptAuditLogBatch(ctx, PromptAuditActionAllowed, now.AddDate(0, 0, -allowedRetentionDays).Unix(), batchSize)
	if err != nil {
		return PromptAuditCleanupResult{}, err
	}
	blocked, err := deletePromptAuditLogBatch(ctx, PromptAuditActionBlocked, now.AddDate(0, 0, -blockedRetentionDays).Unix(), batchSize)
	if err != nil {
		return PromptAuditCleanupResult{AllowedDeleted: allowed}, err
	}
	return PromptAuditCleanupResult{AllowedDeleted: allowed, BlockedDeleted: blocked}, nil
}

func CleanupPromptAuditLogs(ctx context.Context, now time.Time, allowedRetentionDays, blockedRetentionDays, batchSize int) (PromptAuditCleanupResult, error) {
	if batchSize < 1 {
		batchSize = promptAuditCleanupBatchSize
	}
	total := PromptAuditCleanupResult{}
	for {
		result, err := CleanupPromptAuditLogsOnce(ctx, now, allowedRetentionDays, blockedRetentionDays, batchSize)
		total.AllowedDeleted += result.AllowedDeleted
		total.BlockedDeleted += result.BlockedDeleted
		if err != nil {
			return total, err
		}
		if result.AllowedDeleted < int64(batchSize) && result.BlockedDeleted < int64(batchSize) {
			return total, nil
		}
	}
}

func deletePromptAuditLogBatch(ctx context.Context, action string, cutoff int64, batchSize int) (int64, error) {
	var ids []int
	if err := DB.WithContext(ctx).Model(&PromptAuditLog{}).
		Where("action = ? AND created_at < ?", action, cutoff).
		Order("id").Limit(batchSize).Pluck("id", &ids).Error; err != nil {
		return 0, err
	}
	if len(ids) == 0 {
		return 0, nil
	}
	result := DB.WithContext(ctx).Where("id IN ?", ids).Delete(&PromptAuditLog{})
	return result.RowsAffected, result.Error
}

func StartPromptAuditLogCleanup() {
	if !common.IsMasterNode {
		return
	}
	go func() {
		runPromptAuditLogCleanup()
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			runPromptAuditLogCleanup()
		}
	}()
}

func runPromptAuditLogCleanup() {
	settings := promptauditsetting.Get()
	if _, err := CleanupPromptAuditLogs(context.Background(), time.Now(), settings.AllowedRetentionDays, settings.BlockedRetentionDays, promptAuditCleanupBatchSize); err != nil {
		common.SysError("failed to clean prompt audit logs: " + err.Error())
	}
}
