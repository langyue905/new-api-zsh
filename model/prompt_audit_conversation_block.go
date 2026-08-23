package model

import (
	"context"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type PromptAuditConversationBlock struct {
	ID                      int                 `json:"id" gorm:"primaryKey"`
	UserID                  int                 `json:"user_id" gorm:"uniqueIndex:idx_prompt_audit_conversation_block,priority:1"`
	PrefixHash              string              `json:"prefix_hash" gorm:"type:varchar(64);uniqueIndex:idx_prompt_audit_conversation_block,priority:2"`
	SourceRequestID         string              `json:"source_request_id"`
	SourceReason            PromptAuditLongText `json:"source_reason"`
	BlockedRequestStartedAt int64               `json:"blocked_request_started_at"`
	Active                  bool                `json:"active" gorm:"index"`
	ReleasedAt              int64               `json:"released_at"`
	CreatedAt               int64               `json:"created_at" gorm:"autoCreateTime:false"`
	UpdatedAt               int64               `json:"updated_at" gorm:"autoUpdateTime:false"`
}

func (PromptAuditConversationBlock) TableName() string {
	return "prompt_audit_conversation_blocks"
}

func MarkPromptAuditConversationBlocked(ctx context.Context, userID int, prefixHash, requestID, reason string, requestStartedAt time.Time) (bool, error) {
	now := time.Now()
	requestStartedAtNano := requestStartedAt.UnixNano()
	block := PromptAuditConversationBlock{
		UserID: userID, PrefixHash: prefixHash, SourceRequestID: requestID,
		SourceReason: PromptAuditLongText(reason), BlockedRequestStartedAt: requestStartedAtNano,
		Active: true, CreatedAt: now.Unix(), UpdatedAt: now.Unix(), ReleasedAt: now.UnixNano() - 1,
	}
	result := DB.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(&block)
	if result.Error != nil {
		return false, result.Error
	}
	if result.RowsAffected == 1 {
		return true, nil
	}

	result = DB.WithContext(ctx).Model(&PromptAuditConversationBlock{}).
		Where("user_id = ? AND prefix_hash = ? AND active = ? AND released_at < ?", userID, prefixHash, false, requestStartedAtNano).
		Updates(map[string]any{
			"source_request_id":          requestID,
			"source_reason":              PromptAuditLongText(reason),
			"blocked_request_started_at": requestStartedAtNano,
			"active":                     true,
			"updated_at":                 now.Unix(),
		})
	if result.Error != nil {
		return false, result.Error
	}
	return result.RowsAffected == 1, nil
}

func IsPromptAuditConversationBlocked(ctx context.Context, userID int, prefixHash string) (bool, error) {
	var count int64
	err := DB.WithContext(ctx).Model(&PromptAuditConversationBlock{}).
		Where("user_id = ? AND prefix_hash = ? AND active = ?", userID, prefixHash, true).
		Count(&count).Error
	return count > 0, err
}

func CheckPromptAuditConversationBlock(ctx context.Context, userID int, prefixHash string) (*PromptAuditConversationBlock, bool, error) {
	var block PromptAuditConversationBlock
	err := DB.WithContext(ctx).Where("user_id = ? AND prefix_hash = ?", userID, prefixHash).First(&block).Error
	if err == gorm.ErrRecordNotFound {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return &block, block.Active, nil
}

func GetActivePromptAuditConversationBlock(ctx context.Context, userID int, prefixHash string) (*PromptAuditConversationBlock, error) {
	var block PromptAuditConversationBlock
	err := DB.WithContext(ctx).
		Where("user_id = ? AND prefix_hash = ? AND active = ?", userID, prefixHash, true).
		First(&block).Error
	if err != nil {
		return nil, err
	}
	return &block, nil
}

func IsPromptAuditConversationBlockSourceActive(ctx context.Context, userID int, prefixHash, sourceRequestID string) (bool, error) {
	var count int64
	err := DB.WithContext(ctx).Model(&PromptAuditConversationBlock{}).
		Where("user_id = ? AND prefix_hash = ? AND source_request_id = ? AND active = ?", userID, prefixHash, sourceRequestID, true).
		Count(&count).Error
	return count > 0, err
}

func ReleasePromptAuditConversationBlock(ctx context.Context, userID int, prefixHash string, releasedAt time.Time) (bool, error) {
	result := DB.WithContext(ctx).Model(&PromptAuditConversationBlock{}).
		Where("user_id = ? AND prefix_hash = ? AND active = ?", userID, prefixHash, true).
		Updates(map[string]any{
			"active":      false,
			"released_at": releasedAt.UnixNano(),
			"updated_at":  releasedAt.Unix(),
		})
	return result.RowsAffected > 0, result.Error
}

func ReleasePromptAuditConversationBlockSource(ctx context.Context, userID int, prefixHash, sourceRequestID string, releasedAt time.Time) (bool, error) {
	result := DB.WithContext(ctx).Model(&PromptAuditConversationBlock{}).
		Where("user_id = ? AND prefix_hash = ? AND source_request_id = ? AND active = ?", userID, prefixHash, sourceRequestID, true).
		Updates(map[string]any{
			"active":      false,
			"released_at": releasedAt.UnixNano(),
			"updated_at":  releasedAt.Unix(),
		})
	return result.RowsAffected > 0, result.Error
}
