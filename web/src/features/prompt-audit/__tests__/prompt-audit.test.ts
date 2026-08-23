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
import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import { ROLE } from '@/lib/roles'

import {
  buildPromptAuditFilterSearch,
  buildPromptAuditLogParams,
  buildPromptAuditSettingsPayload,
  canAccessPromptAudit,
  getPromptAuditModeLabelKey,
  isPromptAuditTestBlocked,
  normalizePromptAuditSearch,
  parseOptionalNumber,
  resetPromptAuditSettingsDraft,
  validatePromptAuditSettingsDraft,
  formatPromptAuditConfidence,
  getPromptAuditDefaultTimeRange,
  getPromptAuditDateRangeErrorKey,
  isPromptAuditDateRangeValid,
  isSamePromptAuditLogSearch,
  summarizePrompt,
} from '../lib'
import type { PromptAuditSettings, PromptAuditSettingsForm } from '../types'

const settings: PromptAuditSettingsForm = {
  enabled: true,
  latest_context_only: false,
  mode: 'blocking',
  model: 'audit-model',
  base_url: 'https://example.com/v1',
  key_configured: false,
  api_key: '',
  clear_key: false,
  system_prompt: 'Review the input.',
  sampling_rate: 1,
  threshold: 0.9,
  timeout_seconds: 5,
  audit_groups: ['default'],
  async_concurrency: 10,
  async_queue_size: 1000,
  allowed_retention_days: 1,
  blocked_retention_days: 7,
}

describe('prompt audit request mapping', () => {
  test('maps active filters to backend action and user_id parameters', () => {
    assert.deepEqual(
      buildPromptAuditLogParams({
        action: 'blocked',
        userId: '42',
        startTime: 1_725_000_000_999,
        endTime: 1_725_003_600_001,
        page: 3,
        pageSize: 50,
      }),
      {
        action: 'blocked',
        user_id: 42,
        start_timestamp: 1_725_000_000,
        end_timestamp: 1_725_003_600,
        page: 3,
        page_size: 50,
      }
    )
  })

  test('omits the all-action and empty user filters', () => {
    assert.deepEqual(
      buildPromptAuditLogParams({
        action: 'all',
        userId: '',
        page: 1,
        pageSize: 20,
      }),
      { page: 1, page_size: 20 }
    )
  })

  test('keeps the saved key when the key input is empty', () => {
    const payload = buildPromptAuditSettingsPayload(settings)

    assert.equal('api_key' in payload, false)
    assert.equal('clear_key' in payload, false)
  })

  test('explicitly clears the saved key when requested', () => {
    const payload = buildPromptAuditSettingsPayload({
      ...settings,
      clear_key: true,
    })

    assert.equal(payload.clear_key, true)
    assert.equal('api_key' in payload, false)
  })

  test('sends a replacement key when one is entered', () => {
    const payload = buildPromptAuditSettingsPayload({
      ...settings,
      api_key: 'sk-new',
    })

    assert.equal(payload.api_key, 'sk-new')
    assert.equal('clear_key' in payload, false)
  })

  test('includes the latest-context setting in update and test payloads', () => {
    const payload = buildPromptAuditSettingsPayload({
      ...settings,
      latest_context_only: true,
    })

    assert.equal(payload.latest_context_only, true)
  })

  test('explicitly sends the default false latest-context setting', () => {
    const payload = buildPromptAuditSettingsPayload(settings)

    assert.equal('latest_context_only' in payload, true)
    assert.equal(payload.latest_context_only, false)
  })

  test('includes the sampling rate in update and test payloads', () => {
    const payload = buildPromptAuditSettingsPayload({
      ...settings,
      sampling_rate: 0.2,
    })

    assert.equal(payload.sampling_rate, 0.2)
  })
})

