package controller

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	promptauditsetting "github.com/QuantumNous/new-api/setting/prompt_audit_setting"
	"github.com/gin-gonic/gin"
)

type promptAuditMetadata struct {
	userID      int
	username    string
	group       string
	model       string
	requestID   string
	requestTime time.Time
}

type promptAuditJob struct {
	settings             promptauditsetting.Settings
	prompt               string
	metadata             promptAuditMetadata
	tester               PromptAuditTester
	cacheKey             string
	cacheEpoch           uint64
	decisionDurationMs   *int64
	cacheSource          promptAuditAllowCacheSource
	blockSourceRequestID string
	blockSourceReason    string
}

type promptAuditDeferredLog struct {
	job              promptAuditJob
	confidence       *float64
	action           string
	reason           string
	actuallyBlocked  bool
	auditModelOutput string
}

type promptAuditAsyncGeneration struct {
	queue       chan promptAuditJob
	ctx         context.Context
	cancel      context.CancelFunc
	concurrency int
	queueSize   int
}

type promptAuditAsyncScheduler struct {
	mu      sync.Mutex
	current *promptAuditAsyncGeneration
	workers sync.WaitGroup
}

var promptAuditScheduler promptAuditAsyncScheduler
var promptAuditNow = time.Now

type promptAuditOverflowLogger struct {
	mu      sync.Mutex
	queue   chan promptAuditDeferredLog
	stop    chan struct{}
	workers sync.WaitGroup
}

var promptAuditOverflowLogScheduler promptAuditOverflowLogger
var promptAuditLogWriterState = struct {
	sync.RWMutex
	writer func(context.Context, *model.PromptAuditLog) error
}{writer: model.CreatePromptAuditLog}

func (loggerQueue *promptAuditOverflowLogger) enqueue(entry promptAuditDeferredLog) bool {
	loggerQueue.mu.Lock()
	defer loggerQueue.mu.Unlock()
	if loggerQueue.queue == nil {
		loggerQueue.queue = make(chan promptAuditDeferredLog, 64)
		loggerQueue.stop = make(chan struct{})
		loggerQueue.workers.Add(1)
		go func() {
			defer loggerQueue.workers.Done()
			for {
				select {
				case queuedEntry := <-loggerQueue.queue:
					writePromptAuditLog(context.Background(), queuedEntry.job, queuedEntry.confidence, queuedEntry.action, queuedEntry.reason, queuedEntry.actuallyBlocked, queuedEntry.auditModelOutput)
				case <-loggerQueue.stop:
					for {
						select {
						case queuedEntry := <-loggerQueue.queue:
							writePromptAuditLog(context.Background(), queuedEntry.job, queuedEntry.confidence, queuedEntry.action, queuedEntry.reason, queuedEntry.actuallyBlocked, queuedEntry.auditModelOutput)
						default:
							return
						}
					}
				}
			}
		}()
	}
	select {
	case loggerQueue.queue <- entry:
		return true
	default:
		return false
	}
}

func (loggerQueue *promptAuditOverflowLogger) reset() {
	loggerQueue.mu.Lock()
	if loggerQueue.queue == nil {
		loggerQueue.mu.Unlock()
		return
	}
	close(loggerQueue.stop)
	loggerQueue.workers.Wait()
	loggerQueue.queue = nil
	loggerQueue.stop = nil
	loggerQueue.mu.Unlock()
}

func setPromptAuditLogWriter(writer func(context.Context, *model.PromptAuditLog) error) {
	promptAuditLogWriterState.Lock()
	promptAuditLogWriterState.writer = writer
	promptAuditLogWriterState.Unlock()
}

func (scheduler *promptAuditAsyncScheduler) enqueue(settings promptauditsetting.Settings, job promptAuditJob) bool {
	scheduler.mu.Lock()
	generation := scheduler.current
	if generation == nil || generation.concurrency != settings.AsyncConcurrency || generation.queueSize != settings.AsyncQueueSize {
		generationContext, cancel := context.WithCancel(context.Background())
		next := &promptAuditAsyncGeneration{
			queue: make(chan promptAuditJob, settings.AsyncQueueSize), ctx: generationContext, cancel: cancel,
			concurrency: settings.AsyncConcurrency, queueSize: settings.AsyncQueueSize,
		}
		for range settings.AsyncConcurrency {
			scheduler.workers.Add(1)
			go next.runWorker(&scheduler.workers)
		}
		scheduler.current = next
		if generation != nil {
			generation.cancel()
		}
		generation = next
	}
	queued := false
	select {
	case generation.queue <- job:
		queued = true
	default:
	}
	scheduler.mu.Unlock()
	return queued
}

func (scheduler *promptAuditAsyncScheduler) reset() {
	scheduler.mu.Lock()
	if scheduler.current != nil {
		scheduler.current.cancel()
	}
	scheduler.workers.Wait()
	scheduler.current = nil
	scheduler.mu.Unlock()
}

