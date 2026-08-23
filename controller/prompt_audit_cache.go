package controller

import (
	"crypto/sha256"
	"encoding/binary"
	"fmt"
	"math"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	promptauditsetting "github.com/QuantumNous/new-api/setting/prompt_audit_setting"
)

const (
	promptAuditCachePrefixRunes        = 256
	promptAuditAllowCacheReason        = "命中对话放行缓存"
	promptAuditConversationBlockReason = "命中已拦截对话"
)

type promptAuditAllowCacheEntry struct {
	hits      int
	expiresAt time.Time
	lastUsed  time.Time
	source    promptAuditAllowCacheSource
}

type promptAuditAllowCacheSource struct {
	requestID string
	reason    string
}

type promptAuditAllowCache struct {
	mu         sync.Mutex
	entries    map[string]*promptAuditAllowCacheEntry
	maxEntries int
	maxHits    int
	ttl        time.Duration
	now        func() time.Time
	epoch      atomic.Uint64
}

func newPromptAuditAllowCache(maxEntries, maxHits int, ttl time.Duration) *promptAuditAllowCache {
	cache := &promptAuditAllowCache{
		entries: make(map[string]*promptAuditAllowCacheEntry), maxEntries: maxEntries, maxHits: maxHits, ttl: ttl,
		now: time.Now,
	}
	cache.epoch.Store(1)
	return cache
}

var promptAuditDecisionCache = newPromptAuditAllowCache(10000, 10, 10*time.Minute)

func (cache *promptAuditAllowCache) hit(key string) (promptAuditAllowCacheSource, bool) {
	cache.mu.Lock()
	defer cache.mu.Unlock()
	now := cache.now()
	entry, ok := cache.entries[key]
	if !ok {
		return promptAuditAllowCacheSource{}, false
	}
	if !now.Before(entry.expiresAt) || entry.hits >= cache.maxHits {
		delete(cache.entries, key)
		return promptAuditAllowCacheSource{}, false
	}
	entry.hits++
	entry.lastUsed = now
	entry.expiresAt = now.Add(cache.ttl)
	return entry.source, true
}

func (cache *promptAuditAllowCache) store(key string, source promptAuditAllowCacheSource) {
	cache.mu.Lock()
	defer cache.mu.Unlock()
	cache.storeLocked(key, source)
}

func (cache *promptAuditAllowCache) storeIfCurrent(key string, epoch uint64, source promptAuditAllowCacheSource) bool {
	cache.mu.Lock()
	defer cache.mu.Unlock()
	if cache.epoch.Load() != epoch {
		return false
	}
	cache.storeLocked(key, source)
	return true
}

func (cache *promptAuditAllowCache) storeLocked(key string, source promptAuditAllowCacheSource) {
	now := cache.now()
	if cache.maxEntries < 1 || cache.maxHits < 1 || cache.ttl <= 0 {
		return
	}
	if entry, exists := cache.entries[key]; exists {
		if now.Before(entry.expiresAt) {
			return
		}
		delete(cache.entries, key)
	}
	if len(cache.entries) >= cache.maxEntries {
		for existingKey, entry := range cache.entries {
			if !now.Before(entry.expiresAt) {
				delete(cache.entries, existingKey)
			}
		}
	}
	if len(cache.entries) >= cache.maxEntries {
		var oldestKey string
		var oldestTime time.Time
		for existingKey, entry := range cache.entries {
			if oldestKey == "" || entry.lastUsed.Before(oldestTime) {
				oldestKey = existingKey
				oldestTime = entry.lastUsed
			}
		}
		delete(cache.entries, oldestKey)
	}
	cache.entries[key] = &promptAuditAllowCacheEntry{expiresAt: now.Add(cache.ttl), lastUsed: now, source: source}
}

func (cache *promptAuditAllowCache) reset() {
	cache.mu.Lock()
	cache.entries = make(map[string]*promptAuditAllowCacheEntry)
	cache.epoch.Add(1)
	cache.mu.Unlock()
}

func (cache *promptAuditAllowCache) remove(key string) {
	cache.mu.Lock()
	delete(cache.entries, key)
	cache.mu.Unlock()
}

func (cache *promptAuditAllowCache) removeConversation(userID int, prompt string) {
	prefix := promptAuditConversationCachePrefix(userID, prompt)
	cache.mu.Lock()
	for key := range cache.entries {
		if strings.HasPrefix(key, prefix) {
			delete(cache.entries, key)
		}
	}
	cache.mu.Unlock()
}

func (cache *promptAuditAllowCache) currentEpoch() uint64 {
	return cache.epoch.Load()
}

func promptAuditPrefix(prompt string) string {
	runesSeen := 0
	for index := range prompt {
		if runesSeen == promptAuditCachePrefixRunes {
			return prompt[:index]
		}
		runesSeen++
	}
	return prompt
}

func promptAuditPolicyFingerprint(settings promptauditsetting.Settings) string {
	payload, err := common.Marshal(struct {
		Mode              string  `json:"mode"`
		Model             string  `json:"model"`
		BaseURL           string  `json:"base_url"`
		SystemPrompt      string  `json:"system_prompt"`
		Threshold         float64 `json:"threshold"`
		LatestContextOnly bool    `json:"latest_context_only"`
		SamplingRate      float64 `json:"sampling_rate"`
	}{
		Mode: settings.Mode, Model: settings.Model, BaseURL: settings.BaseURL,
		SystemPrompt: settings.SystemPrompt, Threshold: settings.Threshold,
		LatestContextOnly: settings.LatestContextOnly, SamplingRate: settings.SamplingRate,
	})
	if err != nil {
		return ""
	}
	sum := sha256.Sum256(payload)
	return string(sum[:])
}

func promptAuditCacheKey(settings promptauditsetting.Settings, userID int, prompt string) string {
	return promptAuditConversationCachePrefix(userID, prompt) + promptAuditPolicyFingerprint(settings)
}

func promptAuditConversationCachePrefix(userID int, prompt string) string {
	prefixSum := sha256.Sum256([]byte(promptAuditPrefix(prompt)))
	return strconv.Itoa(userID) + ":" + string(prefixSum[:]) + ":"
}

func promptAuditConversationHash(prompt string) string {
	prefixSum := sha256.Sum256([]byte(promptAuditPrefix(prompt)))
	return fmt.Sprintf("%x", prefixSum[:])
}

func promptAuditSampled(rate float64, userID int, requestID, prompt string) bool {
	if rate <= 0 {
		return false
	}
	if rate >= 1 {
		return true
	}
	payload, err := common.Marshal(struct {
		UserID    int    `json:"user_id"`
		RequestID string `json:"request_id"`
		Prefix    string `json:"prefix"`
	}{UserID: userID, RequestID: requestID, Prefix: promptAuditPrefix(prompt)})
	if err != nil {
		return false
	}
	sum := sha256.Sum256(payload)
	value := binary.BigEndian.Uint64(sum[:8])
	return float64(value)/float64(math.MaxUint64) < rate
}
