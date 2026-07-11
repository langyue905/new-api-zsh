package model

import (
	"errors"
	"fmt"
	"math"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/bytedance/gopkg/util/gopool"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	AgentDefaultCommissionRateBps   = 700
	AgentTierTwoCommissionRateBps   = 1000
	AgentTierThreeCommissionRateBps = 1300

	agentCommissionRateBase     = 10000
	agentPaymentQRCodeMaxLength = 60000
)

const (
	AgentWithdrawalStatusPending  = 1
	AgentWithdrawalStatusPaid     = 2
	AgentWithdrawalStatusRejected = 3
)

type AgentProfile struct {
	Id                        int   `json:"id"`
	UserId                    int   `json:"user_id" gorm:"uniqueIndex;not null"`
	Enabled                   bool  `json:"enabled"`
	ManualRateBps             int   `json:"manual_rate_bps" gorm:"default:0"`
	CurrentRateBps            int   `json:"current_rate_bps" gorm:"default:700"`
	TotalCustomerConsumeQuota int64 `json:"total_customer_consume_quota" gorm:"bigint;default:0"`
	PendingCommissionQuota    int   `json:"pending_commission_quota" gorm:"default:0"`
	TransferredQuota          int   `json:"transferred_quota" gorm:"default:0"`
	WithdrawingQuota          int   `json:"withdrawing_quota" gorm:"default:0"`
	WithdrawnQuota            int   `json:"withdrawn_quota" gorm:"default:0"`
	TotalCommissionQuota      int   `json:"total_commission_quota" gorm:"default:0"`
	CreatedAt                 int64 `json:"created_at" gorm:"autoCreateTime;column:created_at"`
	UpdatedAt                 int64 `json:"updated_at" gorm:"autoUpdateTime;column:updated_at"`
}

type AgentCommission struct {
	Id                int    `json:"id"`
	AgentUserId       int    `json:"agent_user_id" gorm:"index;not null"`
	CustomerUserId    int    `json:"customer_user_id" gorm:"index;not null"`
	ConsumeLogId      int    `json:"consume_log_id" gorm:"index;default:0"`
	RequestId         string `json:"request_id" gorm:"type:varchar(128);index;default:''"`
	IdempotencyKey    string `json:"idempotency_key" gorm:"type:varchar(160);uniqueIndex;not null"`
	ModelName         string `json:"model_name" gorm:"index;default:''"`
	Group             string `json:"group" gorm:"index;default:''"`
	Quota             int    `json:"quota" gorm:"default:0"`
	CommissionQuota   int    `json:"commission_quota" gorm:"default:0"`
	CommissionRateBps int    `json:"commission_rate_bps" gorm:"default:700"`
	CreatedAt         int64  `json:"created_at" gorm:"autoCreateTime;column:created_at"`
}

type AgentWithdrawal struct {
	Id             int    `json:"id"`
	AgentUserId    int    `json:"agent_user_id" gorm:"index;not null"`
	AmountQuota    int    `json:"amount_quota" gorm:"default:0"`
	PaymentAccount string `json:"payment_account" gorm:"type:varchar(255);default:''"`
	PaymentQRCode  string `json:"payment_qr_code" gorm:"type:text"`
	Note           string `json:"note" gorm:"type:varchar(500);default:''"`
	AdminNote      string `json:"admin_note" gorm:"type:varchar(500);default:''"`
	Status         int    `json:"status" gorm:"index;default:1"`
	ProcessedBy    int    `json:"processed_by" gorm:"default:0"`
	CreatedAt      int64  `json:"created_at" gorm:"autoCreateTime;column:created_at"`
	UpdatedAt      int64  `json:"updated_at" gorm:"autoUpdateTime;column:updated_at"`
	ProcessedAt    int64  `json:"processed_at" gorm:"default:0;column:processed_at"`
}

