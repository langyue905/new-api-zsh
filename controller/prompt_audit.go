package controller

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	promptauditsetting "github.com/QuantumNous/new-api/setting/prompt_audit_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type PromptAuditTestResult = service.PromptAuditResult

type PromptAuditTestResponse struct {
	service.PromptAuditResult
	Blocked bool `json:"blocked"`
}

type PromptAuditLogDetailResponse struct {
	*model.PromptAuditLog
	ConversationBlocked bool `json:"conversation_blocked"`
}

type PromptAuditTester interface {
	Test(context.Context, promptauditsetting.Settings, string) (PromptAuditTestResult, error)
}

type PromptAuditTestRequest struct {
	promptauditsetting.UpdateRequest
	Prompt string `json:"prompt"`
}

var promptAuditTesterState struct {
	sync.RWMutex
	tester PromptAuditTester
}

func SetPromptAuditTester(tester PromptAuditTester) {
	promptAuditTesterState.Lock()
	promptAuditTesterState.tester = tester
	promptAuditTesterState.Unlock()
}

func GetPromptAuditSettings(c *gin.Context) { common.ApiSuccess(c, promptauditsetting.GetPublic()) }

func UpdatePromptAuditSettings(c *gin.Context) {
	var request promptauditsetting.UpdateRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		promptAuditBadRequest(c, "invalid request: "+err.Error())
		return
	}
	if _, err := promptauditsetting.ApplyUpdate(promptauditsetting.Get(), request); err != nil {
		promptAuditBadRequest(c, err.Error())
		return
	}
	badRequest := false
	err := promptauditsetting.UpdatePersisted(request, func(next promptauditsetting.Settings) error {
		for _, group := range next.AuditGroups {
			if !ratio_setting.ContainsGroupRatio(group) {
				badRequest = true
				return errors.New("unknown group: " + group)
			}
		}
		values, err := promptauditsetting.SettingsToMap(next)
		if err != nil {
			return err
		}
		options := make(map[string]string, len(values))
		for key, value := range values {
			options["prompt_audit_setting."+key] = value
		}
		return model.PersistOptionsBulk(options)
	})
	if err != nil {
		if badRequest {
			promptAuditBadRequest(c, err.Error())
		} else {
			common.ApiError(c, err)
		}
		return
	}
	promptAuditDecisionCache.reset()
	common.ApiSuccess(c, promptauditsetting.GetPublic())
}

func TestPromptAuditSettings(c *gin.Context) {
	var request PromptAuditTestRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		promptAuditBadRequest(c, "invalid request: "+err.Error())
		return
	}
	if strings.TrimSpace(request.Prompt) == "" {
		promptAuditBadRequest(c, "prompt is required")
		return
	}
	settings, err := promptauditsetting.ApplyUpdate(promptauditsetting.Get(), request.UpdateRequest)
	if err != nil {
		promptAuditBadRequest(c, err.Error())
		return
	}
	promptAuditTesterState.RLock()
	tester := promptAuditTesterState.tester
	promptAuditTesterState.RUnlock()
	if tester == nil {
		c.JSON(http.StatusNotImplemented, gin.H{"success": false, "message": "prompt audit tester is not configured"})
		return
	}
	result, err := tester.Test(c.Request.Context(), settings, request.Prompt)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, PromptAuditTestResponse{
		PromptAuditResult: result,
		Blocked:           result.Blocked(settings.Threshold),
	})
}

