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
import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

import { getPromptAuditModeLabelKey, parseOptionalNumber } from '../lib'
import type {
  PromptAuditSettingsDraft,
  PromptAuditSettingsErrors,
} from '../types'

type Props = {
  form: PromptAuditSettingsDraft
  setForm: Dispatch<SetStateAction<PromptAuditSettingsDraft>>
  keyConfigured: boolean
  errors: PromptAuditSettingsErrors
}

const modeItems = [
  { labelKey: getPromptAuditModeLabelKey('blocking'), value: 'blocking' },
  { labelKey: getPromptAuditModeLabelKey('async'), value: 'async' },
] as const

export function PromptAuditSettingsFields(props: Props) {
  const { t } = useTranslation()
  const setNumber = (key: keyof PromptAuditSettingsDraft, value: string) =>
    props.setForm({ ...props.form, [key]: parseOptionalNumber(value) })

  return (
    <>
      <div className='grid gap-4 sm:grid-cols-2'>
        <Field>
          <FieldLabel htmlFor='audit-mode'>{t('Mode')}</FieldLabel>
          <Select
            items={modeItems.map((item) => ({
              value: item.value,
              label: t(item.labelKey),
            }))}
            value={props.form.mode}
            onValueChange={(mode) =>
              props.setForm({
                ...props.form,
                mode: mode as 'blocking' | 'async',
              })
            }
          >
            <SelectTrigger id='audit-mode' className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {modeItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {t(item.labelKey)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field data-invalid={Boolean(props.errors.model)}>
          <FieldLabel htmlFor='audit-model'>{t('Model')}</FieldLabel>
          <Input
            id='audit-model'
            value={props.form.model}
            aria-invalid={Boolean(props.errors.model)}
            onChange={(e) =>
              props.setForm({ ...props.form, model: e.target.value })
            }
          />
          {props.errors.model && (
            <p className='text-destructive text-sm'>{t(props.errors.model)}</p>
          )}
        </Field>
      </div>
      <Field data-invalid={Boolean(props.errors.base_url)}>
        <FieldLabel htmlFor='audit-base-url'>{t('Base URL')}</FieldLabel>
        <Input
          id='audit-base-url'
          value={props.form.base_url}
          aria-invalid={Boolean(props.errors.base_url)}
          onChange={(e) =>
            props.setForm({ ...props.form, base_url: e.target.value })
          }
        />
        {props.errors.base_url && (
          <p className='text-destructive text-sm'>{t(props.errors.base_url)}</p>
        )}
      </Field>
      <Field data-invalid={Boolean(props.errors.api_key)}>
        <FieldLabel htmlFor='audit-api-key'>{t('API Key')}</FieldLabel>
        <Input
          id='audit-api-key'
          type='password'
          value={props.form.api_key}
          aria-invalid={Boolean(props.errors.api_key)}
          onChange={(e) =>
            props.setForm({
              ...props.form,
              api_key: e.target.value,
              clear_key: false,
            })
          }
          placeholder={
            props.keyConfigured
              ? t('Configured — leave empty to keep')
              : t('Enter API key')
          }
        />
        {props.errors.api_key && (
          <p className='text-destructive text-sm'>{t(props.errors.api_key)}</p>
        )}
        <FieldDescription>
          {t('Leaving this field empty keeps the existing key.')}
        </FieldDescription>
        <Field orientation='horizontal'>
          <Checkbox
            id='audit-clear-key'
            checked={props.form.clear_key}
            onCheckedChange={(clear_key) =>
              props.setForm({
                ...props.form,
                clear_key: Boolean(clear_key),
                api_key: '',
              })
            }
          />
          <FieldLabel htmlFor='audit-clear-key'>
            {t('Clear saved API key')}
          </FieldLabel>
        </Field>
      </Field>
      <Field>
        <FieldLabel htmlFor='audit-system-prompt'>
          {t('System Prompt')}
        </FieldLabel>
        <Textarea
          id='audit-system-prompt'
          value={props.form.system_prompt}
          onChange={(e) =>
            props.setForm({ ...props.form, system_prompt: e.target.value })
          }
          rows={8}
        />
      </Field>
      <Field orientation='horizontal'>
        <FieldLabel htmlFor='audit-latest-context-only'>
          {t('Only audit the latest input and previous turn output')}
        </FieldLabel>
        <Switch
          id='audit-latest-context-only'
          checked={props.form.latest_context_only}
          onCheckedChange={(latest_context_only) =>
            props.setForm({ ...props.form, latest_context_only })
          }
        />
      </Field>
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        <NumberField
          id='audit-sampling-rate'
          label={t('Sampling Rate')}
          description={t(
            '0.2 audits approximately 20% of requests; 1 audits all requests.'
          )}
          value={props.form.sampling_rate}
          min={0}
          max={1}
          step={0.01}
          error={props.errors.sampling_rate && t(props.errors.sampling_rate)}
          onChange={(v) => setNumber('sampling_rate', v)}
        />
        <NumberField
          id='audit-threshold'
          label={t('Threshold')}
          value={props.form.threshold}
          min={0}
          max={1}
          step={0.01}
          error={props.errors.threshold && t(props.errors.threshold)}
          onChange={(v) => setNumber('threshold', v)}
        />
        <NumberField
          id='audit-timeout'
          label={t('Timeout (seconds)')}
          value={props.form.timeout_seconds}
          min={1}
          max={30}
          error={
            props.errors.timeout_seconds && t(props.errors.timeout_seconds)
          }
          onChange={(v) => setNumber('timeout_seconds', v)}
        />
        <NumberField
          id='audit-concurrency'
          label={t('Async Concurrency')}
          value={props.form.async_concurrency}
          min={1}
          max={100}
          error={
            props.errors.async_concurrency && t(props.errors.async_concurrency)
          }
          onChange={(v) => setNumber('async_concurrency', v)}
        />
        <NumberField
          id='audit-queue-size'
          label={t('Async Queue Size')}
          value={props.form.async_queue_size}
          min={1}
          max={10000}
          error={
            props.errors.async_queue_size && t(props.errors.async_queue_size)
          }
          onChange={(v) => setNumber('async_queue_size', v)}
        />
        <NumberField
          id='audit-allowed-retention'
          label={t('Allowed Retention (days)')}
          value={props.form.allowed_retention_days}
          min={1}
          max={365}
          error={
            props.errors.allowed_retention_days &&
            t(props.errors.allowed_retention_days)
          }
          onChange={(v) => setNumber('allowed_retention_days', v)}
        />
        <NumberField
          id='audit-blocked-retention'
          label={t('Blocked Retention (days)')}
          value={props.form.blocked_retention_days}
          min={1}
          max={365}
          error={
            props.errors.blocked_retention_days &&
            t(props.errors.blocked_retention_days)
          }
          onChange={(v) => setNumber('blocked_retention_days', v)}
        />
      </div>
    </>
  )
}

function NumberField(props: {
  id: string
  label: string
  description?: string
  value: number | undefined
  min: number
  max: number
  step?: number
  error?: string
  onChange: (value: string) => void
}) {
  return (
    <Field data-invalid={Boolean(props.error)}>
      <FieldLabel htmlFor={props.id}>{props.label}</FieldLabel>
      <Input
        id={props.id}
        type='number'
        value={props.value ?? ''}
        min={props.min}
        max={props.max}
        step={props.step}
        aria-invalid={Boolean(props.error)}
        onChange={(event) => props.onChange(event.target.value)}
      />
      {props.description && (
        <FieldDescription>{props.description}</FieldDescription>
      )}
      {props.error && <p className='text-destructive text-sm'>{props.error}</p>}
    </Field>
  )
}
