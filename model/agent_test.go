package model

import (
	"testing"

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
