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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Copy, Loader2, Unlock } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'

import { getPromptAuditLog, releasePromptAuditConversationBlock } from '../api'
import { hasPromptAuditBlockHistory, hasPromptAuditCacheHistory } from '../lib'
import { PromptAuditRequestId } from './prompt-audit-request-id'

type PromptAuditReasonDialogProps = {
  logId: number | null
  onOpenChange: (open: boolean) => void
}

export function PromptAuditReasonDialog(props: PromptAuditReasonDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [releaseOpen, setReleaseOpen] = useState(false)
  const [releaseError, setReleaseError] = useState('')
  const query = useQuery({
    queryKey: ['prompt-audit-log', props.logId],
    queryFn: async () => {
      if (props.logId == null) {
        throw new Error(t('Failed to load audit details'))
      }
      const result = await getPromptAuditLog(props.logId)
      if (!result.success || !result.data) {
        throw new Error(result.message || t('Failed to load audit details'))
      }
      return result.data
    },
    enabled: props.logId != null,
  })
  const releaseMutation = useMutation({
    mutationFn: async () => {
      if (props.logId == null) {
        throw new Error(t('Failed to release conversation block'))
      }
      const result = await releasePromptAuditConversationBlock(props.logId)
      if (!result.success || !result.data) {
        throw new Error(
          result.message || t('Failed to release conversation block')
        )
      }
      return result.data
    },
    onSuccess: async () => {
      setReleaseError('')
      setReleaseOpen(false)
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['prompt-audit-log', props.logId],
        }),
        queryClient.invalidateQueries({ queryKey: ['prompt-audit-logs'] }),
      ])
      toast.success(t('Conversation block released'))
    },
    onError: (error) => setReleaseError(error.message),
  })

  const copyReason = async () => {
    if (!query.data) return
    try {
      await navigator.clipboard.writeText(query.data.reason)
      toast.success(t('Reason copied'))
    } catch {
      toast.error(t('Failed to copy reason'))
    }
  }

  return (
    <Dialog open={props.logId != null} onOpenChange={props.onOpenChange}>
      <DialogContent className='max-h-[90vh] min-w-0 overflow-hidden sm:max-w-2xl'>
        <DialogHeader className='min-w-0'>
          <DialogTitle>{t('Reason Detail')}</DialogTitle>
          <DialogDescription>
            {t('Full audit reason and original model result.')}
          </DialogDescription>
        </DialogHeader>
        {query.isLoading && (
          <div className='flex min-h-40 items-center justify-center'>
            <Loader2 className='animate-spin' aria-label={t('Loading')} />
          </div>
        )}
        {query.isError && (
          <p className='text-destructive py-8 text-center'>
            {query.error.message}
          </p>
        )}
        {query.data && (
          <ScrollArea className='max-h-[65vh] min-w-0 overflow-hidden pr-3'>
            <div className='flex w-full min-w-0 flex-col gap-4'>
              <section className='flex w-full min-w-0 flex-col gap-2'>
                <div className='flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between'>
                  <h3 className='min-w-0 text-sm font-medium'>
                    {t('Full Reason')}
                  </h3>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={copyReason}
                    className='self-start sm:shrink-0'
                  >
                    <Copy data-icon='inline-start' />
                    {t('Copy Reason')}
                  </Button>
                </div>
                <p
                  data-testid='reason-content'
                  className='bg-muted/40 m-0 block w-full max-w-full min-w-0 overflow-x-hidden rounded-lg border p-3 text-sm leading-relaxed [overflow-wrap:anywhere] break-all whitespace-pre-wrap'
                >
                  {query.data.reason}
                </p>
              </section>
              {hasPromptAuditCacheHistory(query.data) ? (
                <Collapsible defaultOpen className='w-full min-w-0'>
                  <CollapsibleTrigger
                    render={
                      <Button
                        type='button'
                        variant='outline'
                        className='w-full justify-between'
                      />
                    }
                  >
                    {t('Historical Allow Reason')}
                    <ChevronDown data-icon='inline-end' aria-hidden='true' />
                  </CollapsibleTrigger>
                  <CollapsibleContent className='min-w-0 pt-2'>
                    <div className='flex w-full min-w-0 flex-col gap-4'>
                      <PromptAuditRequestId
                        requestId={query.data.cache_source_request_id}
                        label={t('Source Request ID')}
                        copyLabel={t('Copy Source Request ID')}
                        copiedMessage={t('Source request ID copied')}
                        failedMessage={t('Failed to copy source request ID')}
                        testId='cache-source-request-id'
                      />
                      <section className='flex w-full min-w-0 flex-col gap-2'>
                        <h3 className='min-w-0 text-sm font-medium'>
                          {t('Full Historical Allow Reason')}
                        </h3>
                        {query.data.cache_source_reason ? (
                          <p
                            data-testid='cache-source-reason'
                            className='bg-muted/40 m-0 block w-full max-w-full min-w-0 overflow-x-hidden rounded-lg border p-3 text-sm leading-relaxed [overflow-wrap:anywhere] break-all whitespace-pre-wrap'
                          >
                            {query.data.cache_source_reason}
                          </p>
                        ) : (
                          <p className='bg-muted/40 text-muted-foreground w-full min-w-0 rounded-lg border p-3 text-sm'>
                            {t('No historical allow reason available.')}
                          </p>
                        )}
                      </section>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ) : null}
              {hasPromptAuditBlockHistory(query.data) ? (
                <Collapsible defaultOpen className='w-full min-w-0'>
                  <CollapsibleTrigger
                    render={
                      <Button
                        type='button'
                        variant='outline'
                        className='w-full justify-between'
                      />
                    }
                  >
                    {t('Historical Block Reason')}
                    <ChevronDown data-icon='inline-end' aria-hidden='true' />
                  </CollapsibleTrigger>
                  <CollapsibleContent className='min-w-0 pt-2'>
                    <div className='flex w-full min-w-0 flex-col gap-4'>
                      <PromptAuditRequestId
                        requestId={query.data.block_source_request_id}
                        label={t('Block Source Request ID')}
                        copyLabel={t('Copy Block Source Request ID')}
                        copiedMessage={t('Block source request ID copied')}
                        failedMessage={t(
                          'Failed to copy block source request ID'
                        )}
                        testId='block-source-request-id'
                      />
                      <section className='flex w-full min-w-0 flex-col gap-2'>
                        <h3 className='min-w-0 text-sm font-medium'>
                          {t('Full Historical Block Reason')}
                        </h3>
                        {query.data.block_source_reason ? (
                          <p
                            data-testid='block-source-reason'
                            className='bg-muted/40 m-0 block w-full max-w-full min-w-0 overflow-x-hidden rounded-lg border p-3 text-sm leading-relaxed [overflow-wrap:anywhere] break-all whitespace-pre-wrap'
                          >
                            {query.data.block_source_reason}
                          </p>
                        ) : (
                          <p className='bg-muted/40 text-muted-foreground w-full min-w-0 rounded-lg border p-3 text-sm'>
                            {t('No historical block reason available.')}
                          </p>
                        )}
                      </section>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ) : null}
              <Collapsible className='w-full min-w-0'>
                <CollapsibleTrigger
                  render={
                    <Button
                      type='button'
                      variant='outline'
                      className='w-full justify-between'
                    />
                  }
                >
                  {t('Audit Model Result')}
                  <ChevronDown data-icon='inline-end' aria-hidden='true' />
                </CollapsibleTrigger>
                <CollapsibleContent className='min-w-0 pt-2'>
                  {query.data.audit_model_output ? (
                    <pre
                      data-testid='audit-model-output'
                      className='bg-muted/40 m-0 block w-full max-w-full min-w-0 overflow-x-hidden rounded-lg border p-3 text-xs leading-relaxed [overflow-wrap:anywhere] break-all whitespace-pre-wrap'
                    >
                      {query.data.audit_model_output}
                    </pre>
                  ) : (
                    <p className='bg-muted/40 text-muted-foreground w-full min-w-0 rounded-lg border p-3 text-sm'>
                      {t('No audit model result available.')}
                    </p>
                  )}
                </CollapsibleContent>
              </Collapsible>
              {query.data.action === 'blocked' &&
              query.data.conversation_blocked ? (
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => {
                    setReleaseError('')
                    setReleaseOpen(true)
                  }}
                >
                  <Unlock data-icon='inline-start' aria-hidden='true' />
                  {t('Stop Blocking This Conversation')}
                </Button>
              ) : null}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
      <AlertDialog open={releaseOpen} onOpenChange={setReleaseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('Release Conversation Block?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'The next request in this conversation will return to normal prompt auditing and may be blocked again.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {releaseError ? (
            <p role='alert' className='text-destructive text-sm'>
              {releaseError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={releaseMutation.isPending}>
              {t('Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={releaseMutation.isPending}
              onClick={() => releaseMutation.mutate()}
            >
              {releaseMutation.isPending ? (
                <Loader2 data-icon='inline-start' className='animate-spin' />
              ) : null}
              {t('Confirm Release')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
