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
import {
  BadgeDollarSign,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  RefreshCw,
  Send,
  Upload,
  Users,
  Wallet,
} from 'lucide-react'
import {
  type ChangeEvent,
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { formatQuotaWithCurrency } from '@/lib/currency'

import {
  createAgentWithdrawal,
  getAgentCommissions,
  getAgentCustomers,
  getAgentSummary,
  getAgentUsageLogs,
  getAgentWithdrawals,
  transferAgentCommission,
} from './api'
import {
  PAYMENT_QR_CODE_INPUT_MAX_BYTES,
  preparePaymentQRCodeDataUrl,
} from './lib/payment-qr-code'
import type {
  AgentCommission,
  AgentCustomer,
  AgentSummary,
  AgentUsageLog,
  AgentWithdrawal,
} from './types'

const withdrawalStatusLabels: Record<number, string> = {
  1: 'Pending',
  2: 'Paid',
  3: 'Rejected',
}

const agentUsageLogsPageSize = 10

function formatRate(rateBps: number) {
  return `${(rateBps / 100).toFixed(0)}%`
}

function formatDate(timestamp?: number) {
  if (!timestamp) return '-'
  return new Date(timestamp * 1000).toLocaleString()
}

function buildAgentLink(affCode?: string) {
  if (!affCode || typeof window === 'undefined') return ''
  return `${window.location.origin}/sign-up?aff=${affCode}`
}

function getStatusVariant(
  status: number
): 'default' | 'secondary' | 'destructive' {
  if (status === 2) return 'default'
  if (status === 3) return 'destructive'
  return 'secondary'
}

function StatCard(props: {
  title: string
  value: string | number
  icon: ComponentType<{ className?: string }>
  description?: string
  loading?: boolean
}) {
  const Icon = props.icon
  return (
    <Card size='sm'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Icon className='text-primary size-4' />
          {props.title}
        </CardTitle>
        {props.description ? (
          <CardDescription>{props.description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        {props.loading ? (
          <Skeleton className='h-7 w-28' />
        ) : (
          <div className='text-2xl font-semibold tabular-nums'>
            {props.value}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function WithdrawalDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  summary: AgentSummary | null
  onSubmitted: () => Promise<void>
}) {
  const { t } = useTranslation()
  const [amount, setAmount] = useState('')
  const [paymentAccount, setPaymentAccount] = useState('')
  const [paymentQRCode, setPaymentQRCode] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [fileName, setFileName] = useState('')

  const withdrawableAmount = useMemo(() => {
    const quota = props.summary?.withdrawable_quota || 0
    const min = props.summary?.minimum_withdrawal_quota || 1
    return (quota / min) * 10
  }, [props.summary])

  const reset = () => {
    setAmount('')
    setPaymentAccount('')
    setPaymentQRCode('')
    setNote('')
    setFileName('')
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error(t('Please upload an image file'))
      event.target.value = ''
      return
    }
    if (file.size > PAYMENT_QR_CODE_INPUT_MAX_BYTES) {
      toast.error(t('Image size cannot exceed 5 MB'))
      event.target.value = ''
      return
    }
    try {
      setPaymentQRCode(await preparePaymentQRCodeDataUrl(file))
      setFileName(file.name)
    } catch {
      setPaymentQRCode('')
      setFileName('')
      event.target.value = ''
      toast.error(t('Payment QR code image is too large'))
    }
  }

  const handleSubmit = async () => {
    const numericAmount = Number(amount)
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error(t('Please enter a valid amount'))
      return
    }
    if (numericAmount < 10 || numericAmount % 10 !== 0) {
      toast.error(t('Withdrawal amount must be a multiple of 10'))
      return
    }
    if (!paymentAccount.trim() && !paymentQRCode) {
      toast.error(t('Please enter payment account or upload payment QR code'))
      return
    }

    setSubmitting(true)
    try {
      const res = await createAgentWithdrawal({
        amount: numericAmount,
        payment_account: paymentAccount,
        payment_qr_code: paymentQRCode,
        note,
      })
      if (res.success) {
        toast.success(t('Withdrawal request submitted'))
        props.onOpenChange(false)
        reset()
        await props.onSubmitted()
      } else {
        toast.error(res.message || t('Submit failed'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t('Apply Withdrawal')}</DialogTitle>
          <DialogDescription>
            {t('Available')}:{' '}
            {formatQuotaWithCurrency(props.summary?.withdrawable_quota || 0)}
            {withdrawableAmount
              ? ` · ${t('Approx.')} ${withdrawableAmount.toFixed(0)}`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <div className='grid gap-4'>
          <div className='grid gap-2'>
            <Label htmlFor='agent-withdrawal-amount'>{t('Amount')}</Label>
            <Input
              id='agent-withdrawal-amount'
              type='number'
              min='10'
              step='10'
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>

          <div className='grid gap-2'>
            <Label htmlFor='agent-payment-account'>
              {t('Payment Account')}
            </Label>
            <Input
              id='agent-payment-account'
              value={paymentAccount}
              onChange={(event) => setPaymentAccount(event.target.value)}
              placeholder={t('Alipay, WeChat, bank account, or contact')}
            />
          </div>

          <div className='grid gap-2'>
            <Label htmlFor='agent-payment-code'>{t('Payment QR Code')}</Label>
            <div className='flex items-center gap-2'>
              <Input
                id='agent-payment-code'
                type='file'
                accept='image/*'
                onChange={handleFileChange}
              />
              <Upload className='text-muted-foreground size-4 shrink-0' />
            </div>
            {fileName ? (
              <div className='text-muted-foreground text-xs'>{fileName}</div>
            ) : null}
          </div>

          <div className='grid gap-2'>
            <Label htmlFor='agent-withdrawal-note'>{t('Note')}</Label>
            <Textarea
              id='agent-withdrawal-note'
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => props.onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            <Send className='size-4' />
            {submitting ? t('Submitting') : t('Submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AgentTable<T>(props: {
  columns: string[]
  rows: T[]
  emptyText: string
  renderRow: (row: T) => ReactNode
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {props.columns.map((column) => (
            <TableHead key={column}>{column}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.rows.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={props.columns.length}
              className='text-muted-foreground h-20 text-center'
            >
              {props.emptyText}
            </TableCell>
          </TableRow>
        ) : (
          props.rows.map(props.renderRow)
        )}
      </TableBody>
    </Table>
  )
}

export function AgentCenter() {
  const { t } = useTranslation()
  const { copyToClipboard } = useCopyToClipboard({
    successMessage: t('Invitation link copied'),
  })
  const [summary, setSummary] = useState<AgentSummary | null>(null)
  const [customers, setCustomers] = useState<AgentCustomer[]>([])
  const [commissions, setCommissions] = useState<AgentCommission[]>([])
  const [usageLogs, setUsageLogs] = useState<AgentUsageLog[]>([])
  const [usageLogPage, setUsageLogPage] = useState(1)
  const [usageLogTotal, setUsageLogTotal] = useState(0)
  const [withdrawals, setWithdrawals] = useState<AgentWithdrawal[]>([])
  const [loading, setLoading] = useState(true)
  const [withdrawalOpen, setWithdrawalOpen] = useState(false)
  const [transferring, setTransferring] = useState(false)
  const [activeTab, setActiveTab] = useState<
    'commissions' | 'customers' | 'usageLogs' | 'withdrawals'
  >('commissions')

  const invitationLink = buildAgentLink(summary?.aff_code)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [
        summaryRes,
        customersRes,
        commissionsRes,
        usageLogsRes,
        withdrawalsRes,
      ] = await Promise.all([
        getAgentSummary(),
        getAgentCustomers(1, 10),
        getAgentCommissions(1, 10),
        getAgentUsageLogs(usageLogPage, agentUsageLogsPageSize),
        getAgentWithdrawals(1, 10),
      ])
      if (summaryRes.success && summaryRes.data) {
        setSummary(summaryRes.data)
      }
      if (customersRes.success && customersRes.data) {
        setCustomers(customersRes.data.items || [])
      }
      if (commissionsRes.success && commissionsRes.data) {
        setCommissions(commissionsRes.data.items || [])
      }
      if (usageLogsRes.success && usageLogsRes.data) {
        setUsageLogs(usageLogsRes.data.items || [])
        setUsageLogTotal(usageLogsRes.data.total || 0)
      }
      if (withdrawalsRes.success && withdrawalsRes.data) {
        setWithdrawals(withdrawalsRes.data.items || [])
      }
    } finally {
      setLoading(false)
    }
  }, [usageLogPage])

  useEffect(() => {
    refresh()
  }, [refresh])

  const progressValue = useMemo(() => {
    if (!summary?.next_tier_threshold_quota) return 100
    return Math.min(
      100,
      (summary.total_customer_consume_quota /
        summary.next_tier_threshold_quota) *
        100
    )
  }, [summary])

  const usageLogTotalPages = Math.max(
    1,
    Math.ceil(usageLogTotal / agentUsageLogsPageSize)
  )
  const usageLogDisplayStart =
    usageLogTotal === 0 ? 0 : (usageLogPage - 1) * agentUsageLogsPageSize + 1
  const usageLogDisplayEnd = Math.min(
    usageLogPage * agentUsageLogsPageSize,
    usageLogTotal
  )

  const handleTransfer = async () => {
    setTransferring(true)
    try {
      const res = await transferAgentCommission()
      if (res.success) {
        toast.success(t('Transferred to balance'))
        await refresh()
      } else {
        toast.error(res.message || t('Transfer failed'))
      }
    } finally {
      setTransferring(false)
    }
  }

  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>{t('Agent Center')}</SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <Button variant='outline' onClick={refresh} disabled={loading}>
            <RefreshCw className='size-4' />
            {t('Refresh')}
          </Button>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <div className='mx-auto flex w-full max-w-7xl flex-col gap-4'>
            <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
              <StatCard
                title={t('Current Rate')}
                value={summary ? formatRate(summary.current_rate_bps) : '-'}
                icon={BadgeDollarSign}
                loading={loading}
                description={
                  summary?.manual_rate_bps
                    ? t('Manual rate')
                    : t('Automatic tier')
                }
              />
              <StatCard
                title={t('Customers')}
                value={summary?.customer_count || 0}
                icon={Users}
                loading={loading}
              />
              <StatCard
                title={t('Withdrawable')}
                value={formatQuotaWithCurrency(
                  summary?.withdrawable_quota || 0
                )}
                icon={Wallet}
                loading={loading}
              />
              <StatCard
                title={t('Total Commission')}
                value={formatQuotaWithCurrency(
                  summary?.total_commission_quota || 0
                )}
                icon={CheckCircle2}
                loading={loading}
              />
            </div>

            <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]'>
              <Card>
                <CardHeader>
                  <CardTitle>{t('Tier Progress')}</CardTitle>
                  <CardDescription>
                    {summary?.next_tier_threshold_quota
                      ? `${formatQuotaWithCurrency(summary.total_customer_consume_quota)} / ${formatQuotaWithCurrency(summary.next_tier_threshold_quota)}`
                      : t('Highest tier reached')}
                  </CardDescription>
                  <CardAction>
                    <Badge variant='secondary'>
                      {summary?.next_tier_commission_rate_bps
                        ? formatRate(summary.next_tier_commission_rate_bps)
                        : formatRate(summary?.current_rate_bps || 0)}
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <Progress value={progressValue} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('Invitation Link')}</CardTitle>
                  <CardDescription>
                    {summary?.aff_code || t('Loading')}
                  </CardDescription>
                </CardHeader>
                <CardContent className='flex gap-2'>
                  <Input value={invitationLink} readOnly />
                  <Button
                    size='icon'
                    variant='outline'
                    onClick={() =>
                      invitationLink && copyToClipboard(invitationLink)
                    }
                    disabled={!invitationLink}
                  >
                    <Copy className='size-4' />
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>{t('Commission Balance')}</CardTitle>
                <CardDescription>
                  {t('Pending withdrawal')}:{' '}
                  {formatQuotaWithCurrency(summary?.withdrawing_quota || 0)}
                </CardDescription>
                <CardAction className='flex gap-2'>
                  <Button
                    variant='outline'
                    onClick={handleTransfer}
                    disabled={
                      !summary?.pending_commission_quota || transferring
                    }
                  >
                    <Wallet className='size-4' />
                    {t('Transfer')}
                  </Button>
                  <Button
                    onClick={() => setWithdrawalOpen(true)}
                    disabled={
                      !summary ||
                      summary.withdrawable_quota <
                        summary.minimum_withdrawal_quota
                    }
                  >
                    <Send className='size-4' />
                    {t('Withdraw')}
                  </Button>
                </CardAction>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('Agent Records')}</CardTitle>
                <CardAction className='flex gap-1'>
                  {(
                    [
                      'commissions',
                      'customers',
                      'usageLogs',
                      'withdrawals',
                    ] as const
                  ).map((tab) => (
                    <Button
                      key={tab}
                      size='sm'
                      variant={activeTab === tab ? 'default' : 'outline'}
                      onClick={() => setActiveTab(tab)}
                    >
                      {tab === 'usageLogs'
                        ? t('Usage Logs')
                        : t(tab[0].toUpperCase() + tab.slice(1))}
                    </Button>
                  ))}
                </CardAction>
              </CardHeader>
              <CardContent>
                {activeTab === 'commissions' ? (
                  <AgentTable
                    columns={[
                      t('Customer'),
                      t('Usage'),
                      t('Commission'),
                      t('Rate'),
                      t('Time'),
                    ]}
                    rows={commissions}
                    emptyText={t('No commission records')}
                    renderRow={(row) => (
                      <TableRow key={row.id}>
                        <TableCell>#{row.customer_user_id}</TableCell>
                        <TableCell>
                          {formatQuotaWithCurrency(row.quota)}
                        </TableCell>
                        <TableCell>
                          {formatQuotaWithCurrency(row.commission_quota)}
                        </TableCell>
                        <TableCell>
                          {formatRate(row.commission_rate_bps)}
                        </TableCell>
                        <TableCell>{formatDate(row.created_at)}</TableCell>
                      </TableRow>
                    )}
                  />
                ) : null}
                {activeTab === 'customers' ? (
                  <AgentTable
                    columns={[t('User'), t('Group'), t('Used'), t('Joined')]}
                    rows={customers}
                    emptyText={t('No customers')}
                    renderRow={(row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          {row.display_name || row.username}
                        </TableCell>
                        <TableCell>{row.group}</TableCell>
                        <TableCell>
                          {formatQuotaWithCurrency(row.used_quota)}
                        </TableCell>
                        <TableCell>{formatDate(row.created_at)}</TableCell>
                      </TableRow>
                    )}
                  />
                ) : null}
                {activeTab === 'usageLogs' ? (
                  <div className='space-y-3'>
                    <div className='overflow-x-auto'>
                      <AgentTable
                        columns={[
                          t('Customer'),
                          t('Model'),
                          t('Usage'),
                          t('Tokens'),
                          t('Time'),
                        ]}
                        rows={usageLogs}
                        emptyText={t('No usage logs')}
                        renderRow={(row) => (
                          <TableRow key={row.request_id || row.id}>
                            <TableCell>
                              <div className='font-medium'>
                                {row.username || `#${row.user_id}`}
                              </div>
                              <div className='text-muted-foreground text-xs'>
                                #{row.user_id}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>{row.model_name || '-'}</div>
                              <div className='text-muted-foreground text-xs'>
                                {row.group || '-'}
                              </div>
                            </TableCell>
                            <TableCell>
                              {formatQuotaWithCurrency(row.quota)}
                            </TableCell>
                            <TableCell>
                              {(row.prompt_tokens || 0) +
                                (row.completion_tokens || 0)}
                            </TableCell>
                            <TableCell>{formatDate(row.created_at)}</TableCell>
                          </TableRow>
                        )}
                      />
                    </div>
                    {usageLogTotal > 0 ? (
                      <div className='flex flex-col items-center gap-3 border-t pt-3 sm:flex-row sm:justify-between'>
                        <div className='text-muted-foreground text-xs sm:text-sm'>
                          {t('Showing')} {usageLogDisplayStart}-
                          {usageLogDisplayEnd} {t('of')} {usageLogTotal}
                        </div>
                        <div className='flex items-center gap-2'>
                          <Button
                            type='button'
                            variant='outline'
                            size='icon-sm'
                            aria-label={t('Previous page')}
                            onClick={() =>
                              setUsageLogPage((current) =>
                                Math.max(1, current - 1)
                              )
                            }
                            disabled={loading || usageLogPage <= 1}
                          >
                            <ChevronLeft className='size-4' />
                          </Button>
                          <div className='text-muted-foreground flex min-w-12 items-center justify-center gap-1 text-sm'>
                            <span className='text-foreground font-medium'>
                              {usageLogPage}
                            </span>
                            <span>/</span>
                            <span>{usageLogTotalPages}</span>
                          </div>
                          <Button
                            type='button'
                            variant='outline'
                            size='icon-sm'
                            aria-label={t('Next page')}
                            onClick={() =>
                              setUsageLogPage((current) =>
                                Math.min(usageLogTotalPages, current + 1)
                              )
                            }
                            disabled={
                              loading || usageLogPage >= usageLogTotalPages
                            }
                          >
                            <ChevronRight className='size-4' />
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {activeTab === 'withdrawals' ? (
                  <AgentTable
                    columns={[
                      t('Amount'),
                      t('Account'),
                      t('Status'),
                      t('Submitted'),
                    ]}
                    rows={withdrawals}
                    emptyText={t('No withdrawals')}
                    renderRow={(row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          {formatQuotaWithCurrency(row.amount_quota)}
                        </TableCell>
                        <TableCell>{row.payment_account || '-'}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(row.status)}>
                            {t(withdrawalStatusLabels[row.status] || 'Unknown')}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(row.created_at)}</TableCell>
                      </TableRow>
                    )}
                  />
                ) : null}
              </CardContent>
            </Card>
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <WithdrawalDialog
        open={withdrawalOpen}
        onOpenChange={setWithdrawalOpen}
        summary={summary}
        onSubmitted={refresh}
      />
    </>
  )
}