type AgentSummary struct {
	Enabled                   bool    `json:"enabled"`
	ManualRateBps             int     `json:"manual_rate_bps"`
	CurrentRateBps            int     `json:"current_rate_bps"`
	CommissionRate            float64 `json:"commission_rate"`
	AffCode                   string  `json:"aff_code"`
	CustomerCount             int64   `json:"customer_count"`
	TotalCustomerConsumeQuota int64   `json:"total_customer_consume_quota"`
	PendingCommissionQuota    int     `json:"pending_commission_quota"`
	WithdrawableQuota         int     `json:"withdrawable_quota"`
	WithdrawingQuota          int     `json:"withdrawing_quota"`
	TransferredQuota          int     `json:"transferred_quota"`
	WithdrawnQuota            int     `json:"withdrawn_quota"`
	TotalCommissionQuota      int     `json:"total_commission_quota"`
	PendingWithdrawalCount    int64   `json:"pending_withdrawal_count"`
	MinimumWithdrawalQuota    int     `json:"minimum_withdrawal_quota"`
	NextTierThresholdQuota    int64   `json:"next_tier_threshold_quota"`
	NextTierCommissionRateBps int     `json:"next_tier_commission_rate_bps"`
}

type AgentCustomer struct {
	Id           int    `json:"id"`
	Username     string `json:"username"`
	DisplayName  string `json:"display_name"`
	Email        string `json:"email"`
	Quota        int    `json:"quota"`
	UsedQuota    int    `json:"used_quota"`
	RequestCount int    `json:"request_count"`
	Group        string `json:"group"`
	CreatedAt    int64  `json:"created_at"`
}

type AgentProfileView struct {
	UserId                    int     `json:"user_id"`
	Username                  string  `json:"username"`
	DisplayName               string  `json:"display_name"`
	Email                     string  `json:"email"`
	Enabled                   bool    `json:"enabled"`
	ManualRateBps             int     `json:"manual_rate_bps"`
	CurrentRateBps            int     `json:"current_rate_bps"`
	CommissionRate            float64 `json:"commission_rate"`
	CustomerCount             int64   `json:"customer_count"`
	TotalCustomerConsumeQuota int64   `json:"total_customer_consume_quota"`
	PendingCommissionQuota    int     `json:"pending_commission_quota"`
	WithdrawingQuota          int     `json:"withdrawing_quota"`
	TransferredQuota          int     `json:"transferred_quota"`
	WithdrawnQuota            int     `json:"withdrawn_quota"`
	TotalCommissionQuota      int     `json:"total_commission_quota"`
	CreatedAt                 int64   `json:"created_at"`
	UpdatedAt                 int64   `json:"updated_at"`
}

type AgentWithdrawalView struct {
	Id             int    `json:"id"`
	AgentUserId    int    `json:"agent_user_id"`
	Username       string `json:"username"`
	DisplayName    string `json:"display_name"`
	Email          string `json:"email"`
	AmountQuota    int    `json:"amount_quota"`
	PaymentAccount string `json:"payment_account"`
	PaymentQRCode  string `json:"payment_qr_code"`
	Note           string `json:"note"`
	AdminNote      string `json:"admin_note"`
	Status         int    `json:"status"`
	ProcessedBy    int    `json:"processed_by"`
	CreatedAt      int64  `json:"created_at"`
	UpdatedAt      int64  `json:"updated_at"`
	ProcessedAt    int64  `json:"processed_at"`
}

func AgentTierTwoThresholdQuota() int64 {
	return int64(100 * common.QuotaPerUnit)
}

func AgentTierThreeThresholdQuota() int64 {
	return int64(1000 * common.QuotaPerUnit)
}

func AgentMinimumWithdrawalQuota() int {
	return int(10 * common.QuotaPerUnit)
}

func AgentCommissionRateFromBps(rateBps int) float64 {
	return float64(rateBps) / float64(agentCommissionRateBase)
}

func IsAllowedAgentCommissionRateBps(rateBps int) bool {
	switch rateBps {
	case AgentDefaultCommissionRateBps, AgentTierTwoCommissionRateBps, AgentTierThreeCommissionRateBps:
		return true
	default:
		return false
	}
}

func NormalizeAgentCommissionRateBps(rate float64) (int, error) {
	if rate <= 0 {
		return 0, nil
	}
	var rateBps int
	switch {
	case rate <= 1:
		rateBps = int(math.Round(rate * agentCommissionRateBase))
	case rate <= 100:
		rateBps = int(math.Round(rate * 100))
	default:
		rateBps = int(math.Round(rate))
	}
	if !IsAllowedAgentCommissionRateBps(rateBps) {
		return 0, errors.New("佣金比例只能是 7%、10% 或 13%")
	}
	return rateBps, nil
}

