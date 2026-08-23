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
import { useQuery } from '@tanstack/react-query'
import { Copy, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'

import { getPromptAuditLog } from '../api'
import { PromptAuditRequestId } from './prompt-audit-request-id'

type PromptAuditDetailDialogProps = {
  logId: number | null
  onOpenChange: (open: boolean) => void
}

export function PromptAuditDetailDialog(props: PromptAuditDetailDialogProps) {
  const { t } = useTranslation()
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

  const copyPrompt = async () => {
    if (!query.data) return
    try {
      await navigator.clipboard.writeText(query.data.prompt)
      toast.success(t('Prompt copied'))
    } catch {
      toast.error(t('Failed to copy prompt'))
    }
  }

  return (
    <Dialog open={props.logId != null} onOpenChange={props.onOpenChange}>
      <DialogContent className='max-h-[90vh] min-w-0 overflow-hidden sm:max-w-2xl'>
        <DialogHeader className='min-w-0'>
          <DialogTitle>{t('Prompt Detail')}</DialogTitle>
          <DialogDescription>{t('Full prompt content.')}</DialogDescription>
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
              <PromptAuditRequestId
                requestId={query.data.request_id}
                label={t('Request ID')}
                copyLabel={t('Copy Request ID')}
                copiedMessage={t('Request ID copied')}
                failedMessage={t('Failed to copy request ID')}
                testId='prompt-request-id'
              />
              <section className='flex w-full min-w-0 flex-col gap-2'>
                <div className='flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between'>
                  <h3 className='min-w-0 text-sm font-medium'>
                    {t('Full Prompt')}
                  </h3>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={copyPrompt}
                    className='self-start sm:shrink-0'
                  >
                    <Copy data-icon='inline-start' />
                    {t('Copy')}
                  </Button>
                </div>
                <pre className='bg-muted/40 m-0 block w-full max-w-full min-w-0 overflow-x-hidden rounded-lg border p-3 text-xs leading-relaxed [overflow-wrap:anywhere] break-all whitespace-pre-wrap'>
                  {query.data.prompt}
                </pre>
              </section>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}
