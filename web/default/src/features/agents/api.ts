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
import { api } from '@/lib/api'

import { buildAdminAgentProfilesQuery } from './lib/admin-profile-query'
import { buildAgentUsageLogsQuery } from './lib/usage-log-query'
import type {
  AgentCommission,
  AgentCustomer,
  AgentSummary,
  AgentUsageLog,
  AgentProfileView,
  AgentWithdrawal,
  ApiResponse,
  AssignAgentRequest,
  CreateWithdrawalRequest,
  PageResponse,
  ProcessWithdrawalRequest,
  UpdateAgentProfileRequest,
} from './types'

export async function getAgentSummary(): Promise<ApiResponse<AgentSummary>> {
  const res = await api.get('/api/agent/summary')
  return res.data
}

export async function getAgentCustomers(
  page = 1,
  pageSize = 10
): Promise<ApiResponse<PageResponse<AgentCustomer>>> {
  const res = await api.get(
    `/api/agent/customers?p=${page}&page_size=${pageSize}`
  )
  return res.data
}

export async function getAgentCommissions(
  page = 1,
  pageSize = 10
): Promise<ApiResponse<PageResponse<AgentCommission>>> {
  const res = await api.get(
    `/api/agent/commissions?p=${page}&page_size=${pageSize}`
  )
  return res.data
}

export async function getAgentUsageLogs(
  page = 1,
  pageSize = 10
): Promise<ApiResponse<PageResponse<AgentUsageLog>>> {
  const query = buildAgentUsageLogsQuery({ page, pageSize })
  const res = await api.get(`/api/agent/usage-logs?${query}`)
  return res.data
}

export async function getAgentWithdrawals(
  page = 1,
  pageSize = 10
): Promise<ApiResponse<PageResponse<AgentWithdrawal>>> {
  const res = await api.get(
    `/api/agent/withdrawals?p=${page}&page_size=${pageSize}`
  )
  return res.data
}

export async function transferAgentCommission(): Promise<
  ApiResponse<{ quota: number }>
> {
  const res = await api.post('/api/agent/transfer')
  return res.data
}

export async function createAgentWithdrawal(
  request: CreateWithdrawalRequest
): Promise<ApiResponse<AgentWithdrawal>> {
  const res = await api.post('/api/agent/withdrawals', request)
  return res.data
}

export async function getAdminAgentProfiles(
  page = 1,
  pageSize = 20,
  keyword = ''
): Promise<ApiResponse<PageResponse<AgentProfileView>>> {
  const query = buildAdminAgentProfilesQuery({ page, pageSize, keyword })
  const res = await api.get(`/api/agent/admin/profiles?${query}`)
  return res.data
}

export async function updateAdminAgentProfile(
  request: UpdateAgentProfileRequest
): Promise<ApiResponse<AgentProfileView>> {
  const res = await api.post('/api/agent/admin/profiles', request)
  return res.data
}

export async function assignAdminAgentCustomer(
  request: AssignAgentRequest
): Promise<ApiResponse> {
  const res = await api.post('/api/agent/admin/assign', request)
  return res.data
}

export async function getAdminAgentWithdrawals(
  page = 1,
  pageSize = 20,
  status = 0
): Promise<ApiResponse<PageResponse<AgentWithdrawal>>> {
  const params = new URLSearchParams({
    p: page.toString(),
    page_size: pageSize.toString(),
  })
  if (status > 0) {
    params.set('status', status.toString())
  }
  const res = await api.get(`/api/agent/admin/withdrawals?${params}`)
  return res.data
}

export async function processAdminAgentWithdrawal(
  id: number,
  request: ProcessWithdrawalRequest
): Promise<ApiResponse<AgentWithdrawal>> {
  const res = await api.post(
    `/api/agent/admin/withdrawals/${id}/process`,
    request
  )
  return res.data
}