func (generation *promptAuditAsyncGeneration) runWorker(workers *sync.WaitGroup) {
	defer workers.Done()
	for {
		if generation.ctx.Err() != nil {
			return
		}
		select {
		case job := <-generation.queue:
			if generation.ctx.Err() != nil {
				return
			}
			executePromptAuditJob(generation.ctx, job)
		case <-generation.ctx.Done():
			return
		}
	}
}

func runPromptAudit(c *gin.Context, relayFormat types.RelayFormat, request dto.Request, relayInfo *relaycommon.RelayInfo) *types.NewAPIError {
	cacheEpoch := promptAuditDecisionCache.currentEpoch()
	settings := promptauditsetting.Get()
	if !settings.Enabled || relayInfo == nil || !promptAuditGroupEnabled(settings.AuditGroups, relayInfo.UsingGroup) {
		return nil
	}
	prompt, ok := service.ExtractPromptAuditText(relayFormat, c.Request.URL.Path, request, settings.LatestContextOnly)
	if !ok {
		return nil
	}
	startTime := common.GetContextKeyTime(c, constant.ContextKeyRequestStartTime)
	if startTime.IsZero() {
		startTime = promptAuditNow()
	}
	metadata := promptAuditMetadata{
		userID: relayInfo.UserId, username: common.GetContextKeyString(c, constant.ContextKeyUserName),
		group: relayInfo.UsingGroup, model: relayInfo.OriginModelName,
		requestID: c.GetString(common.RequestIdKey), requestTime: startTime,
	}
	promptAuditTesterState.RLock()
	tester := promptAuditTesterState.tester
	promptAuditTesterState.RUnlock()
	cacheKey := promptAuditCacheKey(settings, metadata.userID, prompt)
	conversationHash := promptAuditConversationHash(prompt)
	job := promptAuditJob{settings: settings, prompt: prompt, metadata: metadata, tester: tester, cacheKey: cacheKey, cacheEpoch: cacheEpoch}
	conversationBlock, conversationBlocked, blockErr := model.CheckPromptAuditConversationBlock(c.Request.Context(), metadata.userID, conversationHash)
	forceRealAudit := false
	if blockErr != nil {
		logger.LogError(c, "failed to check prompt audit conversation block: "+blockErr.Error())
		forceRealAudit = true
	} else if conversationBlocked {
		promptAuditDecisionCache.removeConversation(metadata.userID, prompt)
		job.blockSourceRequestID = conversationBlock.SourceRequestID
		job.blockSourceReason = string(conversationBlock.SourceReason)
		writePromptAuditLog(c.Request.Context(), job, nil, model.PromptAuditActionBlocked, promptAuditConversationBlockReason, true, "")
		incrementPromptAuditViolationCount(c.Request.Context(), metadata.userID)
		return types.NewErrorWithStatusCode(errors.New("提示词审计拦截："+promptAuditConversationBlockReason), types.ErrorCodePromptAuditBlocked, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
	}
	if cacheSource, hit := promptAuditDecisionCache.hit(cacheKey); hit && !forceRealAudit {
		durationMs := promptAuditNow().Sub(metadata.requestTime).Milliseconds()
		job.decisionDurationMs = &durationMs
		job.cacheSource = cacheSource
		entry := promptAuditDeferredLog{
			job: job, action: model.PromptAuditActionAllowed, reason: promptAuditAllowCacheReason,
		}
		if !promptAuditOverflowLogScheduler.enqueue(entry) {
			logger.LogWarn(c, "prompt audit cache-hit log queue is full")
		}
		return nil
	}
	if !forceRealAudit && !promptAuditSampled(settings.SamplingRate, metadata.userID, metadata.requestID, prompt) {
		return nil
	}
	if settings.Mode == promptauditsetting.ModeAsync {
		if conversationBlock != nil && !metadata.requestTime.After(time.Unix(0, conversationBlock.ReleasedAt)) {
			return nil
		}
		if !promptAuditScheduler.enqueue(settings, job) {
			durationMs := promptAuditNow().Sub(metadata.requestTime).Milliseconds()
			job.decisionDurationMs = &durationMs
			entry := promptAuditDeferredLog{
				job: job, action: model.PromptAuditActionAllowed, reason: "审计失败：审计队列已满",
			}
			if !promptAuditOverflowLogScheduler.enqueue(entry) {
				logger.LogWarn(c, "prompt audit overflow log queue is full")
			}
		}
		return nil
	}
	result, err := executePromptAudit(c.Request.Context(), job)
	if err != nil {
		writePromptAuditLog(c.Request.Context(), job, nil, model.PromptAuditActionAllowed, "审计失败："+err.Error(), false, result.AuditModelOutput)
		return nil
	}
	blocked := result.Blocked(settings.Threshold)
	action := model.PromptAuditActionAllowed
	if blocked {
		action = model.PromptAuditActionBlocked
	}
	writePromptAuditLog(c.Request.Context(), job, &result.Confidence, action, result.Reason, blocked, result.AuditModelOutput)
	if !blocked {
		promptAuditDecisionCache.storeIfCurrent(job.cacheKey, job.cacheEpoch, promptAuditAllowCacheSource{
			requestID: job.metadata.requestID,
			reason:    result.Reason,
		})
		return nil
	}
	incrementPromptAuditViolationCount(c.Request.Context(), metadata.userID)
	if _, markErr := model.MarkPromptAuditConversationBlocked(c.Request.Context(), metadata.userID, conversationHash, metadata.requestID, result.Reason, metadata.requestTime); markErr != nil {
		logger.LogError(c, "failed to mark prompt audit conversation blocked: "+markErr.Error())
	}
	promptAuditDecisionCache.removeConversation(metadata.userID, prompt)
	message := "提示词审计拦截"
	if result.Reason != "" {
		reasonRunes := []rune(result.Reason)
		if len(reasonRunes) > 200 {
			reasonRunes = reasonRunes[:200]
		}
		message += "：" + string(reasonRunes)
	}
	return types.NewErrorWithStatusCode(errors.New(message), types.ErrorCodePromptAuditBlocked, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
}

func executePromptAuditJob(ctx context.Context, job promptAuditJob) {
	result, err := executePromptAudit(ctx, job)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			logger.LogWarn(ctx, "prompt audit generation canceled")
			return
		}
		writePromptAuditLog(context.Background(), job, nil, model.PromptAuditActionAllowed, "审计失败："+err.Error(), false, result.AuditModelOutput)
		return
	}
	if ctx.Err() != nil {
		logger.LogWarn(ctx, "prompt audit generation canceled")
		return
	}
	action := model.PromptAuditActionAllowed
	blocked := result.Blocked(job.settings.Threshold)
	if blocked {
		action = model.PromptAuditActionBlocked
	}
	writePromptAuditLog(context.Background(), job, &result.Confidence, action, result.Reason, false, result.AuditModelOutput)
	if !blocked {
		promptAuditDecisionCache.storeIfCurrent(job.cacheKey, job.cacheEpoch, promptAuditAllowCacheSource{
			requestID: job.metadata.requestID,
			reason:    result.Reason,
		})
		return
	}
	if _, markErr := model.MarkPromptAuditConversationBlocked(context.Background(), job.metadata.userID, promptAuditConversationHash(job.prompt), job.metadata.requestID, result.Reason, job.metadata.requestTime); markErr != nil {
		logger.LogError(ctx, "failed to mark prompt audit conversation blocked: "+markErr.Error())
	}
	promptAuditDecisionCache.removeConversation(job.metadata.userID, job.prompt)
}