func resolveAutoAgentRateBps(totalCustomerConsumeQuota int64) int {
	if totalCustomerConsumeQuota >= AgentTierThreeThresholdQuota() {
		return AgentTierThreeCommissionRateBps
	}
	if totalCustomerConsumeQuota >= AgentTierTwoThresholdQuota() {
		return AgentTierTwoCommissionRateBps
	}
	return AgentDefaultCommissionRateBps
}

func resolveEffectiveAgentRateBps(profile AgentProfile, projectedTotalCustomerConsumeQuota int64) int {
	if profile.ManualRateBps > 0 {
		return profile.ManualRateBps
	}
	return resolveAutoAgentRateBps(projectedTotalCustomerConsumeQuota)
}

func resolveCurrentAgentRateBps(profile AgentProfile) int {
	if profile.ManualRateBps > 0 {
		return profile.ManualRateBps
	}
	rateBps := profile.CurrentRateBps
	if rateBps <= 0 {
		rateBps = resolveAutoAgentRateBps(profile.TotalCustomerConsumeQuota)
	}
	return rateBps
}

func nextAgentTier(totalCustomerConsumeQuota int64, manualRateBps int) (int64, int) {
	if manualRateBps > 0 {
		return 0, 0
	}
	if totalCustomerConsumeQuota < AgentTierTwoThresholdQuota() {
		return AgentTierTwoThresholdQuota(), AgentTierTwoCommissionRateBps
	}
	if totalCustomerConsumeQuota < AgentTierThreeThresholdQuota() {
		return AgentTierThreeThresholdQuota(), AgentTierThreeCommissionRateBps
	}
	return 0, 0
}

func withAgentUpdateLock(tx *gorm.DB) *gorm.DB {
	if common.UsingMainDatabase(common.DatabaseTypeSQLite) {
		return tx
	}
	return tx.Clauses(clause.Locking{Strength: "UPDATE"})
}

func EnsureUserAffCode(userId int) (string, error) {
	if userId <= 0 {
		return "", errors.New("用户ID无效")
	}
	var user User
	if err := DB.Select("id", "aff_code").First(&user, "id = ?", userId).Error; err != nil {
		return "", err
	}
	if user.AffCode != "" {
		return user.AffCode, nil
	}
	code := common.GetRandomString(8)
	if err := DB.Model(&User{}).Where("id = ?", userId).Update("aff_code", code).Error; err != nil {
		return "", err
	}
	return code, nil
}

func GetAgentProfileByUserId(userId int) (*AgentProfile, error) {
	var profile AgentProfile
	err := DB.Where("user_id = ?", userId).First(&profile).Error
	return &profile, err
}

func EnsureAgentProfile(userId int) (*AgentProfile, error) {
	return ensureAgentProfileWithTx(DB, userId, false)
}

func ensureAgentProfileWithTx(tx *gorm.DB, userId int, lock bool) (*AgentProfile, error) {
	if userId <= 0 {
		return nil, errors.New("代理用户ID无效")
	}
	query := tx
	if lock {
		query = withAgentUpdateLock(query)
	}
	var profile AgentProfile
	err := query.Where("user_id = ?", userId).First(&profile).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		var user User
		if err := tx.Select("id").First(&user, "id = ?", userId).Error; err != nil {
			return nil, err
		}
		profile = AgentProfile{
			UserId:         userId,
			Enabled:        true,
			CurrentRateBps: AgentDefaultCommissionRateBps,
		}
		if err := tx.Create(&profile).Error; err != nil {
			return nil, err
		}
		return &profile, nil
	}
	if err != nil {
		return nil, err
	}
	if profile.CurrentRateBps <= 0 {
		profile.CurrentRateBps = resolveCurrentAgentRateBps(profile)
	}
	return &profile, nil
}

func ResolveAgentIdForInviter(inviterId int) int {
	return resolveAgentIdForInviterWithTx(DB, inviterId)
}

func resolveAgentIdForInviterWithTx(tx *gorm.DB, inviterId int) int {
	if inviterId <= 0 {
		return 0
	}
	var profile AgentProfile
	err := tx.Select("enabled").Where("user_id = ?", inviterId).First(&profile).Error
	if err == nil && !profile.Enabled {
		return 0
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return 0
	}
	return inviterId
}