describe('prompt audit filter drafts', () => {
  test('defaults to local midnight through one hour after now', () => {
    const now = new Date(2026, 7, 12, 14, 30, 15, 250)

    assert.deepEqual(getPromptAuditDefaultTimeRange(now), {
      startTime: new Date(2026, 7, 12, 0, 0, 0, 0).getTime(),
      endTime: new Date(2026, 7, 12, 15, 30, 15, 250).getTime(),
    })
  })

  test('commits trimmed drafts and returns to the first page', () => {
    assert.deepEqual(
      buildPromptAuditFilterSearch({
        startTime: 1_725_000_000_000,
        endTime: 1_725_003_600_000,
        action: 'allowed',
        userId: ' 42 ',
      }),
      {
        page: 1,
        startTime: 1_725_000_000_000,
        endTime: 1_725_003_600_000,
        action: 'allowed',
        userId: '42',
      }
    )
  })

  test('clears all-action and blank user drafts when committed', () => {
    assert.deepEqual(
      buildPromptAuditFilterSearch({
        startTime: 1,
        endTime: 2,
        action: 'all',
        userId: ' ',
      }),
      {
        page: 1,
        startTime: 1,
        endTime: 2,
        action: undefined,
        userId: undefined,
      }
    )
  })

  test('rejects a date range whose start is after its end', () => {
    assert.equal(isPromptAuditDateRangeValid(2, 1), false)
    assert.equal(isPromptAuditDateRangeValid(1, 1), true)
    assert.equal(isPromptAuditDateRangeValid(undefined, 1), false)
    assert.equal(isPromptAuditDateRangeValid(1, undefined), false)
  })

  test('returns an accessible error key for missing or reversed dates', () => {
    assert.equal(
      getPromptAuditDateRangeErrorKey(undefined, 1),
      'Start and end time are required'
    )
    assert.equal(
      getPromptAuditDateRangeErrorKey(2, 1),
      'Start time must be before end time'
    )
    assert.equal(getPromptAuditDateRangeErrorKey(1, 2), undefined)
  })

  test('refreshes only when the committed search and first page are unchanged', () => {
    const current = {
      startTime: 1,
      endTime: 2,
      action: 'blocked' as const,
      userId: '42',
    }

    assert.equal(isSamePromptAuditLogSearch(current, current, 0), true)
    assert.equal(
      isSamePromptAuditLogSearch(current, { ...current, userId: '7' }, 0),
      false
    )
    assert.equal(isSamePromptAuditLogSearch(current, current, 1), false)
  })
})

describe('prompt audit display formatting', () => {
  test('formats nullable confidence and rounds values to two decimals', () => {
    assert.equal(formatPromptAuditConfidence(null), '—')
    assert.equal(formatPromptAuditConfidence(0.856), '0.86')
  })

  test('normalizes whitespace and truncates prompt summaries', () => {
    assert.equal(summarizePrompt('  hello\n  world  ', 20), 'hello world')
    assert.equal(summarizePrompt('123456789', 8), '12345…')
  })
})

describe('prompt audit access', () => {
  test('allows only the super administrator role', () => {
    assert.equal(canAccessPromptAudit(ROLE.SUPER_ADMIN), true)
    assert.equal(canAccessPromptAudit(ROLE.ADMIN), false)
    assert.equal(canAccessPromptAudit(undefined), false)
  })
})

describe('prompt audit test result', () => {
  test('blocks when confidence equals the configured threshold', () => {
    assert.equal(isPromptAuditTestBlocked(0.9, 0.9), true)
  })

  test('allows when confidence is below the configured threshold', () => {
    assert.equal(isPromptAuditTestBlocked(0.89, 0.9), false)
  })

  test('maps backend modes to localized label keys', () => {
    assert.equal(getPromptAuditModeLabelKey('blocking'), 'Pre-request blocking')
    assert.equal(
      getPromptAuditModeLabelKey('async'),
      'Asynchronous observation'
    )
  })
})

describe('prompt audit settings contract', () => {
  test('uses key_configured without requiring a masked key field', () => {
    const publicSettings: PromptAuditSettings = {
      key_configured: true,
      enabled: false,
      latest_context_only: false,
      mode: 'blocking' as const,
      model: 'audit-model',
      base_url: '',
      system_prompt: '',
      sampling_rate: 1,
      threshold: 0.9,
      timeout_seconds: 5,
      audit_groups: [],
      async_concurrency: 10,
      async_queue_size: 1000,
      allowed_retention_days: 1,
      blocked_retention_days: 7,
    }

    assert.equal(publicSettings.key_configured, true)
    assert.equal('api_key' in publicSettings, false)
  })
})