func GetPromptAuditLogs(c *gin.Context) {
	action := c.Query("action")
	if action != "" && action != model.PromptAuditActionAllowed && action != model.PromptAuditActionBlocked {
		promptAuditBadRequest(c, "invalid action")
		return
	}
	page, err := promptAuditQueryInt(c, "page", 1)
	if err != nil {
		promptAuditBadRequest(c, err.Error())
		return
	}
	pageSize, err := promptAuditQueryInt(c, "page_size", 20)
	if err != nil {
		promptAuditBadRequest(c, err.Error())
		return
	}
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	} else if pageSize > 100 {
		pageSize = 100
	}
	userID, err := promptAuditQueryInt(c, "user_id", 0)
	if err != nil {
		promptAuditBadRequest(c, err.Error())
		return
	}
	startTimestamp, err := promptAuditOptionalTimestamp(c, "start_timestamp")
	if err != nil {
		promptAuditBadRequest(c, err.Error())
		return
	}
	endTimestamp, err := promptAuditOptionalTimestamp(c, "end_timestamp")
	if err != nil {
		promptAuditBadRequest(c, err.Error())
		return
	}
	if startTimestamp != nil && endTimestamp != nil && *startTimestamp > *endTimestamp {
		promptAuditBadRequest(c, "start_timestamp must not exceed end_timestamp")
		return
	}
	items, total, err := model.QueryPromptAuditLogs(c.Request.Context(), model.PromptAuditLogQuery{
		Action: action, UserID: userID, StartTimestamp: startTimestamp, EndTimestamp: endTimestamp,
		Page: page, PageSize: pageSize,
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"items": items, "total": total, "page": page, "page_size": pageSize})
}

func promptAuditOptionalTimestamp(c *gin.Context, key string) (*int64, error) {
	value, present := c.GetQuery(key)
	if !present {
		return nil, nil
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil || parsed < 0 {
		return nil, errors.New("invalid " + key)
	}
	return &parsed, nil
}

func GetPromptAuditLog(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id < 1 {
		promptAuditBadRequest(c, "invalid log id")
		return
	}
	log, err := model.GetPromptAuditLog(c.Request.Context(), id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "prompt audit log not found"})
		return
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}
	conversationBlock, active, err := model.CheckPromptAuditConversationBlock(c.Request.Context(), log.UserID, promptAuditConversationHash(string(log.Prompt)))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	conversationBlocked := active && promptAuditLogCanReleaseConversationBlock(log, conversationBlock)
	common.ApiSuccess(c, PromptAuditLogDetailResponse{PromptAuditLog: log, ConversationBlocked: conversationBlocked})
}

func ReleasePromptAuditConversationBlock(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id < 1 {
		promptAuditBadRequest(c, "invalid log id")
		return
	}
	log, err := model.GetPromptAuditLog(c.Request.Context(), id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "prompt audit log not found"})
		return
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if log.Action != model.PromptAuditActionBlocked {
		promptAuditBadRequest(c, "only blocked prompt audit logs can release a conversation block")
		return
	}
	hash := promptAuditConversationHash(string(log.Prompt))
	conversationBlock, active, err := model.CheckPromptAuditConversationBlock(c.Request.Context(), log.UserID, hash)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !active || !promptAuditLogCanReleaseConversationBlock(log, conversationBlock) {
		common.ApiSuccess(c, gin.H{"released": false})
		return
	}
	released, err := model.ReleasePromptAuditConversationBlock(c.Request.Context(), log.UserID, hash, time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	promptAuditDecisionCache.removeConversation(log.UserID, string(log.Prompt))
	common.ApiSuccess(c, gin.H{"released": released})
}

func promptAuditLogCanReleaseConversationBlock(log *model.PromptAuditLog, block *model.PromptAuditConversationBlock) bool {
	if log == nil || block == nil || log.Action != model.PromptAuditActionBlocked {
		return false
	}
	if log.RequestID == block.SourceRequestID {
		return true
	}
	return log.Confidence == nil && string(log.Reason) == promptAuditConversationBlockReason && log.CreatedAt >= block.CreatedAt
}

func CleanupPromptAuditLogs(c *gin.Context) {
	settings := promptauditsetting.Get()
	result, err := model.CleanupPromptAuditLogs(
		c.Request.Context(), time.Now(), settings.AllowedRetentionDays, settings.BlockedRetentionDays, 1000,
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}

func promptAuditQueryInt(c *gin.Context, key string, fallback int) (int, error) {
	value := c.Query(key)
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 0 {
		return 0, errors.New("invalid " + key)
	}
	return parsed, nil
}

func promptAuditBadRequest(c *gin.Context, message string) {
	c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": message})
}
