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
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { LongText } from '@/components/long-text'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { formatTimestamp } from '@/lib/format'

import { formatPromptAuditConfidence, summarizePrompt } from '../lib'
import type { PromptAuditLogListItem } from '../types'

export function usePromptAuditColumns(
  onViewPrompt: (id: number) => void,
  onViewReason: (id: number) => void
): ColumnDef<PromptAuditLogListItem>[] {
  const { t } = useTranslation()
  return useMemo(
    () => [
      {
        accessorKey: 'created_at',
        header: t('Time'),
        cell: ({ row }) => (
          <span className='text-muted-foreground text-sm'>
            {formatTimestamp(row.original.created_at)}
          </span>
        ),
        size: 170,
        meta: { mobileOrder: 30 },
      },
      {
        accessorKey: 'action',
        header: t('Action'),
        cell: ({ row }) => (
          <StatusBadge
            label={t(row.original.action === 'blocked' ? 'Blocked' : 'Allowed')}
            variant={row.original.action === 'blocked' ? 'danger' : 'success'}
            copyable={false}
          />
        ),
        size: 100,
        meta: { mobileBadge: true },
      },
      {
        accessorKey: 'confidence',
        header: t('Confidence'),
        cell: ({ row }) => formatPromptAuditConfidence(row.original.confidence),
        size: 100,
        meta: { mobileOrder: 20 },
      },
      {
        accessorKey: 'username',
        header: t('Username'),
        cell: ({ row }) => (
          <div className='flex min-w-32 flex-col gap-0.5'>
            <LongText className='font-medium'>{row.original.username}</LongText>
            <span className='text-muted-foreground text-xs'>
              {t('User ID')}: {row.original.user_id}
            </span>
          </div>
        ),
        size: 150,
        meta: { mobileTitle: true },
      },
      {
        accessorKey: 'group',
        header: t('Group'),
        size: 110,
        meta: { mobileOrder: 40 },
      },
      {
        accessorKey: 'model',
        header: t('Request Model'),
        cell: ({ row }) => <LongText>{row.original.model}</LongText>,
        size: 160,
        meta: { mobileOrder: 50 },
      },
      {
        accessorKey: 'prompt_summary',
        header: t('Prompt'),
        cell: ({ row }) => (
          <Button
            variant='ghost'
            size='sm'
            className='h-auto max-w-56 justify-start px-0 text-left'
            onClick={() => onViewPrompt(row.original.id)}
          >
            <span className='truncate'>
              {summarizePrompt(row.original.prompt_summary) || '—'}
            </span>
          </Button>
        ),
        size: 230,
        meta: { mobileOrder: 60 },
      },
      {
        accessorKey: 'reason_summary',
        header: t('Reason'),
        cell: ({ row }) => {
          if (!row.original.reason_summary) return '—'
          return (
            <Button
              variant='ghost'
              size='sm'
              className='h-auto max-w-52 justify-start px-0 text-left'
              onClick={() => onViewReason(row.original.id)}
            >
              <span className='truncate'>{row.original.reason_summary}</span>
            </Button>
          )
        },
        size: 220,
        meta: { mobileOrder: 70 },
      },
      {
        accessorKey: 'duration_ms',
        header: t('Duration (ms)'),
        size: 110,
        meta: { mobileOrder: 80 },
      },
    ],
    [onViewPrompt, onViewReason, t]
  )
}