func UpsertAgentProfile(userId int, enabled bool, manualRateBps int) (*AgentProfile, error) {
	if manualRateBps != 0 && !IsAllowedAgentCommissionRateBps(manualRateBps) {
		return nil, errors.New("佣金比例只能是 7%、10% 或 13%")
	}
	var profile *AgentProfile
	err := DB.Transaction(func(tx *gorm.DB) error {
		existing, err := ensureAgentProfileWithTx(tx, userId, true)
		if err != nil {
			return err
		}
		currentRateBps := manualRateBps
		if currentRateBps == 0 {
			currentRateBps = resolveAutoAgentRateBps(existing.TotalCustomerConsumeQuota)
		}
		updates := map[string]interface{}{
			"enabled":          enabled,
			"manual_rate_bps":  manualRateBps,
			"current_rate_bps": currentRateBps,
		}
		if err := tx.Model(&AgentProfile{}).Where("id = ?", existing.Id).Updates(updates).Error; err != nil {
			return err
		}
		if err := tx.First(existing, existing.Id).Error; err != nil {
			return err
		}
		profile = existing
		return nil
	})
	if err != nil {
		return nil, err
	}
	_, _ = EnsureUserAffCode(userId)
	return profile, nil
}

func AssignAgentCustomer(customerUserId int, agentUserId int) error {
	if customerUserId <= 0 {
		return errors.New("客户用户ID无效")
	}
	if agentUserId == customerUserId {
		return errors.New("代理不能绑定自己")
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var customer User
		if err := tx.Select("id").First(&customer, "id = ?", customerUserId).Error; err != nil {
			return err
		}
		if agentUserId > 0 {
			agentId := resolveAgentIdForInviterWithTx(tx, agentUserId)
			if agentId == 0 {
				return errors.New("代理账号不存在或已禁用")
			}
		}
		return tx.Model(&User{}).Where("id = ?", customerUserId).Update("agent_id", agentUserId).Error
	})
}

func agentCommissionIdempotencyKey(log *Log) string {
	if log == nil {
		return ""
	}
	if log.RequestId != "" {
		return "request:" + log.RequestId
	}
	if log.Id > 0 {
		return fmt.Sprintf("consume-log:%d", log.Id)
	}
	return ""
}

func isAgentDuplicateKeyError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		return true
	}
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "duplicate") ||
		strings.Contains(message, "duplicated") ||
		strings.Contains(message, "unique constraint") ||
		strings.Contains(message, "constraint failed")
}

func RecordAgentCommissionForConsumeLog(log *Log) error {
	if log == nil || log.Type != LogTypeConsume || log.UserId <= 0 || log.Quota <= 0 {
		return nil
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var customer User
		if err := tx.Select("id", "agent_id").First(&customer, "id = ?", log.UserId).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil
			}
			return err
		}
		if customer.AgentId <= 0 || customer.AgentId == customer.Id {
			return nil
		}

		idempotencyKey := agentCommissionIdempotencyKey(log)
		if idempotencyKey != "" {
			var existing int64
			if err := tx.Model(&AgentCommission{}).Where("idempotency_key = ?", idempotencyKey).Count(&existing).Error; err != nil {
				return err
			}
			if existing > 0 {
				return nil
			}
		} else {
			idempotencyKey = "generated:" + common.NewRequestId()
		}

		profile, err := ensureAgentProfileWithTx(tx, customer.AgentId, true)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil
			}
			return err
		}
		if !profile.Enabled {
			return nil
		}

		totalAfter := profile.TotalCustomerConsumeQuota + int64(log.Quota)
		rateBps := resolveEffectiveAgentRateBps(*profile, totalAfter)
		commissionQuota := int(int64(log.Quota) * int64(rateBps) / int64(agentCommissionRateBase))
		if commissionQuota > 0 {
			commission := AgentCommission{
				AgentUserId:       customer.AgentId,
				CustomerUserId:    customer.Id,
				ConsumeLogId:      log.Id,
				RequestId:         log.RequestId,
				IdempotencyKey:    idempotencyKey,
				ModelName:         log.ModelName,
				Group:             log.Group,
				Quota:             log.Quota,
				CommissionQuota:   commissionQuota,
				CommissionRateBps: rateBps,
			}
			if err := tx.Create(&commission).Error; err != nil {
				if isAgentDuplicateKeyError(err) {
					return nil
				}
				return err
			}
		}

		updates := map[string]interface{}{
			"total_customer_consume_quota": gorm.Expr("total_customer_consume_quota + ?", log.Quota),
			"current_rate_bps":             rateBps,
		}
		if commissionQuota > 0 {
			updates["pending_commission_quota"] = gorm.Expr("pending_commission_quota + ?", commissionQuota)
			updates["total_commission_quota"] = gorm.Expr("total_commission_quota + ?", commissionQuota)
		}
		return tx.Model(&AgentProfile{}).Where("id = ?", profile.Id).Updates(updates).Error
	})
}

