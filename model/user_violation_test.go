package model

import (
	"fmt"
	"strings"
	"sync"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupUserViolationTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+strings.ReplaceAll(t.Name(), "/", "_")+"?mode=memory&cache=shared&_pragma=busy_timeout(5000)"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&User{}))
	oldDB := DB
	DB = db
	t.Cleanup(func() { DB = oldDB })
	return db
}

func TestAdjustUserViolationCountSupportsAllModesAndRejectsNegativeResults(t *testing.T) {
	db := setupUserViolationTestDB(t)
	user := User{Username: "violation-adjust-user", Password: "password", Group: "default", AffCode: "violation-adjust", ViolationCount: 3}
	require.NoError(t, db.Create(&user).Error)

	require.NoError(t, AdjustUserViolationCount(user.Id, "add", 4))
	require.NoError(t, AdjustUserViolationCount(user.Id, "subtract", 2))
	require.NoError(t, AdjustUserViolationCount(user.Id, "override", 1))
	assert.Equal(t, 1, getViolationCount(t, db, user.Id))

	assert.Error(t, AdjustUserViolationCount(user.Id, "subtract", 2))
	assert.Error(t, AdjustUserViolationCount(user.Id, "add", 0))
	assert.Error(t, AdjustUserViolationCount(user.Id, "subtract", 0))
	assert.Error(t, AdjustUserViolationCount(user.Id, "override", -1))
	assert.Error(t, AdjustUserViolationCount(user.Id, "unknown", 1))
	assert.Equal(t, 1, getViolationCount(t, db, user.Id))
}

func TestUserGeneralUpdateCannotChangeViolationCount(t *testing.T) {
	db := setupUserViolationTestDB(t)
	user := User{
		Username: "violation-protected-user", Password: "password", Group: "default",
		AffCode: "violation-protected", ViolationCount: 3,
	}
	require.NoError(t, db.Create(&user).Error)

	user.ViolationCount = 99
	require.NoError(t, user.UpdateWithTx(db, false))
	assert.Equal(t, 3, getViolationCount(t, db, user.Id))
}

func TestUserViolationCountProtectsInt32BoundaryAndConcurrentIncrements(t *testing.T) {
	db := setupUserViolationTestDB(t)
	user := User{Username: "violation-boundary-user", Password: "password", Group: "default", AffCode: "violation-boundary", ViolationCount: maxUserViolationCount - 1}
	require.NoError(t, db.Create(&user).Error)
	require.NoError(t, IncrementUserViolationCount(user.Id))
	assert.Error(t, IncrementUserViolationCount(user.Id))
	assert.Error(t, AdjustUserViolationCount(user.Id, "add", 1))
	assert.Equal(t, maxUserViolationCount, getViolationCount(t, db, user.Id))

	concurrent := User{Username: "violation-concurrent-user", Password: "password", Group: "default", AffCode: "violation-concurrent"}
	require.NoError(t, db.Create(&concurrent).Error)
	start := make(chan struct{})
	errors := make(chan error, 2)
	var workers sync.WaitGroup
	workers.Add(2)
	for range 2 {
		go func() {
			defer workers.Done()
			<-start
			errors <- IncrementUserViolationCount(concurrent.Id)
		}()
	}
	close(start)
	workers.Wait()
	close(errors)
	for err := range errors {
		require.NoError(t, err)
	}
	assert.Equal(t, 2, getViolationCount(t, db, concurrent.Id))
}

func getViolationCount(t *testing.T, db *gorm.DB, userID int) int {
	t.Helper()
	var count int
	require.NoError(t, db.Model(&User{}).Where("id = ?", userID).Pluck("violation_count", &count).Error, fmt.Sprintf("read user %d violation count", userID))
	return count
}
