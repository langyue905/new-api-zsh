/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
export interface ApiResponse<T = unknown> {
  success?: boolean
  message?: string
  data?: T
}

export interface PageResponse<T> {
  page: number
  page_size: number
  total: number
  items: T[]
}

export interface AgentSummary {
  enabled: boolean
  manual_rate_bps: number
  current_rate_bps: number
  commission_rate: number
  aff_code: string
  customer_count: number
  total_customer_consume_quota: number
  pending_commission_quota: number
  withdrawable_quota: number
  withdrawing_quota: number
  transferred_quota: number
  withdrawn_quota: number
  total_commission_quota: number
  pending_withdrawal_count: number
  minimum_withdrawal_quota: number
  next_tier_threshold_quota: number
  next_tier_commission_rate_bps: number
}

export interface AgentCustomer {
  id: number
  username: string
  display_name?: string
  email?: string
  quota: number
  used_quota: number
  request_count: number
  group: string
  created_at: number
}

export interface AgentCommission {
  id: number
  agent_user_id: number
  customer_user_id: number
  consume_log_id: number
  request_id: string
  model_name: string
  group: string
  quota: number
  commission_quota: number
  commission_rate_bps: number
  created_at: number
}

export interface AgentWithdrawal {
  id: number
  agent_user_id: number
  username?: string
  display_name?: string
  email?: string
  amount_quota: number
  payment_account: string
  payment_qr_code: string
  note: string
  admin_note: string
  status: number
  processed_by: number
  created_at: number
  updated_at: number
  processed_at: number
}

export interface AgentProfileView {
  user_id: number
  username: string
  display_name?: string
  email?: string
  enabled: boolean
  manual_rate_bps: number
  current_rate_bps: number
  commission_rate: number
  customer_count: number
  total_customer_consume_quota: number
  pending_commission_quota: number
  withdrawing_quota: number
  transferred_quota: number
  withdrawn_quota: number
  total_commission_quota: number
  created_at: number
  updated_at: number
}

export interface CreateWithdrawalRequest {
  amount: number
  payment_account: string
  payment_qr_code?: string
  note?: string
}

export interface UpdateAgentProfileRequest {
  user_id: number
  enabled: boolean
  manual_rate: boolean
  commission_rate_bps?: number
}

export interface AssignAgentRequest {
  user_id: number
  agent_id: number
}

export interface ProcessWithdrawalRequest {
  status: number
  admin_note?: string
}
