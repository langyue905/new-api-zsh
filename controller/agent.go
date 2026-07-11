package controller

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

type upsertAgentProfileRequest struct {
	UserId            int     `json:"user_id" binding:"required"`
	Enabled           *bool   `json:"enabled"`
	ManualRate        *bool   `json:"manual_rate"`
	CommissionRate    float64 `json:"commission_rate"`
	CommissionRateBps int     `json:"commission_rate_bps"`
}

type assignAgentCustomerRequest struct {
	UserId  int `json:"user_id" binding:"required"`
	AgentId int `json:"agent_id"`
}

type createAgentWithdrawalRequest struct {
	Amount         float64 `json:"amount"`
	AmountQuota    int     `json:"amount_quota"`
	PaymentAccount string  `json:"payment_account"`
	PaymentQRCode  string  `json:"payment_qr_code"`
	Note           string  `json:"note"`
}

type processAgentWithdrawalRequest struct {
	Status    int    `json:"status" binding:"required"`
	AdminNote string `json:"admin_note"`
}

func parseAgentWithdrawalStatus(statusText string) int {
	switch strings.ToLower(strings.TrimSpace(statusText)) {
	case "pending":
		return model.AgentWithdrawalStatusPending
	case "paid":
		return model.AgentWithdrawalStatusPaid
	case "rejected":
		return model.AgentWithdrawalStatusRejected
	default:
		status, _ := strconv.Atoi(statusText)
		return status
	}
}

func agentWithdrawalAmountQuota(req createAgentWithdrawalRequest) int {
	if req.AmountQuota > 0 {
		return req.AmountQuota
	}
	if req.Amount <= 0 {
		return 0
	}
	return common.QuotaRound(req.Amount * common.QuotaPerUnit)
}

func resolveAgentProfileUpdate(req upsertAgentProfileRequest) (bool, int, error) {
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	manualRate := false
	if req.ManualRate != nil {
		manualRate = *req.ManualRate
	} else if req.CommissionRate > 0 || req.CommissionRateBps > 0 {
		manualRate = true
	}
	if !manualRate {
		return enabled, 0, nil
	}
	if req.CommissionRateBps > 0 {
		if !model.IsAllowedAgentCommissionRateBps(req.CommissionRateBps) {
			return false, 0, fmt.Errorf("佣金比例只能是 7%%、10%% 或 13%%")
		}
		return enabled, req.CommissionRateBps, nil
	}
	rateBps, err := model.NormalizeAgentCommissionRateBps(req.CommissionRate)
	return enabled, rateBps, err
}

func GetAgentSummary(c *gin.Context) {
	summary, err := model.GetAgentSummary(c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, summary)
}

func GetAgentCustomers(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	customers, total, err := model.GetAgentCustomers(c.GetInt("id"), pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(customers)
	common.ApiSuccess(c, pageInfo)
}

func GetAgentCommissions(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	commissions, total, err := model.GetAgentCommissions(c.GetInt("id"), pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(commissions)
	common.ApiSuccess(c, pageInfo)
}

func TransferAgentCommission(c *gin.Context) {
	id := c.GetInt("id")
	quota, err := model.TransferAgentCommissionToQuota(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	model.RecordLog(id, model.LogTypeTopup, fmt.Sprintf("代理佣金划转到余额 %s", logger.LogQuota(quota)))
	common.ApiSuccess(c, gin.H{"quota": quota})
}

func GetAgentWithdrawals(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	withdrawals, total, err := model.GetAgentWithdrawals(c.GetInt("id"), pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(withdrawals)
	common.ApiSuccess(c, pageInfo)
}

func CreateAgentWithdrawal(c *gin.Context) {
	req := createAgentWithdrawalRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	amountQuota := agentWithdrawalAmountQuota(req)
	withdrawal, err := model.CreateAgentWithdrawal(
		c.GetInt("id"),
		amountQuota,
		req.PaymentAccount,
		req.PaymentQRCode,
		req.Note,
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	model.RecordLog(c.GetInt("id"), model.LogTypeTopup, fmt.Sprintf("代理申请提现 %s", logger.LogQuota(withdrawal.AmountQuota)))
	common.ApiSuccess(c, withdrawal)
}

func AdminListAgentProfiles(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	profiles, total, err := model.ListAgentProfiles(pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(profiles)
	common.ApiSuccess(c, pageInfo)
}

func AdminUpsertAgentProfile(c *gin.Context) {
	req := upsertAgentProfileRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	enabled, manualRateBps, err := resolveAgentProfileUpdate(req)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	profile, err := model.UpsertAgentProfile(req.UserId, enabled, manualRateBps)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, profile)
}

func AdminAssignAgentCustomer(c *gin.Context) {
	req := assignAgentCustomerRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.AssignAgentCustomer(req.UserId, req.AgentId); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminGetAgentCustomers(c *gin.Context) {
	agentId, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo := common.GetPageQuery(c)
	customers, total, err := model.GetAgentCustomers(agentId, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(customers)
	common.ApiSuccess(c, pageInfo)
}

func AdminListAgentWithdrawals(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	status := parseAgentWithdrawalStatus(c.Query("status"))
	withdrawals, total, err := model.ListAgentWithdrawals(status, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(withdrawals)
	common.ApiSuccess(c, pageInfo)
}

func AdminGetAgentWithdrawal(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	withdrawal, err := model.GetAgentWithdrawalView(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, withdrawal)
}

func AdminProcessAgentWithdrawal(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	req := processAgentWithdrawalRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	withdrawal, err := model.ProcessAgentWithdrawal(id, c.GetInt("id"), req.Status, req.AdminNote)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, withdrawal)
}