func GetAgentSummary(agentUserId int) (AgentSummary, error) {
	summary := AgentSummary{MinimumWithdrawalQuota: AgentMinimumWithdrawalQuota()}
	affCode, _ := EnsureUserAffCode(agentUserId)
	summary.AffCode = affCode
	profile, err := EnsureAgentProfile(agentUserId)
	if err != nil {
		return summary, err
	}
	currentRateBps := resolveCurrentAgentRateBps(*profile)
	nextThreshold, nextRateBps := nextAgentTier(profile.TotalCustomerConsumeQuota, profile.ManualRateBps)

	summary.Enabled = profile.Enabled
	summary.ManualRateBps = profile.ManualRateBps
	summary.CurrentRateBps = currentRateBps
	summary.CommissionRate = AgentCommissionRateFromBps(currentRateBps)
	summary.TotalCustomerConsumeQuota = profile.TotalCustomerConsumeQuota
	summary.PendingCommissionQuota = profile.PendingCommissionQuota
	summary.WithdrawableQuota = profile.PendingCommissionQuota
	summary.WithdrawingQuota = profile.WithdrawingQuota
	summary.TransferredQuota = profile.TransferredQuota
	summary.WithdrawnQuota = profile.WithdrawnQuota
	summary.TotalCommissionQuota = profile.TotalCommissionQuota
	summary.NextTierThresholdQuota = nextThreshold
	summary.NextTierCommissionRateBps = nextRateBps
	_ = DB.Model(&User{}).Where("agent_id = ?", agentUserId).Count(&summary.CustomerCount).Error
	_ = DB.Model(&AgentWithdrawal{}).Where("agent_user_id = ? AND status = ?", agentUserId, AgentWithdrawalStatusPending).Count(&summary.PendingWithdrawalCount).Error
	return summary, nil
}

func GetAgentCustomers(agentUserId int, startIdx int, num int) ([]AgentCustomer, int64, error) {
	var users []User
	var total int64
	query := DB.Model(&User{}).Where("agent_id = ?", agentUserId)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := query.Order("id desc").Limit(num).Offset(startIdx).Find(&users).Error
	if err != nil {
		return nil, 0, err
	}
	customers := make([]AgentCustomer, 0, len(users))
	for _, user := range users {
		customers = append(customers, AgentCustomer{
			Id:           user.Id,
			Username:     user.Username,
			DisplayName:  user.DisplayName,
			Email:        user.Email,
			Quota:        user.Quota,
			UsedQuota:    user.UsedQuota,
			RequestCount: user.RequestCount,
			Group:        user.Group,
			CreatedAt:    user.CreatedAt,
		})
	}
	return customers, total, nil
}

func GetAgentCommissions(agentUserId int, startIdx int, num int) ([]AgentCommission, int64, error) {
	var commissions []AgentCommission
	var total int64
	query := DB.Model(&AgentCommission{}).Where("agent_user_id = ?", agentUserId)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := query.Order("id desc").Limit(num).Offset(startIdx).Find(&commissions).Error
	return commissions, total, err
}

func TransferAgentCommissionToQuota(agentUserId int) (int, error) {
	var transferred int
	err := DB.Transaction(func(tx *gorm.DB) error {
		profile, err := ensureAgentProfileWithTx(tx, agentUserId, true)
		if err != nil {
			return err
		}
		if !profile.Enabled {
			return errors.New("代理账号已禁用")
		}
		if profile.PendingCommissionQuota <= 0 {
			return errors.New("暂无可划转佣金")
		}
		transferred = profile.PendingCommissionQuota
		if err := tx.Model(&AgentProfile{}).Where("id = ?", profile.Id).Updates(map[string]interface{}{
			"pending_commission_quota": 0,
			"transferred_quota":        gorm.Expr("transferred_quota + ?", transferred),
		}).Error; err != nil {
			return err
		}
		return tx.Model(&User{}).Where("id = ?", agentUserId).Update("quota", gorm.Expr("quota + ?", transferred)).Error
	})
	if err != nil {
		return 0, err
	}
	gopool.Go(func() {
		if err := cacheIncrUserQuota(agentUserId, int64(transferred)); err != nil {
			common.SysLog("failed to increase agent quota cache: " + err.Error())
		}
	})
	return transferred, nil
}