func executePromptAudit(ctx context.Context, job promptAuditJob) (service.PromptAuditResult, error) {
	if job.tester == nil {
		return service.PromptAuditResult{}, errors.New("审计客户端未配置")
	}
	return job.tester.Test(ctx, job.settings, job.prompt)
}

func writePromptAuditLog(ctx context.Context, job promptAuditJob, confidence *float64, action, reason string, actuallyBlocked bool, auditModelOutput string) {
	durationMs := promptAuditNow().Sub(job.metadata.requestTime).Milliseconds()
	if job.decisionDurationMs != nil {
		durationMs = *job.decisionDurationMs
	}
	log := &model.PromptAuditLog{
		Action: action, Confidence: confidence, UserID: job.metadata.userID, Username: job.metadata.username,
		Group: job.metadata.group, Model: job.metadata.model, Prompt: model.PromptAuditText(job.prompt), Reason: model.PromptAuditText(reason),
		AuditModelOutput: model.PromptAuditText(auditModelOutput),
		DurationMs:       durationMs, Mode: job.settings.Mode,
		ActuallyBlocked: actuallyBlocked, RequestID: job.metadata.requestID,
		CacheSourceRequestID: job.cacheSource.requestID,
		CacheSourceReason:    model.PromptAuditLongText(job.cacheSource.reason),
		BlockSourceRequestID: job.blockSourceRequestID,
		BlockSourceReason:    model.PromptAuditLongText(job.blockSourceReason),
	}
	promptAuditLogWriterState.RLock()
	writer := promptAuditLogWriterState.writer
	promptAuditLogWriterState.RUnlock()
	if err := writer(ctx, log); err != nil {
		logger.LogError(ctx, fmt.Sprintf("failed to write prompt audit log: %s", err.Error()))
	}
}

func incrementPromptAuditViolationCount(ctx context.Context, userID int) {
	if err := model.IncrementUserViolationCount(userID); err != nil {
		logger.LogError(ctx, fmt.Sprintf("failed to increment prompt audit violation count for user %d: %s", userID, err.Error()))
	}
}

func promptAuditGroupEnabled(groups []string, group string) bool {
	for _, allowed := range groups {
		if allowed == group {
			return true
		}
	}
	return false
}
