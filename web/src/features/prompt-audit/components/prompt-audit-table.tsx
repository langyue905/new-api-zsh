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
import { getRouteApi } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { CompactDateTimeRangePicker } from '@/components/compact-date-time-range-picker'
import { DataTablePage, useDataTable } from '@/components/data-table'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useMediaQuery } from '@/hooks'
import { useTableUrlState } from '@/hooks/use-table-url-state'

import { getPromptAuditLogs } from '../api'
import {
  buildPromptAuditFilterSearch,
  getPromptAuditDateRangeErrorKey,
  getPromptAuditDefaultTimeRange,
  isSamePromptAuditLogSearch,
} from '../lib'
import type { PromptAuditActionFilter } from '../types'
import { usePromptAuditColumns } from './prompt-audit-columns'

const route = getRouteApi('/_authenticated/prompt-audit/')

type PromptAuditFilterDraft = {
  sourceKey: string
  startTime?: number
  endTime?: number
  action: PromptAuditActionFilter
  userId: string
}

function getFilterSourceKey(input: Omit<PromptAuditFilterDraft, 'sourceKey'>) {
  return [input.startTime, input.endTime, input.action, input.userId].join('|')
}

export function PromptAuditTable(props: {
  onViewPrompt: (id: number) => void
  onViewReason: (id: number) => void
}) {
  const { t } = useTranslation()
  const isMobile = useMediaQuery('(max-width: 640px)')
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const columns = usePromptAuditColumns(props.onViewPrompt, props.onViewReason)
  const [defaultRange, setDefaultRange] = useState(() =>
    getPromptAuditDefaultTimeRange()
  )
  const searchState = useMemo<PromptAuditFilterDraft>(() => {
    const hasURLDate = search.startTime != null || search.endTime != null
    const values = {
      startTime: hasURLDate ? search.startTime : defaultRange.startTime,
      endTime: hasURLDate ? search.endTime : defaultRange.endTime,
      action: (search.action ?? 'all') as PromptAuditActionFilter,
      userId: search.userId ?? '',
    }
    return { sourceKey: getFilterSourceKey(values), ...values }
  }, [
    defaultRange,
    search.action,
    search.endTime,
    search.startTime,
    search.userId,
  ])
  const [draft, setDraft] = useState<PromptAuditFilterDraft>(() => searchState)
  const [draftDateErrorKey, setDraftDateErrorKey] = useState<string>()
  const filters =
    draft.sourceKey === searchState.sourceKey ? draft : searchState
  const committedDateErrorKey = getPromptAuditDateRangeErrorKey(
    searchState.startTime,
    searchState.endTime
  )
  const visibleDateErrorKey = draftDateErrorKey ?? committedDateErrorKey

  const updateDraft = useCallback(
    (updates: Partial<Omit<PromptAuditFilterDraft, 'sourceKey'>>) => {
      setDraft((current) => {
        const base =
          current.sourceKey === searchState.sourceKey ? current : searchState
        return { ...base, ...updates, sourceKey: searchState.sourceKey }
      })
    },
    [searchState]
  )

  const { pagination, onPaginationChange, ensurePageInRange } =
    useTableUrlState({
      search,
      navigate,
      pagination: { defaultPage: 1, defaultPageSize: isMobile ? 10 : 20 },
    })

  const query = useQuery({
    queryKey: [
      'prompt-audit-logs',
      searchState.startTime,
      searchState.endTime,
      searchState.action,
      searchState.userId,
      pagination.pageIndex,
      pagination.pageSize,
    ],
    queryFn: async () => {
      const result = await getPromptAuditLogs({
        action: searchState.action,
        userId: searchState.userId,
        startTime: searchState.startTime,
        endTime: searchState.endTime,
        page: pagination.pageIndex + 1,
        pageSize: pagination.pageSize,
      })
      if (!result.success || !result.data) {
        throw new Error(result.message || t('Failed to load prompt audit logs'))
      }
      return result.data
    },
    enabled: committedDateErrorKey == null,
    placeholderData: (previousData) => previousData,
  })

  const handleSearch = useCallback(() => {
    const dateErrorKey = getPromptAuditDateRangeErrorKey(
      filters.startTime,
      filters.endTime
    )
    setDraftDateErrorKey(dateErrorKey)
    if (dateErrorKey) {
      toast.error(t(dateErrorKey))
      return
    }
    const next = buildPromptAuditFilterSearch(filters)
    if (isSamePromptAuditLogSearch(searchState, next, pagination.pageIndex)) {
      query.refetch()
      return
    }
    navigate({ search: (previous) => ({ ...previous, ...next }) })
  }, [filters, navigate, pagination.pageIndex, query, searchState, t])

  const handleReset = useCallback(() => {
    const range = getPromptAuditDefaultTimeRange()
    const values = { ...range, action: 'all' as const, userId: '' }
    setDefaultRange(range)
    setDraftDateErrorKey(undefined)
    setDraft({ sourceKey: getFilterSourceKey(values), ...values })
    navigate({
      search: (previous) => ({
        ...previous,
        ...buildPromptAuditFilterSearch(values),
      }),
    })
  }, [navigate])

  const { table } = useDataTable({
    data: query.data?.items ?? [],
    columns,
    columnFilters: [],
    globalFilter: '',
    pagination,
    onPaginationChange,
    manualPagination: true,
    manualFiltering: true,
    totalCount: query.data?.total ?? 0,
    ensurePageInRange,
  })

  const actionItems = [
    { value: 'all', label: t('All') },
    { value: 'allowed', label: t('Allowed') },
    { value: 'blocked', label: t('Blocked') },
  ]
  let emptyTitle = t('No Audit Logs Found')
  let emptyDescription = t('Try adjusting the action or user ID filters.')
  if (query.isError) {
    emptyTitle = t('Failed to load audit logs')
    emptyDescription = query.error.message
  }
  if (committedDateErrorKey) {
    emptyTitle = t(committedDateErrorKey)
    emptyDescription = t(committedDateErrorKey)
  }

  return (
    <DataTablePage
      table={table}
      columns={columns}
      isLoading={query.isLoading}
      isFetching={query.isFetching}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      skeletonKeyPrefix='prompt-audit-skeleton'
      applyHeaderSize
      toolbarProps={{
        customSearch: (
          <div className='flex w-full flex-col gap-1 sm:w-auto'>
            <CompactDateTimeRangePicker
              start={
                filters.startTime == null
                  ? undefined
                  : new Date(filters.startTime)
              }
              end={
                filters.endTime == null ? undefined : new Date(filters.endTime)
              }
              onChange={({ start, end }) => {
                setDraftDateErrorKey(undefined)
                updateDraft({
                  startTime: start?.getTime(),
                  endTime: end?.getTime(),
                })
              }}
              invalid={visibleDateErrorKey != null}
              className='sm:w-[330px]'
            />
            {visibleDateErrorKey && (
              <p className='text-destructive text-xs' role='alert'>
                {t(visibleDateErrorKey)}
              </p>
            )}
          </div>
        ),
        additionalSearch: (
          <>
            <Select
              items={actionItems}
              value={filters.action}
              onValueChange={(action) =>
                updateDraft({
                  action: (action ?? 'all') as PromptAuditActionFilter,
                })
              }
            >
              <SelectTrigger
                className='w-full sm:w-[140px]'
                aria-label={t('Action')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {actionItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Input
              inputMode='numeric'
              placeholder={t('Filter by User ID...')}
              value={filters.userId}
              onChange={(event) => updateDraft({ userId: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleSearch()
              }}
              className='w-full sm:w-[180px]'
            />
          </>
        ),
        hasAdditionalFilters:
          filters.action !== 'all' ||
          Boolean(filters.userId) ||
          filters.startTime !== defaultRange.startTime ||
          filters.endTime !== defaultRange.endTime,
        onSearch: handleSearch,
        onReset: handleReset,
        searchLoading: query.isFetching,
      }}
      mobileProps={{ getRowKey: (row) => row.original.id }}
    />
  )
}