describe('prompt audit route search', () => {
  test('keeps valid bounded page values', () => {
    assert.deepEqual(normalizePromptAuditSearch({ page: 3, pageSize: 100 }), {
      page: 3,
      pageSize: 100,
    })
  })

  test('falls back for fractional, non-positive, and oversized values', () => {
    assert.deepEqual(normalizePromptAuditSearch({ page: 1.5, pageSize: 101 }), {
      page: 1,
      pageSize: undefined,
    })
    assert.deepEqual(normalizePromptAuditSearch({ page: 0, pageSize: 0 }), {
      page: 1,
      pageSize: undefined,
    })
  })
})

describe('prompt audit settings draft', () => {
  test('treats an empty number input as missing instead of zero', () => {
    assert.equal(parseOptionalNumber(''), undefined)
    assert.equal(parseOptionalNumber('0'), 0)
  })

  test('resets secrets and test state from the latest loaded settings', () => {
    const reset = resetPromptAuditSettingsDraft(settings, 'stale prompt')

    assert.equal(reset.form.api_key, '')
    assert.equal(reset.form.clear_key, false)
    assert.equal(reset.testPrompt, '')
    assert.equal(reset.testResult, null)
  })

  test('defaults a missing latest-context setting to false', () => {
    const { latest_context_only: _, ...legacySettings } = settings
    const reset = resetPromptAuditSettingsDraft(
      legacySettings as PromptAuditSettingsForm
    )

    assert.equal(reset.form.latest_context_only, false)
  })

  test('defaults a missing sampling rate to one for legacy settings', () => {
    const { sampling_rate: _, ...legacySettings } = settings
    const reset = resetPromptAuditSettingsDraft(
      legacySettings as PromptAuditSettingsForm
    )

    assert.equal(reset.form.sampling_rate, 1)
  })

  test('rejects an empty threshold and fractional integer fields', () => {
    const errors = validatePromptAuditSettingsDraft({
      ...settings,
      threshold: undefined,
      timeout_seconds: 1.5,
    })

    assert.equal(errors.threshold, 'Threshold is required')
    assert.equal(
      errors.timeout_seconds,
      'Timeout must be a whole number between 1 and 30 seconds'
    )
  })

  test('rejects missing, non-finite, and out-of-range sampling rates', () => {
    assert.equal(
      validatePromptAuditSettingsDraft({
        ...settings,
        sampling_rate: undefined,
      }).sampling_rate,
      'Sampling rate must be between 0 and 1'
    )
    assert.equal(
      validatePromptAuditSettingsDraft({
        ...settings,
        sampling_rate: Number.NaN,
      }).sampling_rate,
      'Sampling rate must be between 0 and 1'
    )
    assert.equal(
      validatePromptAuditSettingsDraft({
        ...settings,
        sampling_rate: 1.01,
      }).sampling_rate,
      'Sampling rate must be between 0 and 1'
    )
    assert.equal(
      validatePromptAuditSettingsDraft({
        ...settings,
        sampling_rate: 0.2,
      }).sampling_rate,
      undefined
    )
  })

  test('rejects a base URL without an HTTP scheme and host', () => {
    const errors = validatePromptAuditSettingsDraft({
      ...settings,
      base_url: 'audit.example.com/v1',
    })

    assert.equal(errors.base_url, 'Base URL must be a valid HTTP or HTTPS URL')
  })

  test('requires an endpoint and key before enabling audit', () => {
    const errors = validatePromptAuditSettingsDraft({
      ...settings,
      enabled: true,
      base_url: '',
      api_key: '',
    })

    assert.equal(errors.base_url, 'Base URL is required when audit is enabled')
    assert.equal(errors.api_key, 'API key is required when audit is enabled')
  })

  test('rejects clearing the saved key while audit remains enabled', () => {
    const errors = validatePromptAuditSettingsDraft({
      ...settings,
      enabled: true,
      key_configured: true,
      clear_key: true,
      api_key: '',
    })

    assert.equal(errors.api_key, 'API key is required when audit is enabled')
  })
})
