package model

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupPromptAuditConversationBlockDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+strings.ReplaceAll(t.Name(), "/", "_")+"?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&PromptAuditConversationBlock{}, &PromptAuditLog{}))
	oldDB := DB
	DB = db
	t.Cleanup(func() { DB = oldDB })
	return db
}

func TestPromptAuditConversationBlockKeepsFirstSourceAndSurvivesLogCleanup(t *testing.T) {
	db := setupPromptAuditConversationBlockDB(t)
	ctx := context.Background()
	startedAt := time.Unix(100, 1)

	created, err := MarkPromptAuditConversationBlocked(ctx, 7, "hash", "first-request", "first reason", startedAt)
	require.NoError(t, err)
	assert.True(t, created)
	created, err = MarkPromptAuditConversationBlocked(ctx, 7, "hash", "second-request", "second reason", startedAt.Add(time.Second))
	require.NoError(t, err)
	assert.False(t, created)

	block, err := GetActivePromptAuditConversationBlock(ctx, 7, "hash")
	require.NoError(t, err)
	assert.Equal(t, "first-request", block.SourceRequestID)
	assert.Equal(t, PromptAuditLongText("first reason"), block.SourceReason)
	assert.Greater(t, block.ReleasedAt, int64(0), "new rows must use a non-zero version so legacy zero request timestamps cannot release them")

	require.NoError(t, db.Where("1 = 1").Delete(&PromptAuditLog{}).Error)
	active, err := IsPromptAuditConversationBlocked(ctx, 7, "hash")
	require.NoError(t, err)
	assert.True(t, active)
}

func TestPromptAuditConversationBlockReleaseRejectsInFlightResultAndAllowsNewRequest(t *testing.T) {
	setupPromptAuditConversationBlockDB(t)
	ctx := context.Background()
	oldRequest := time.Unix(100, 0)
	require.True(t, mustMarkPromptAuditConversationBlocked(t, ctx, 7, "hash", "initial", oldRequest))

	released, err := ReleasePromptAuditConversationBlock(ctx, 7, "hash", time.Unix(200, 0))
	require.NoError(t, err)
	assert.True(t, released)
	assert.False(t, mustMarkPromptAuditConversationBlocked(t, ctx, 7, "hash", "in-flight", time.Unix(150, 0)))
	active, err := IsPromptAuditConversationBlocked(ctx, 7, "hash")
	require.NoError(t, err)
	assert.False(t, active)

	assert.True(t, mustMarkPromptAuditConversationBlocked(t, ctx, 7, "hash", "new-request", time.Unix(201, 0)))
	block, err := GetActivePromptAuditConversationBlock(ctx, 7, "hash")
	require.NoError(t, err)
	assert.Equal(t, "new-request", block.SourceRequestID)
}

func TestPromptAuditConversationBlockIsolatedByUserAndPrefix(t *testing.T) {
	setupPromptAuditConversationBlockDB(t)
	ctx := context.Background()
	require.True(t, mustMarkPromptAuditConversationBlocked(t, ctx, 7, "hash-a", "source", time.Now()))

	for _, candidate := range []struct {
		userID int
		hash   string
	}{
		{userID: 8, hash: "hash-a"},
		{userID: 7, hash: "hash-b"},
	} {
		active, err := IsPromptAuditConversationBlocked(ctx, candidate.userID, candidate.hash)
		require.NoError(t, err)
		assert.False(t, active)
	}
}

func TestPromptAuditConversationBlockUsesLongTextReason(t *testing.T) {
	assert.IsType(t, PromptAuditLongText(""), PromptAuditConversationBlock{}.SourceReason)
	assert.Equal(t, "LONGTEXT", promptAuditTextDatabaseType("mysql"))
}

func TestPromptAuditConversationBlockConcurrentFirstSourceWins(t *testing.T) {
	setupPromptAuditConversationBlockDB(t)
	ctx := context.Background()
	start := make(chan struct{})
	created := make(chan bool, 2)
	errors := make(chan error, 2)
	for _, requestID := range []string{"first", "second"} {
		go func(requestID string) {
			<-start
			ok, err := MarkPromptAuditConversationBlocked(ctx, 7, "hash", requestID, requestID+" reason", time.Unix(100, 0))
			errors <- err
			created <- ok
		}(requestID)
	}
	close(start)
	require.NoError(t, <-errors)
	require.NoError(t, <-errors)
	assert.NotEqual(t, <-created, <-created)

	block, err := GetActivePromptAuditConversationBlock(ctx, 7, "hash")
	require.NoError(t, err)
	assert.Contains(t, []string{"first", "second"}, block.SourceRequestID)
	assert.Equal(t, PromptAuditLongText(block.SourceRequestID+" reason"), block.SourceReason)
}

func mustMarkPromptAuditConversationBlocked(t *testing.T, ctx context.Context, userID int, hash, requestID string, startedAt time.Time) bool {
	t.Helper()
	created, err := MarkPromptAuditConversationBlocked(ctx, userID, hash, requestID, "reason", startedAt)
	require.NoError(t, err)
	return created
}
