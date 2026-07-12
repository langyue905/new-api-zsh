package model

import (
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func insertAgentTestUser(t *testing.T, username string, agentId int) User {
	t.Helper()
	user := User{
		Username:    username,
		Password:    "hashed-password",
		DisplayName: username,
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
		Group:       "default",
		AffCode:     username + "_aff",
		AgentId:     agentId,
	}
	require.NoError(t, DB.Create(&user).Error)
	return user
}

func TestListAgentProfilesFiltersByKeyword(t *testing.T) {
	truncateTables(t)

	alpha := insertAgentTestUser(t, "agent_alpha", 0)
	beta := insertAgentTestUser(t, "agent_beta", 0)
	insertAgentTestUser(t, "agent_gamma", 0)
	require.NoError(t, DB.Model(&User{}).Where("id = ?", alpha.Id).Update("email", "alpha@example.com").Error)
	require.NoError(t, DB.Model(&User{}).Where("id = ?", beta.Id).Update("email", "beta@example.com").Error)

	profiles, total, err := ListAgentProfiles(0, 10, "beta@example.com", "all")
	require.NoError(t, err)
	assert.EqualValues(t, 1, total)
	require.Len(t, profiles, 1)
	assert.Equal(t, beta.Id, profiles[0].UserId)

	profiles, total, err = ListAgentProfiles(0, 10, strconv.Itoa(alpha.Id), "all")
	require.NoError(t, err)
	assert.EqualValues(t, 1, total)
	require.Len(t, profiles, 1)
	assert.Equal(t, alpha.Id, profiles[0].UserId)
}

func TestListAgentProfilesNumericKeywordMatchesOnlyUserID(t *testing.T) {
	truncateTables(t)

	matchedById := insertAgentTestUser(t, "agent_exact", 0)
	matchedByName := insertAgentTestUser(t, "agent_21_name", 0)
	require.NoError(t, DB.Model(&User{}).Where("id = ?", matchedByName.Id).Update("email", "customer21@example.com").Error)

	profiles, total, err := ListAgentProfiles(0, 10, strconv.Itoa(matchedById.Id), "all")
	require.NoError(t, err)
	assert.EqualValues(t, 1, total)
	require.Len(t, profiles, 1)
	assert.Equal(t, matchedById.Id, profiles[0].UserId)
}

func TestListAgentProfilesActiveScopeReturnsOnlyAgentsWithCustomers(t *testing.T) {
	truncateTables(t)

	activeAgent := insertAgentTestUser(t, "agent_active", 0)
	inactiveAgent := insertAgentTestUser(t, "agent_inactive", 0)
	insertAgentTestUser(t, "customer_active", activeAgent.Id)

	profiles, total, err := ListAgentProfiles(0, 10, "", "active")
	require.NoError(t, err)
	assert.EqualValues(t, 1, total)
	require.Len(t, profiles, 1)
	assert.Equal(t, activeAgent.Id, profiles[0].UserId)
	assert.EqualValues(t, 1, profiles[0].CustomerCount)

	profiles, total, err = ListAgentProfiles(0, 10, "", "all")
	require.NoError(t, err)
	assert.EqualValues(t, 3, total)
	userIds := make([]int, 0, len(profiles))
	for _, profile := range profiles {
		userIds = append(userIds, profile.UserId)
	}
	assert.Contains(t, userIds, activeAgent.Id)
	assert.Contains(t, userIds, inactiveAgent.Id)
}

func TestGetAgentUsageLogsReturnsOnlyBoundCustomerConsumeLogs(t *testing.T) {
	truncateTables(t)

	agent := insertAgentTestUser(t, "agent_logs", 0)
	boundCustomer := insertAgentTestUser(t, "customer_logs_bound", agent.Id)
	otherCustomer := insertAgentTestUser(t, "customer_logs_other", 0)
	require.NoError(t, LOG_DB.Create(&Log{
		UserId:    boundCustomer.Id,
		Username:  boundCustomer.Username,
		CreatedAt: 100,
		Type:      LogTypeConsume,
		ModelName: "gpt-bound",
		Quota:     1200,
		Group:     "default",
	}).Error)
	require.NoError(t, LOG_DB.Create(&Log{
		UserId:    boundCustomer.Id,
		Username:  boundCustomer.Username,
		CreatedAt: 101,
		Type:      LogTypeTopup,
		ModelName: "topup-hidden",
		Quota:     100,
	}).Error)
	require.NoError(t, LOG_DB.Create(&Log{
		UserId:    otherCustomer.Id,
		Username:  otherCustomer.Username,
		CreatedAt: 102,
		Type:      LogTypeConsume,
		ModelName: "gpt-other",
		Quota:     900,
	}).Error)

	logs, total, err := GetAgentUsageLogs(agent.Id, 0, 10)
	require.NoError(t, err)
	assert.EqualValues(t, 1, total)
	require.Len(t, logs, 1)
	assert.Equal(t, boundCustomer.Id, logs[0].UserId)
	assert.Equal(t, LogTypeConsume, logs[0].Type)
	assert.Equal(t, "gpt-bound", logs[0].ModelName)
}

func TestAssignAgentCustomerBackfillsExistingConsumeLogs(t *testing.T) {
	truncateTables(t)

	unit := int(common.QuotaPerUnit)
	agent := insertAgentTestUser(t, "agent_backfill", 0)
	customer := insertAgentTestUser(t, "customer_backfill", 0)
	firstQuota := 50 * unit
	secondQuota := 20 * unit
	records := []Log{
		{
			UserId:    customer.Id,
			Username:  customer.Username,
			CreatedAt: 100,
			Type:      LogTypeConsume,
			ModelName: "gpt-backfill-1",
			Quota:     firstQuota,
			Group:     "default",
			RequestId: "req-agent-backfill-1",
		},
		{
			UserId:    customer.Id,
			Username:  customer.Username,
			CreatedAt: 101,
			Type:      LogTypeConsume,
			ModelName: "gpt-backfill-2",
			Quota:     secondQuota,
			Group:     "default",
			RequestId: "req-agent-backfill-2",
		},
	}
	for i := range records {
		record := records[i]
		require.NoError(t, LOG_DB.Create(&record).Error)
	}

	require.NoError(t, AssignAgentCustomer(customer.Id, agent.Id))
	var count int64
	require.NoError(t, DB.Model(&AgentCommission{}).Where("agent_user_id = ?", agent.Id).Count(&count).Error)
	assert.EqualValues(t, 2, count)

	expectedQuota := firstQuota + secondQuota
	expectedCommission := expectedQuota * AgentDefaultCommissionRateBps / agentCommissionRateBase
	summary, err := GetAgentSummary(agent.Id)
	require.NoError(t, err)
	assert.Equal(t, int64(expectedQuota), summary.TotalCustomerConsumeQuota)
	assert.Equal(t, expectedCommission, summary.PendingCommissionQuota)
	assert.Equal(t, expectedCommission, summary.TotalCommissionQuota)

	require.NoError(t, DB.Model(&AgentCommission{}).Where("agent_user_id = ?", agent.Id).Count(&count).Error)
	assert.EqualValues(t, 2, count)

	require.NoError(t, AssignAgentCustomer(customer.Id, agent.Id))
	summary, err = GetAgentSummary(agent.Id)
	require.NoError(t, err)
	assert.Equal(t, int64(expectedQuota), summary.TotalCustomerConsumeQuota)
	assert.Equal(t, expectedCommission, summary.PendingCommissionQuota)
	require.NoError(t, DB.Model(&AgentCommission{}).Where("agent_user_id = ?", agent.Id).Count(&count).Error)
	assert.EqualValues(t, 2, count)
}

func TestGetAgentSummarySchedulesExistingBoundConsumeLogBackfill(t *testing.T) {
	truncateTables(t)

	unit := int(common.QuotaPerUnit)
	agent := insertAgentTestUser(t, "agent_summary_backfill", 0)
	customer := insertAgentTestUser(t, "customer_summary_backfill", agent.Id)
	quota := 30 * unit
	require.NoError(t, LOG_DB.Create(&Log{
		UserId:    customer.Id,
		Username:  customer.Username,
		CreatedAt: 100,
		Type:      LogTypeConsume,
		ModelName: "gpt-summary-backfill",
		Quota:     quota,
		Group:     "default",
		RequestId: "req-agent-summary-backfill",
	}).Error)

	expectedCommission := quota * AgentDefaultCommissionRateBps / agentCommissionRateBase
	summary, err := GetAgentSummary(agent.Id)
	require.NoError(t, err)
	assert.EqualValues(t, 1, summary.CustomerCount)
	assert.EqualValues(t, 0, summary.TotalCustomerConsumeQuota)
	assert.Equal(t, 0, summary.PendingCommissionQuota)

	require.Eventually(t, func() bool {
		profile, err := GetAgentProfileByUserId(agent.Id)
		if err != nil {
			return false
		}
		return profile.TotalCustomerConsumeQuota == int64(quota) &&
			profile.PendingCommissionQuota == expectedCommission &&
			profile.TotalCommissionQuota == expectedCommission
	}, 2*time.Second, 20*time.Millisecond)

	var count int64
	require.NoError(t, DB.Model(&AgentCommission{}).Where("agent_user_id = ?", agent.Id).Count(&count).Error)
	assert.EqualValues(t, 1, count)
}

func TestRecordAgentCommissionForConsumeLogCreatesDefaultCommission(t *testing.T) {
	truncateTables(t)

	unit := int(common.QuotaPerUnit)
	agent := insertAgentTestUser(t, "agent_default", 0)
	customer := insertAgentTestUser(t, "customer_default", agent.Id)
	quota := 50 * unit

	err := RecordAgentCommissionForConsumeLog(&Log{
		UserId:    customer.Id,
		Type:      LogTypeConsume,
		Quota:     quota,
		RequestId: "req-agent-default",
		ModelName: "gpt-test",
		Group:     "default",
	})
	require.NoError(t, err)

	var commission AgentCommission
	require.NoError(t, DB.First(&commission, "request_id = ?", "req-agent-default").Error)
	assert.Equal(t, agent.Id, commission.AgentUserId)
	assert.Equal(t, customer.Id, commission.CustomerUserId)
	assert.Equal(t, quota, commission.Quota)
	assert.Equal(t, AgentDefaultCommissionRateBps, commission.CommissionRateBps)
	assert.Equal(t, quota*AgentDefaultCommissionRateBps/agentCommissionRateBase, commission.CommissionQuota)

	profile, err := GetAgentProfileByUserId(agent.Id)
	require.NoError(t, err)
	assert.True(t, profile.Enabled)
	assert.Equal(t, int64(quota), profile.TotalCustomerConsumeQuota)
	assert.Equal(t, commission.CommissionQuota, profile.PendingCommissionQuota)
	assert.Equal(t, commission.CommissionQuota, profile.TotalCommissionQuota)
}

func TestRecordAgentCommissionForConsumeLogUsesTierAfterCurrentConsumption(t *testing.T) {
	truncateTables(t)

	unit := int(common.QuotaPerUnit)
	agent := insertAgentTestUser(t, "agent_tier", 0)
	customer := insertAgentTestUser(t, "customer_tier", agent.Id)

	events := []struct {
		requestId string
		quota     int
		rateBps   int
	}{
		{requestId: "req-tier-99", quota: 99 * unit, rateBps: AgentDefaultCommissionRateBps},
		{requestId: "req-tier-100", quota: 1 * unit, rateBps: AgentTierTwoCommissionRateBps},
		{requestId: "req-tier-1000", quota: 900 * unit, rateBps: AgentTierThreeCommissionRateBps},
	}

	for _, event := range events {
		err := RecordAgentCommissionForConsumeLog(&Log{
			UserId:    customer.Id,
			Type:      LogTypeConsume,
			Quota:     event.quota,
			RequestId: event.requestId,
		})
		require.NoError(t, err)

		var commission AgentCommission
		require.NoError(t, DB.First(&commission, "request_id = ?", event.requestId).Error)
		assert.Equal(t, event.rateBps, commission.CommissionRateBps)
		assert.Equal(t, event.quota*event.rateBps/agentCommissionRateBase, commission.CommissionQuota)
	}

	profile, err := GetAgentProfileByUserId(agent.Id)
	require.NoError(t, err)
	assert.Equal(t, int64(1000*unit), profile.TotalCustomerConsumeQuota)
	assert.Equal(t, AgentTierThreeCommissionRateBps, profile.CurrentRateBps)
}

func TestRecordAgentCommissionForConsumeLogIsIdempotentByRequestID(t *testing.T) {
	truncateTables(t)

	unit := int(common.QuotaPerUnit)
	agent := insertAgentTestUser(t, "agent_idempotent", 0)
	customer := insertAgentTestUser(t, "customer_idempotent", agent.Id)
	log := &Log{
		UserId:    customer.Id,
		Type:      LogTypeConsume,
		Quota:     50 * unit,
		RequestId: "req-agent-idempotent",
	}

	require.NoError(t, RecordAgentCommissionForConsumeLog(log))
	require.NoError(t, RecordAgentCommissionForConsumeLog(log))

	var count int64
	require.NoError(t, DB.Model(&AgentCommission{}).Where("request_id = ?", log.RequestId).Count(&count).Error)
	assert.EqualValues(t, 1, count)

	profile, err := GetAgentProfileByUserId(agent.Id)
	require.NoError(t, err)
	assert.Equal(t, int64(log.Quota), profile.TotalCustomerConsumeQuota)
}

func TestRecordAgentCommissionForConsumeLogIsIdempotentWithoutRequestIDOrLogID(t *testing.T) {
	truncateTables(t)

	agent := insertAgentTestUser(t, "agent_fingerprint", 0)
	customer := insertAgentTestUser(t, "customer_fingerprint", agent.Id)
	log := &Log{
		UserId:    customer.Id,
		Username:  customer.Username,
		CreatedAt: 100,
		Type:      LogTypeConsume,
		Quota:     1,
		ModelName: "gpt-fingerprint",
		Group:     "default",
		ChannelId: 1,
		TokenId:   2,
		UseTime:   3,
		IsStream:  true,
		Content:   "fingerprint test",
		RequestId: "",
		Other:     `{"source":"test"}`,
	}

	require.NoError(t, RecordAgentCommissionForConsumeLog(log))
	require.NoError(t, RecordAgentCommissionForConsumeLog(log))

	var count int64
	require.NoError(t, DB.Model(&AgentCommission{}).Where("agent_user_id = ?", agent.Id).Count(&count).Error)
	assert.EqualValues(t, 1, count)

	profile, err := GetAgentProfileByUserId(agent.Id)
	require.NoError(t, err)
	assert.Equal(t, int64(log.Quota), profile.TotalCustomerConsumeQuota)
	assert.Equal(t, 0, profile.PendingCommissionQuota)

	commissions, total, err := GetAgentCommissions(agent.Id, 0, 10)
	require.NoError(t, err)
	assert.EqualValues(t, 0, total)
	assert.Empty(t, commissions)
}

func TestGetAgentCommissionsIncludesUsageLogDetails(t *testing.T) {
	truncateTables(t)

	unit := int(common.QuotaPerUnit)
	agent := insertAgentTestUser(t, "agent_commission_detail", 0)
	customer := insertAgentTestUser(t, "customer_commission_detail", agent.Id)
	require.NoError(t, DB.Model(&User{}).Where("id = ?", customer.Id).Update("display_name", "Detail Customer").Error)
	log := Log{
		UserId:           customer.Id,
		Username:         customer.Username,
		CreatedAt:        12345,
		Type:             LogTypeConsume,
		ModelName:        "gpt-5.6-sol",
		Group:            "gpt-pro",
		Quota:            2 * unit,
		PromptTokens:     111,
		CompletionTokens: 222,
		TokenName:        "customer-token",
		RequestId:        "req-agent-commission-detail",
	}
	require.NoError(t, LOG_DB.Create(&log).Error)
	require.NoError(t, RecordAgentCommissionForConsumeLog(&log))

	commissions, total, err := GetAgentCommissions(agent.Id, 0, 10)
	require.NoError(t, err)
	assert.EqualValues(t, 1, total)
	require.Len(t, commissions, 1)
	assert.Equal(t, customer.Id, commissions[0].CustomerUserId)
	assert.Equal(t, customer.Username, commissions[0].CustomerUsername)
	assert.Equal(t, "Detail Customer", commissions[0].CustomerDisplayName)
	assert.Equal(t, "gpt-5.6-sol", commissions[0].ModelName)
	assert.Equal(t, "gpt-pro", commissions[0].Group)
	assert.Equal(t, "customer-token", commissions[0].TokenName)
	assert.Equal(t, 111, commissions[0].PromptTokens)
	assert.Equal(t, 222, commissions[0].CompletionTokens)
	assert.Equal(t, int64(12345), commissions[0].ConsumeCreatedAt)
}

func TestTransferAgentCommissionToQuotaMovesPendingCommissionToBalance(t *testing.T) {
	truncateTables(t)

	unit := int(common.QuotaPerUnit)
	agent := insertAgentTestUser(t, "agent_transfer", 0)
	customer := insertAgentTestUser(t, "customer_transfer", agent.Id)
	quota := 50 * unit
	expectedCommission := quota * AgentDefaultCommissionRateBps / agentCommissionRateBase

	require.NoError(t, RecordAgentCommissionForConsumeLog(&Log{
		UserId:    customer.Id,
		Type:      LogTypeConsume,
		Quota:     quota,
		RequestId: "req-agent-transfer",
	}))

	transferred, err := TransferAgentCommissionToQuota(agent.Id)
	require.NoError(t, err)
	assert.Equal(t, expectedCommission, transferred)

	var reloaded User
	require.NoError(t, DB.First(&reloaded, agent.Id).Error)
	assert.Equal(t, expectedCommission, reloaded.Quota)

	profile, err := GetAgentProfileByUserId(agent.Id)
	require.NoError(t, err)
	assert.Equal(t, 0, profile.PendingCommissionQuota)
	assert.Equal(t, expectedCommission, profile.TransferredQuota)
}

func TestCreateAgentWithdrawalValidatesAmountAndReservesPendingCommission(t *testing.T) {
	truncateTables(t)

	unit := int(common.QuotaPerUnit)
	agent := insertAgentTestUser(t, "agent_withdrawal", 0)
	customer := insertAgentTestUser(t, "customer_withdrawal", agent.Id)

	require.NoError(t, RecordAgentCommissionForConsumeLog(&Log{
		UserId:    customer.Id,
		Type:      LogTypeConsume,
		Quota:     200 * unit,
		RequestId: "req-agent-withdrawal",
	}))

	_, err := CreateAgentWithdrawal(agent.Id, 9*unit, "", "", "")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "最低")

	_, err = CreateAgentWithdrawal(agent.Id, 11*unit, "", "", "")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "10 的倍数")

	_, err = CreateAgentWithdrawal(agent.Id, 30*unit, "", "", "")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "可提现")

	_, err = CreateAgentWithdrawal(agent.Id, 10*unit, "", "", "")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "收款")

	_, err = CreateAgentWithdrawal(agent.Id, 10*unit, "", strings.Repeat("a", 60001), "")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "收款码")

	withdrawal, err := CreateAgentWithdrawal(agent.Id, 10*unit, "pay-account", "pay-code", "first withdrawal")
	require.NoError(t, err)
	assert.Equal(t, 10*unit, withdrawal.AmountQuota)
	assert.Equal(t, AgentWithdrawalStatusPending, withdrawal.Status)

	profile, err := GetAgentProfileByUserId(agent.Id)
	require.NoError(t, err)
	assert.Equal(t, 10*unit, profile.PendingCommissionQuota)
	assert.Equal(t, 10*unit, profile.WithdrawingQuota)

	processed, err := ProcessAgentWithdrawal(withdrawal.Id, 1, AgentWithdrawalStatusRejected, "retry later")
	require.NoError(t, err)
	assert.Equal(t, AgentWithdrawalStatusRejected, processed.Status)

	profile, err = GetAgentProfileByUserId(agent.Id)
	require.NoError(t, err)
	assert.Equal(t, 20*unit, profile.PendingCommissionQuota)
	assert.Equal(t, 0, profile.WithdrawingQuota)
}
