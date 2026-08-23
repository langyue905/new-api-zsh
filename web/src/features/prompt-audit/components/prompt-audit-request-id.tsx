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
import { Copy } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

type PromptAuditRequestIdProps = {
  requestId: string
  label: string
  copyLabel: string
  copiedMessage: string
  failedMessage: string
  testId: string
}

export function PromptAuditRequestId(props: PromptAuditRequestIdProps) {
  const copyRequestId = async () => {
    if (!props.requestId) return
    try {
      await navigator.clipboard.writeText(props.requestId)
      toast.success(props.copiedMessage)
    } catch {
      toast.error(props.failedMessage)
    }
  }

  return (
    <section className='flex w-full min-w-0 flex-col gap-2'>
      <div className='flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between'>
        <h3 className='min-w-0 text-sm font-medium'>{props.label}</h3>
        <Button
          type='button'
          size='sm'
          variant='outline'
          disabled={!props.requestId}
          onClick={copyRequestId}
          className='self-start sm:shrink-0'
        >
          <Copy data-icon='inline-start' />
          {props.copyLabel}
        </Button>
      </div>
      <code
        data-testid={props.testId}
        className='bg-muted/40 m-0 block w-full max-w-full min-w-0 overflow-x-hidden rounded-lg border p-3 text-xs leading-relaxed [overflow-wrap:anywhere] break-all whitespace-pre-wrap'
      >
        {props.requestId || '—'}
      </code>
    </section>
  )
}
