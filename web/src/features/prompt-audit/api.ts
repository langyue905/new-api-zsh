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

import { buildPromptAuditLogParams } from './lib'
import type {
  ApiResponse,
  PromptAuditActionFilter,
  PromptAuditCleanupResult,
  PromptAuditConversationReleaseResult,
  PromptAuditLogDetail,
  PromptAuditLogPage,
  PromptAuditSettings,
  PromptAuditSettingsPayload,
  PromptAuditTestResult,
} from './types'

export async function getPromptAuditLogs(input: {
  action: PromptAuditActionFilter
  userId: string
  startTime?: number
  endTime?: number
  page: number
  pageSize: number
}) {
  const res = await api.get<ApiResponse<PromptAuditLogPage>>(
    '/api/prompt-audit/logs',
    { params: buildPromptAuditLogParams(input) }
  )
  return res.data
}

export async function getPromptAuditLog(id: number) {
  const res = await api.get<ApiResponse<PromptAuditLogDetail>>(
    `/api/prompt-audit/logs/${id}`
  )
  return res.data
}

export async function releasePromptAuditConversationBlock(id: number) {
  const res = await api.delete<
    ApiResponse<PromptAuditConversationReleaseResult>
  >(`/api/prompt-audit/logs/${id}/conversation-block`)
  return res.data
}

export async function getPromptAuditSettings() {
  const res = await api.get<ApiResponse<PromptAuditSettings>>(
    '/api/prompt-audit/settings'
  )
  if (!res.data.success || !res.data.data) {
    throw new Error(res.data.message || 'Failed to load prompt audit settings')
  }
  return res.data.data
}

export async function getPromptAuditGroups() {
  const res = await api.get<ApiResponse<string[]>>('/api/group')
  if (!res.data.success || !res.data.data) {
    throw new Error(res.data.message || 'Failed to load prompt audit groups')
  }
  return res.data.data
}

export async function updatePromptAuditSettings(
  payload: PromptAuditSettingsPayload
) {
  const res = await api.put<ApiResponse<PromptAuditSettings>>(
    '/api/prompt-audit/settings',
    payload
  )
  return res.data
}

export async function testPromptAuditSettings(
  payload: PromptAuditSettingsPayload & { prompt: string }
) {
  const res = await api.post<ApiResponse<PromptAuditTestResult>>(
    '/api/prompt-audit/test',
    payload
  )
  return res.data
}

export async function cleanupPromptAuditLogs() {
  const res = await api.post<ApiResponse<PromptAuditCleanupResult>>(
    '/api/prompt-audit/logs/cleanup'
  )
  return res.data
}