func validateAgentWithdrawalAmount(amountQuota int) error {
	minQuota := AgentMinimumWithdrawalQuota()
	if amountQuota < minQuota {
		return fmt.Errorf("提现最低金额为 %d 元", 10)
	}
	if amountQuota%minQuota != 0 {
		return errors.New("提现金额必须是 10 的倍数")
	}
	return nil
}

func CreateAgentWithdrawal(agentUserId int, amountQuota int, paymentAccount string, paymentQRCode string, note string) (*AgentWithdrawal, error) {
	if err := validateAgentWithdrawalAmount(amountQuota); err != nil {
		return nil, err
	}
	paymentAccount = strings.TrimSpace(paymentAccount)
	paymentQRCode = strings.TrimSpace(paymentQRCode)
	note = strings.TrimSpace(note)
	var withdrawal AgentWithdrawal
	err := DB.Transaction(func(tx *gorm.DB) error {
		profile, err := ensureAgentProfileWithTx(tx, agentUserId, true)
		if err != nil {
			return err
		}
		if !profile.Enabled {
			return errors.New("代理账号已禁用")
		}
		if profile.PendingCommissionQuota < amountQuota {
			return errors.New("可提现佣金不足")
		}
		if paymentAccount == "" && paymentQRCode == "" {
			return errors.New("请填写收款账号或上传收款码")
		}
		if len(paymentQRCode) > agentPaymentQRCodeMaxLength {
			return errors.New("收款码图片太大，请上传更小的收款码")
		}
		withdrawal = AgentWithdrawal{
			AgentUserId:    agentUserId,
			AmountQuota:    amountQuota,
			PaymentAccount: paymentAccount,
			PaymentQRCode:  paymentQRCode,
			Note:           note,
			Status:         AgentWithdrawalStatusPending,
		}
		if err := tx.Create(&withdrawal).Error; err != nil {
			return err
		}
		return tx.Model(&AgentProfile{}).Where("id = ?", profile.Id).Updates(map[string]interface{}{
			"pending_commission_quota": gorm.Expr("pending_commission_quota - ?", amountQuota),
			"withdrawing_quota":        gorm.Expr("withdrawing_quota + ?", amountQuota),
		}).Error
	})
	if err != nil {
		return nil, err
	}
	return &withdrawal, nil
}

func GetAgentWithdrawals(agentUserId int, startIdx int, num int) ([]AgentWithdrawal, int64, error) {
	var withdrawals []AgentWithdrawal
	var total int64
	query := DB.Model(&AgentWithdrawal{}).Where("agent_user_id = ?", agentUserId)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := query.Order("id desc").Limit(num).Offset(startIdx).Find(&withdrawals).Error
	return withdrawals, total, err
}

func ListAgentWithdrawals(status int, startIdx int, num int) ([]AgentWithdrawalView, int64, error) {
	var withdrawals []AgentWithdrawalView
	var total int64
	query := DB.Table("agent_withdrawals AS aw")
	if status > 0 {
		query = query.Where("aw.status = ?", status)
	}
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := query.
		Select(`aw.id, aw.agent_user_id, u.username, u.display_name, u.email,
			aw.amount_quota, aw.payment_account, aw.payment_qr_code, aw.note,
			aw.admin_note, aw.status, aw.processed_by, aw.created_at,
			aw.updated_at, aw.processed_at`).
		Joins("LEFT JOIN users AS u ON u.id = aw.agent_user_id").
		Order("aw.id desc").
		Limit(num).Offset(startIdx).
		Scan(&withdrawals).Error
	return withdrawals, total, err
}

func GetAgentWithdrawalView(id int) (*AgentWithdrawalView, error) {
	var withdrawal AgentWithdrawalView
	err := DB.Table("agent_withdrawals AS aw").
		Select(`aw.id, aw.agent_user_id, u.username, u.display_name, u.email,
			aw.amount_quota, aw.payment_account, aw.payment_qr_code, aw.note,
			aw.admin_note, aw.status, aw.processed_by, aw.created_at,
			aw.updated_at, aw.processed_at`).
		Joins("LEFT JOIN users AS u ON u.id = aw.agent_user_id").
		Where("aw.id = ?", id).
		First(&withdrawal).Error
	return &withdrawal, err
}

