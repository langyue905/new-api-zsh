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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { FieldDescription, FieldLegend, FieldSet } from '@/components/ui/field'

import { cleanupPromptAuditLogs } from '../api'
import type { PromptAuditCleanupResult } from '../types'

type PromptAuditLogCleanupProps = {
  allowedRetentionDays?: number
  blockedRetentionDays?: number
}

export function PromptAuditLogCleanup(props: PromptAuditLogCleanupProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<PromptAuditCleanupResult | null>(null)
  const cleanupMutation = useMutation({
    mutationFn: async () => {
      const result = await cleanupPromptAuditLogs()
      if (!result.success || !result.data) {
        throw new Error(result.message || t('Log cleanup failed'))
      }
      return result.data
    },
    onSuccess: async (result) => {
      setSummary(result)
      setError('')
      setOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['prompt-audit-logs'] })
    },
    onError: (cleanupError) => {
      setError(cleanupError.message)
    },
  })

  const savedRetentionAvailable =
    props.allowedRetentionDays != null && props.blockedRetentionDays != null

  const handleOpenChange = (nextOpen: boolean) => {
    if (cleanupMutation.isPending) return
    setOpen(nextOpen)
    if (nextOpen) setError('')
  }

  return (
    <FieldSet className='rounded-lg border p-4'>
      <FieldLegend>{t('Log Cleanup')}</FieldLegend>
      <FieldDescription>
        {t('Delete expired audit logs using the saved retention settings.')}
      </FieldDescription>
      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogTrigger
          disabled={!savedRetentionAvailable}
          render={<Button type='button' variant='outline' />}
        >
          {t('Clean Up Logs Now')}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('Clean Up Prompt Audit Logs?')}
            </AlertDialogTitle>
            <AlertDialogDescription className='flex flex-col gap-2'>
              <span>
                {t(
                  'Saved retention: allowed {{allowed}} days, blocked {{blocked}} days.',
                  {
                    allowed: props.allowedRetentionDays,
                    blocked: props.blockedRetentionDays,
                  }
                )}
              </span>
              <span>{t('Unsaved changes in this form will not be used.')}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p className='text-destructive text-sm' role='alert'>
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cleanupMutation.isPending}>
              {t('Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              type='button'
              disabled={cleanupMutation.isPending}
              onClick={() => cleanupMutation.mutate()}
            >
              {cleanupMutation.isPending && (
                <Loader2 className='animate-spin' aria-hidden='true' />
              )}
              {t('Confirm Cleanup')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {summary && (
        <p className='text-muted-foreground text-sm' role='status'>
          {t(
            'Cleanup complete: {{allowed}} allowed logs and {{blocked}} blocked logs deleted.',
            {
              allowed: summary.allowed_deleted,
              blocked: summary.blocked_deleted,
            }
          )}
        </p>
      )}
    </FieldSet>
  )
}
