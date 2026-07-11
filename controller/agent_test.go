package controller

import (
	"math"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
)

func TestAgentWithdrawalAmountQuotaUsesSaturatedRounding(t *testing.T) {
	assert.Equal(t, 12, agentWithdrawalAmountQuota(createAgentWithdrawalRequest{AmountQuota: 12}))
	assert.Equal(t, common.QuotaRound(10.5*common.QuotaPerUnit), agentWithdrawalAmountQuota(createAgentWithdrawalRequest{Amount: 10.5}))
	assert.Equal(t, common.MaxQuota, agentWithdrawalAmountQuota(createAgentWithdrawalRequest{Amount: math.MaxFloat64}))
}