func ProcessAgentWithdrawal(id int, adminUserId int, status int, adminNote string) (*AgentWithdrawal, error) {
	if status != AgentWithdrawalStatusPaid && status != AgentWithdrawalStatusRejected {
		return nil, errors.New("提现处理状态无效")
	}
	var withdrawal AgentWithdrawal
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := withAgentUpdateLock(tx).First(&withdrawal, "id = ?", id).Error; err != nil {
			return err
		}
		if withdrawal.Status != AgentWithdrawalStatusPending {
			return errors.New("该提现申请已处理")
		}
		profile, err := ensureAgentProfileWithTx(tx, withdrawal.AgentUserId, true)
		if err != nil {
			return err
		}
		if profile.WithdrawingQuota < withdrawal.AmountQuota {
			return errors.New("代理提现中余额异常")
		}
		profileUpdates := map[string]interface{}{
			"withdrawing_quota": gorm.Expr("withdrawing_quota - ?", withdrawal.AmountQuota),
		}
		if status == AgentWithdrawalStatusPaid {
			profileUpdates["withdrawn_quota"] = gorm.Expr("withdrawn_quota + ?", withdrawal.AmountQuota)
		} else {
			profileUpdates["pending_commission_quota"] = gorm.Expr("pending_commission_quota + ?", withdrawal.AmountQuota)
		}
		if err := tx.Model(&AgentProfile{}).Where("id = ?", profile.Id).Updates(profileUpdates).Error; err != nil {
			return err
		}
		return tx.Model(&withdrawal).Updates(map[string]interface{}{
			"status":       status,
			"admin_note":   strings.TrimSpace(adminNote),
			"processed_by": adminUserId,
			"processed_at": common.GetTimestamp(),
		}).Error
	})
	if err != nil {
		return nil, err
	}
	withdrawal.Status = status
	withdrawal.AdminNote = strings.TrimSpace(adminNote)
	withdrawal.ProcessedBy = adminUserId
	withdrawal.ProcessedAt = common.GetTimestamp()
	return &withdrawal, nil
}

func ListAgentProfiles(startIdx int, num int) ([]AgentProfileView, int64, error) {
	var profiles []AgentProfileView
	var total int64
	query := DB.Table("users AS u").Where("u.deleted_at IS NULL")
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := query.
		Select(`u.id AS user_id, u.username, u.display_name, u.email,
			COALESCE(ap.enabled, TRUE) AS enabled,
			COALESCE(ap.manual_rate_bps, 0) AS manual_rate_bps,
			COALESCE(ap.current_rate_bps, ?) AS current_rate_bps,
			COALESCE(customer_stats.customer_count, 0) AS customer_count,
			COALESCE(ap.total_customer_consume_quota, 0) AS total_customer_consume_quota,
			COALESCE(ap.pending_commission_quota, 0) AS pending_commission_quota,
			COALESCE(ap.withdrawing_quota, 0) AS withdrawing_quota,
			COALESCE(ap.transferred_quota, 0) AS transferred_quota,
			COALESCE(ap.withdrawn_quota, 0) AS withdrawn_quota,
			COALESCE(ap.total_commission_quota, 0) AS total_commission_quota,
			COALESCE(ap.created_at, 0) AS created_at,
			COALESCE(ap.updated_at, 0) AS updated_at`, AgentDefaultCommissionRateBps).
		Joins("LEFT JOIN agent_profiles AS ap ON ap.user_id = u.id").
		Joins("LEFT JOIN (SELECT agent_id, COUNT(*) AS customer_count FROM users WHERE agent_id > 0 AND deleted_at IS NULL GROUP BY agent_id) AS customer_stats ON customer_stats.agent_id = u.id").
		Order("u.id desc").
		Limit(num).Offset(startIdx).
		Scan(&profiles).Error
	if err != nil {
		return nil, 0, err
	}
	for i := range profiles {
		rateBps := profiles[i].CurrentRateBps
		if profiles[i].ManualRateBps > 0 {
			rateBps = profiles[i].ManualRateBps
			profiles[i].CurrentRateBps = rateBps
		}
		if rateBps <= 0 {
			rateBps = AgentDefaultCommissionRateBps
		}
		profiles[i].CommissionRate = AgentCommissionRateFromBps(rateBps)
	}
	return profiles, total, nil
}
