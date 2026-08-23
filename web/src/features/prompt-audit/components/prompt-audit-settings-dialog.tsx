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
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

import {
  getPromptAuditGroups,
  getPromptAuditSettings,
  testPromptAuditSettings,
  updatePromptAuditSettings,
} from '../api'
import {
  buildPromptAuditSettingsPayload,
  resetPromptAuditSettingsDraft,
  validatePromptAuditSettingsDraft,
} from '../lib'
import type {
  PromptAuditSettingsDraft,
  PromptAuditSettingsErrors,
  PromptAuditSettingsForm,
  PromptAuditTestResult,
} from '../types'
import { PromptAuditLogCleanup } from './prompt-audit-log-cleanup'
import { PromptAuditSettingsFields } from './prompt-audit-settings-fields'

const emptySettings: PromptAuditSettingsDraft = {
  enabled: false,
  latest_context_only: false,
  mode: 'blocking',
  model: '',
  base_url: '',
  key_configured: false,
  api_key: '',
  clear_key: false,
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

export function PromptAuditSettingsDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<PromptAuditSettingsDraft>(emptySettings)
  const [errors, setErrors] = useState<PromptAuditSettingsErrors>({})
  const [testPrompt, setTestPrompt] = useState('')
  const [tested, setTested] = useState<PromptAuditTestResult | null>(null)
  const [settingsQuery, groupsQuery] = useQueries({
    queries: [
      {
        queryKey: ['prompt-audit-settings'],
        queryFn: getPromptAuditSettings,
        enabled: props.open,
      },
      {
        queryKey: ['prompt-audit-groups'],
        queryFn: getPromptAuditGroups,
        enabled: props.open,
      },
    ],
  })

  useEffect(() => {
    if (!props.open || !settingsQuery.data) return
    const reset = resetPromptAuditSettingsDraft({
      ...settingsQuery.data,
      api_key: '',
      clear_key: false,
    })
    setForm(reset.form)
    setTestPrompt(reset.testPrompt)
    setTested(reset.testResult)
    setErrors({})
  }, [props.open, settingsQuery.data])

  const saveMutation = useMutation({
    mutationFn: updatePromptAuditSettings,
    onSuccess: async (result) => {
      if (!result.success) throw new Error(result.message || t('Save failed'))
      await queryClient.invalidateQueries({
        queryKey: ['prompt-audit-settings'],
      })
      toast.success(t('Prompt audit settings saved'))
      props.onOpenChange(false)
    },
    onError: (error) => toast.error(error.message),
  })
  const testMutation = useMutation({
    mutationFn: testPromptAuditSettings,
    onSuccess: (result) => {
      if (!result.success || !result.data) {
        throw new Error(result.message || t('Prompt audit test failed'))
      }
      setTested(result.data)
    },
    onError: (error) => {
      setTested(null)
      toast.error(error.message)
    },
  })

  const getValidatedForm = () => {
    const nextErrors = validatePromptAuditSettingsDraft(form)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return null
    return form as PromptAuditSettingsForm
  }

  const save = (event: React.FormEvent) => {
    event.preventDefault()
    const validForm = getValidatedForm()
    if (!validForm) return
    saveMutation.mutate(buildPromptAuditSettingsPayload(validForm))
  }
  const runTest = () => {
    const validForm = getValidatedForm()
    if (!validForm) return
    if (!testPrompt.trim()) return toast.error(t('Test prompt is required'))
    testMutation.mutate({
      ...buildPromptAuditSettingsPayload(validForm),
      prompt: testPrompt.trim(),
    })
  }

  const isLoading = settingsQuery.isLoading || groupsQuery.isLoading
  const loadError = settingsQuery.error || groupsQuery.error
  const groups = groupsQuery.data ?? []
  const availableGroups = new Set(groups)
  const removedGroups = (settingsQuery.data?.audit_groups ?? []).filter(
    (group) => !availableGroups.has(group)
  )
  const auditGroupOptions = [
    ...groups.map((group) => ({ group, removed: false })),
    ...removedGroups.map((group) => ({ group, removed: true })),
  ]
  const keyConfigured = settingsQuery.data?.key_configured ?? false
  const loaded = Boolean(settingsQuery.data && groupsQuery.data)

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setForm(emptySettings)
      setTestPrompt('')
      setTested(null)
      setErrors({})
    }
    props.onOpenChange(open)
  }

  return (
    <Dialog open={props.open} onOpenChange={handleOpenChange}>
      <DialogContent className='h-[94vh] max-h-[56rem] overflow-hidden sm:max-w-3xl'>
        <form
          className='grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-4'
          onSubmit={save}
        >
          <DialogHeader className='shrink-0 pr-8'>
            <DialogTitle>{t('Prompt Audit Settings')}</DialogTitle>
            <DialogDescription>
              {t(
                'Configure auditing, retention, and test the current settings.'
              )}
            </DialogDescription>
          </DialogHeader>
          {isLoading && (
            <div className='flex min-h-0 items-center justify-center'>
              <Loader2 className='animate-spin' aria-label={t('Loading')} />
            </div>
          )}
          {loadError && (
            <p className='text-destructive min-h-0 py-10 text-center'>
              {t('Failed to load prompt audit settings')}
            </p>
          )}
          {!isLoading && !loadError && (
            <ScrollArea className='min-h-0 pr-3'>
              <FieldGroup className='pb-2'>
                <Field orientation='horizontal'>
                  <FieldLabel htmlFor='audit-enabled'>
                    {t('Enabled')}
                  </FieldLabel>
                  <Switch
                    id='audit-enabled'
                    checked={form.enabled}
                    onCheckedChange={(enabled) => setForm({ ...form, enabled })}
                  />
                </Field>
                <PromptAuditSettingsFields
                  form={form}
                  setForm={setForm}
                  keyConfigured={keyConfigured}
                  errors={errors}
                />
                <PromptAuditLogCleanup
                  allowedRetentionDays={
                    settingsQuery.data?.allowed_retention_days
                  }
                  blockedRetentionDays={
                    settingsQuery.data?.blocked_retention_days
                  }
                />
                <FieldSet>
                  <FieldLegend variant='label'>{t('Audit Groups')}</FieldLegend>
                  <FieldDescription>
                    {t('Only requests in selected groups are audited.')}
                  </FieldDescription>
                  <div className='grid gap-2 sm:grid-cols-2'>
                    {auditGroupOptions.map(({ group, removed }) => (
                      <Field
                        key={group}
                        orientation='horizontal'
                        data-testid={
                          removed ? 'removed-audit-group' : undefined
                        }
                      >
                        <Checkbox
                          id={`audit-group-${group}`}
                          checked={form.audit_groups.includes(group)}
                          onCheckedChange={(checked) =>
                            setForm({
                              ...form,
                              audit_groups: checked
                                ? [...form.audit_groups, group]
                                : form.audit_groups.filter(
                                    (item) => item !== group
                                  ),
                            })
                          }
                        />
                        <FieldLabel
                          htmlFor={`audit-group-${group}`}
                          className='min-w-0 flex-wrap'
                        >
                          <span className='break-all'>{group}</span>
                          {removed && (
                            <Badge variant='destructive'>
                              {t('This group has been removed')}
                            </Badge>
                          )}
                        </FieldLabel>
                      </Field>
                    ))}
                  </div>
                </FieldSet>
                <FieldSet className='rounded-lg border p-4'>
                  <FieldLegend>{t('Test Settings')}</FieldLegend>
                  <Field>
                    <FieldLabel htmlFor='audit-test-prompt'>
                      {t('Prompt')}
                    </FieldLabel>
                    <Textarea
                      id='audit-test-prompt'
                      value={testPrompt}
                      onChange={(event) => setTestPrompt(event.target.value)}
                      placeholder={t('Enter a prompt to audit...')}
                      rows={4}
                    />
                  </Field>
                  <Button
                    type='button'
                    variant='outline'
                    onClick={runTest}
                    disabled={!loaded || testMutation.isPending}
                  >
                    {testMutation.isPending && (
                      <Loader2 className='animate-spin' />
                    )}
                    {t('Run Test')}
                  </Button>
                  {tested && (
                    <div className='grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-2'>
                      <p>
                        {t('Confidence')}: {tested.confidence.toFixed(2)}
                      </p>
                      <p>
                        {t('Duration (ms)')}: {tested.duration_ms}
                      </p>
                      <p className='sm:col-span-2'>
                        {t('Reason')}: {tested.reason || '—'}
                      </p>
                      <StatusBadge
                        label={tested.blocked ? t('Blocked') : t('Allowed')}
                        variant={tested.blocked ? 'danger' : 'success'}
                        copyable={false}
                      />
                    </div>
                  )}
                </FieldSet>
              </FieldGroup>
            </ScrollArea>
          )}
          <DialogFooter className='bg-popover relative z-10 shrink-0'>
            <Button
              type='button'
              variant='outline'
              onClick={() => handleOpenChange(false)}
            >
              {t('Cancel')}
            </Button>
            <Button
              type='submit'
              disabled={
                !loaded ||
                Boolean(loadError) ||
                isLoading ||
                saveMutation.isPending
              }
            >
              {saveMutation.isPending && <Loader2 className='animate-spin' />}
              {t('Save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
