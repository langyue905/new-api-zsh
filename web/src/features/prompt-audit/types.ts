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
export type PromptAuditAction = 'allowed' | 'blocked'
export type PromptAuditActionFilter = 'all' | PromptAuditAction
export type PromptAuditMode = 'blocking' | 'async'

export type ApiResponse<T> = {
  success: boolean
  message?: string
  data?: T
}

export type PromptAuditLogListItem = {
  id: number
  created_at: number
  action: PromptAuditAction
  confidence: number | null
  user_id: number
  username: string
  group: string
  model: string
  prompt_summary: string
  reason_summary: string
  duration_ms: number
  mode: PromptAuditMode
  actually_blocked: boolean
  request_id: string
}

export type PromptAuditLogDetail = Omit<
  PromptAuditLogListItem,
  'prompt_summary' | 'reason_summary'
> & {
  prompt: string
  reason: string
  audit_model_output: string
  cache_source_request_id: string
  cache_source_reason: string
  block_source_request_id: string
  block_source_reason: string
  conversation_blocked: boolean
}

export type PromptAuditConversationReleaseResult = {
  released: boolean
}

export type PromptAuditLogPage = {
  items: PromptAuditLogListItem[]
  total: number
  page: number
  page_size: number
}

export type PromptAuditSettings = {
  enabled: boolean
  latest_context_only: boolean
  mode: PromptAuditMode
  model: string
  base_url: string
  key_configured: boolean
  system_prompt: string
  sampling_rate: number
  threshold: number
  timeout_seconds: number
  audit_groups: string[]
  async_concurrency: number
  async_queue_size: number
  allowed_retention_days: number
  blocked_retention_days: number
}

export type PromptAuditSettingsForm = PromptAuditSettings & {
  api_key: string
  clear_key: boolean
}

type PromptAuditNumericSetting =
  | 'sampling_rate'
  | 'threshold'
  | 'timeout_seconds'
  | 'async_concurrency'
  | 'async_queue_size'
  | 'allowed_retention_days'
  | 'blocked_retention_days'

export type PromptAuditSettingsDraft = Omit<
  PromptAuditSettingsForm,
  PromptAuditNumericSetting
> & {
  [Key in PromptAuditNumericSetting]: number | undefined
}

export type PromptAuditSettingsErrors = Partial<
  Record<keyof PromptAuditSettingsDraft, string>
>

export type PromptAuditSettingsPayload = Omit<
  PromptAuditSettingsForm,
  'api_key' | 'clear_key' | 'key_configured'
> & {
  api_key?: string
  clear_key?: boolean
}

export type PromptAuditTestResult = {
  confidence: number
  reason: string
  duration_ms: number
  blocked: boolean
}

export type PromptAuditCleanupResult = {
  allowed_deleted: number
  blocked_deleted: number
}
