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
import { ROLE } from '@/lib/roles'

import type {
  PromptAuditAction,
  PromptAuditActionFilter,
  PromptAuditMode,
  PromptAuditSettingsForm,
  PromptAuditSettingsDraft,
  PromptAuditSettingsErrors,
  PromptAuditSettingsPayload,
} from './types'

export function normalizePromptAuditSearch(input: {
  page?: number
  pageSize?: number
}) {
  const rawPage = input.page
  const rawPageSize = input.pageSize
  const page =
    typeof rawPage === 'number' && Number.isInteger(rawPage) && rawPage >= 1
      ? rawPage
      : 1
  const pageSize =
    typeof rawPageSize === 'number' &&
    Number.isInteger(rawPageSize) &&
    rawPageSize >= 1 &&
    rawPageSize <= 100
      ? rawPageSize
      : undefined
  return { page, pageSize }
}

export function parseOptionalNumber(value: string): number | undefined {
  if (value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function resetPromptAuditSettingsDraft(
  settings:
    | PromptAuditSettingsForm
    | Omit<PromptAuditSettingsForm, 'clear_key'>,
  _testPrompt = ''
) {
  return {
    form: {
      ...settings,
      latest_context_only: settings.latest_context_only ?? false,
      sampling_rate: settings.sampling_rate ?? 1,
      api_key: '',
      clear_key: false,
    },
    testPrompt: '',
    testResult: null,
  }
}

export function validatePromptAuditSettingsDraft(
  form: PromptAuditSettingsDraft
): PromptAuditSettingsErrors {
  const errors: PromptAuditSettingsErrors = {}
  if (!form.model.trim()) errors.model = 'Model is required'
  if (form.enabled && !form.base_url.trim()) {
    errors.base_url = 'Base URL is required when audit is enabled'
  }
  if (
    form.enabled &&
    !form.api_key.trim() &&
    (form.clear_key || !form.key_configured)
  ) {
    errors.api_key = 'API key is required when audit is enabled'
  }
  if (form.base_url.trim()) {
    try {
      const baseURL = new URL(form.base_url)
      if (
        !baseURL.host ||
        (baseURL.protocol !== 'http:' && baseURL.protocol !== 'https:')
      ) {
        errors.base_url = 'Base URL must be a valid HTTP or HTTPS URL'
      }
    } catch {
      errors.base_url = 'Base URL must be a valid HTTP or HTTPS URL'
    }
  }
  if (form.threshold == null) errors.threshold = 'Threshold is required'
  else if (form.threshold < 0 || form.threshold > 1) {
    errors.threshold = 'Threshold must be between 0 and 1'
  }
  if (
    form.sampling_rate == null ||
    !Number.isFinite(form.sampling_rate) ||
    form.sampling_rate < 0 ||
    form.sampling_rate > 1
  ) {
    errors.sampling_rate = 'Sampling rate must be between 0 and 1'
  }

  const integerRange = (
    key: keyof PromptAuditSettingsDraft,
    value: number | undefined,
    min: number,
    max: number,
    message: string
  ) => {
    if (
      value == null ||
      !Number.isInteger(value) ||
      value < min ||
      value > max
    ) {
      errors[key] = message
    }
  }
  integerRange(
    'timeout_seconds',
    form.timeout_seconds,
    1,
    30,
    'Timeout must be a whole number between 1 and 30 seconds'
  )
  integerRange(
    'async_concurrency',
    form.async_concurrency,
    1,
    100,
    'Concurrency must be a whole number between 1 and 100'
  )
  integerRange(
    'async_queue_size',
    form.async_queue_size,
    1,
    10000,
    'Queue size must be a whole number between 1 and 10000'
  )
  integerRange(
    'allowed_retention_days',
    form.allowed_retention_days,
    1,
    365,
    'Retention must be a whole number between 1 and 365 days'
  )
  integerRange(
    'blocked_retention_days',
    form.blocked_retention_days,
    1,
    365,
    'Retention must be a whole number between 1 and 365 days'
  )
  return errors
}

export function buildPromptAuditLogParams(input: {
  action: PromptAuditActionFilter
  userId: string
  startTime?: number
  endTime?: number
  page: number
  pageSize: number
}) {
  const normalized = normalizePromptAuditSearch({
    page: input.page,
    pageSize: input.pageSize,
  })
  const params: {
    action?: string
    user_id?: number
    start_timestamp?: number
    end_timestamp?: number
    page: number
    page_size: number
  } = { page: normalized.page, page_size: normalized.pageSize ?? 20 }
  if (input.action !== 'all') params.action = input.action
  const userId = Number(input.userId)
  if (input.userId.trim() && Number.isInteger(userId) && userId > 0) {
    params.user_id = userId
  }
  if (typeof input.startTime === 'number' && Number.isFinite(input.startTime)) {
    params.start_timestamp = Math.floor(input.startTime / 1000)
  }
  if (typeof input.endTime === 'number' && Number.isFinite(input.endTime)) {
    params.end_timestamp = Math.floor(input.endTime / 1000)
  }
  return params
}

export function getPromptAuditDefaultTimeRange(now = new Date()) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return {
    startTime: start.getTime(),
    endTime: now.getTime() + 60 * 60 * 1000,
  }
}

export function isPromptAuditDateRangeValid(
  startTime?: number,
  endTime?: number
): boolean {
  return getPromptAuditDateRangeErrorKey(startTime, endTime) == null
}

export function getPromptAuditDateRangeErrorKey(
  startTime?: number,
  endTime?: number
): string | undefined {
  if (
    typeof startTime !== 'number' ||
    !Number.isFinite(startTime) ||
    typeof endTime !== 'number' ||
    !Number.isFinite(endTime)
  ) {
    return 'Start and end time are required'
  }
  if (startTime > endTime) return 'Start time must be before end time'
  return undefined
}

export function buildPromptAuditFilterSearch(input: {
  startTime?: number
  endTime?: number
  action: PromptAuditActionFilter
  userId: string
}) {
  return {
    page: 1,
    startTime: input.startTime,
    endTime: input.endTime,
    action: input.action === 'all' ? undefined : input.action,
    userId: input.userId.trim() || undefined,
  }
}

export function isSamePromptAuditLogSearch(
  current: {
    startTime?: number
    endTime?: number
    action?: PromptAuditActionFilter
    userId?: string
  },
  next: {
    startTime?: number
    endTime?: number
    action?: PromptAuditActionFilter
    userId?: string
  },
  pageIndex: number
): boolean {
  return (
    pageIndex === 0 &&
    next.startTime === current.startTime &&
    next.endTime === current.endTime &&
    (next.action ?? 'all') === (current.action ?? 'all') &&
    (next.userId ?? '') === (current.userId ?? '')
  )
}

export function buildPromptAuditSettingsPayload(
  form: PromptAuditSettingsForm
): PromptAuditSettingsPayload {
  const { api_key, clear_key, key_configured: _, ...settings } = form
  if (clear_key) return { ...settings, clear_key: true }
  if (api_key.trim()) return { ...settings, api_key: api_key.trim() }
  return settings
}

export function formatPromptAuditConfidence(value: number | null): string {
  return value == null ? '—' : value.toFixed(2)
}

export function summarizePrompt(prompt: string, maxLength = 80): string {
  const normalized = prompt.replaceAll(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}…`
}

export function canAccessPromptAudit(role?: number): boolean {
  return role === ROLE.SUPER_ADMIN
}

export function isPromptAuditTestBlocked(
  confidence: number,
  threshold: number
): boolean {
  return confidence >= threshold
}

export function getPromptAuditModeLabelKey(mode: PromptAuditMode): string {
  return mode === 'blocking'
    ? 'Pre-request blocking'
    : 'Asynchronous observation'
}

export function hasPromptAuditCacheHistory(input: {
  action: PromptAuditAction
  confidence: number | null
  reason: string
  cache_source_request_id: string
  cache_source_reason: string
}): boolean {
  return Boolean(
    input.cache_source_request_id ||
    input.cache_source_reason ||
    (input.action === 'allowed' &&
      input.confidence == null &&
      input.reason === '命中对话放行缓存')
  )
}

export function hasPromptAuditBlockHistory(input: {
  action: PromptAuditAction
  confidence: number | null
  reason: string
  block_source_request_id: string
  block_source_reason: string
}): boolean {
  return Boolean(
    input.block_source_request_id ||
    input.block_source_reason ||
    (input.action === 'blocked' &&
      input.confidence == null &&
      input.reason === '命中已拦截对话')
  )
}
