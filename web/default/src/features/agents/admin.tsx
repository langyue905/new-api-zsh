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
  Link2,
  RefreshCw,
  Search,
  Send,
  ShieldOff,
  Users,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatQuotaWithCurrency } from '@/lib/currency'

import {
  assignAdminAgentCustomer,
  getAdminAgentProfiles,
  getAdminAgentWithdrawals,
  processAdminAgentWithdrawal,
  updateAdminAgentProfile,
} from './api'
import type { AgentProfileView, AgentWithdrawal } from './types'

const withdrawalStatusLabels: Record<number, string> = {
  1: 'Pending',
  2: 'Paid',
  3: 'Rejected',
}

const agentProfilesPageSize = 20

function formatRate(rateBps: number) {
  return `${(rateBps / 100).toFixed(0)}%`
}

function formatDate(timestamp?: number) {
  if (!timestamp) return '-'
  return new Date(timestamp * 1000).toLocaleString()
}

function getStatusVariant(
  status: number
): 'default' | 'secondary' | 'destructive' {
  if (status === 2) return 'default'
  if (status === 3) return 'destructive'
  return 'secondary'
}

function profileRateValue(profile: AgentProfileView) {
  return profile.manual_rate_bps > 0
    ? profile.manual_rate_bps.toString()
    : 'auto'
}

function AgentProfileTable(props: {
  profiles: AgentProfileView[]
  updatingUserId: number | null
  onRefresh: () => Promise<void>
}) {
  const { t } = useTranslation()

  const updateRate = async (profile: AgentProfileView, value: string) => {
    const res = await updateAdminAgentProfile({
      user_id: profile.user_id,
      enabled: profile.enabled,
      manual_rate: value !== 'auto',
      commission_rate_bps: value === 'auto' ? undefined : Number(value),
    })
    if (res.success) {
      toast.success(t('Updated successfully'))
      await props.onRefresh()
    } else {
      toast.error(res.message || t('Update failed'))
    }
  }

  const toggleEnabled = async (profile: AgentProfileView) => {
    const manualRate = profile.manual_rate_bps > 0
    const res = await updateAdminAgentProfile({
      user_id: profile.user_id,
      enabled: !profile.enabled,
      manual_rate: manualRate,
      commission_rate_bps: manualRate ? profile.manual_rate_bps : undefined,
    })
    if (res.success) {
      toast.success(t('Updated successfully'))
      await props.onRefresh()
    } else {
      toast.error(res.message || t('Update failed'))
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('User')}</TableHead>
          <TableHead>{t('Customers')}</TableHead>
          <TableHead>{t('Consumption')}</TableHead>
          <TableHead>{t('Commission')}</TableHead>
          <TableHead>{t('Withdrawable')}</TableHead>
          <TableHead>{t('Status')}</TableHead>
          <TableHead>{t('Actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.profiles.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={7}
              className='text-muted-foreground h-20 text-center'
            >
              {t('No users')}
            </TableCell>
          </TableRow>
        ) : (
          props.profiles.map((profile) => (
            <TableRow key={profile.user_id}>
              <TableCell>
                <div className='font-medium'>
                  {profile.display_name || profile.username}
                </div>
                <div className='text-muted-foreground text-xs'>
                  #{profile.user_id} · {profile.email || '-'}
                </div>
              </TableCell>
              <TableCell>{profile.customer_count}</TableCell>
              <TableCell>
                {formatQuotaWithCurrency(profile.total_customer_consume_quota)}
              </TableCell>
              <TableCell>
                <NativeSelect
                  size='sm'
                  value={profileRateValue(profile)}
                  disabled={props.updatingUserId === profile.user_id}
                  onChange={(event) => updateRate(profile, event.target.value)}
                >
                  <NativeSelectOption value='auto'>
                    {t('Auto')} ({formatRate(profile.current_rate_bps)})
                  </NativeSelectOption>
                  <NativeSelectOption value='700'>7%</NativeSelectOption>
                  <NativeSelectOption value='1000'>10%</NativeSelectOption>
                  <NativeSelectOption value='1300'>13%</NativeSelectOption>
                </NativeSelect>
              </TableCell>
              <TableCell>
                {formatQuotaWithCurrency(profile.pending_commission_quota)}
              </TableCell>
              <TableCell>
                <Badge variant={profile.enabled ? 'secondary' : 'destructive'}>
                  {profile.enabled ? t('Enabled') : t('Disabled')}
                </Badge>
              </TableCell>
              <TableCell>
                <Button
                  size='sm'
                  variant={profile.enabled ? 'destructive' : 'outline'}
                  onClick={() => toggleEnabled(profile)}
                  disabled={props.updatingUserId === profile.user_id}
                >
                  {profile.enabled ? (
                    <ShieldOff className='size-4' />
                  ) : (
                    <CheckCircle2 className='size-4' />
                  )}
                  {profile.enabled ? t('Disable') : t('Enable')}
                </Button>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}

function WithdrawalTable(props: {
  withdrawals: AgentWithdrawal[]
  notes: Record<number, string>
  onNoteChange: (id: number, value: string) => void
  onProcess: (id: number, status: number) => Promise<void>
}) {
  const { t } = useTranslation()
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('Agent')}</TableHead>
          <TableHead>{t('Amount')}</TableHead>
          <TableHead>{t('Payment')}</TableHead>
          <TableHead>{t('Status')}</TableHead>
          <TableHead>{t('Admin Note')}</TableHead>
          <TableHead>{t('Actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.withdrawals.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={6}
              className='text-muted-foreground h-20 text-center'
            >
              {t('No withdrawals')}
            </TableCell>
          </TableRow>
        ) : (
          props.withdrawals.map((withdrawal) => (
            <TableRow key={withdrawal.id}>
              <TableCell>
                <div className='font-medium'>
                  {withdrawal.display_name || withdrawal.username || '-'}
                </div>
                <div className='text-muted-foreground text-xs'>
                  #{withdrawal.agent_user_id}
                </div>
              </TableCell>
              <TableCell>
                {formatQuotaWithCurrency(withdrawal.amount_quota)}
              </TableCell>
              <TableCell>
                <div>{withdrawal.payment_account || '-'}</div>
                {withdrawal.payment_qr_code ? (
                  <Button
                    size='xs'
                    variant='link'
                    className='h-5 px-0'
                    onClick={() =>
                      window.open(withdrawal.payment_qr_code, '_blank')
                    }
                  >
                    <Link2 className='size-3' />
                    {t('QR Code')}
                  </Button>
                ) : null}
              </TableCell>
              <TableCell>
                <Badge variant={getStatusVariant(withdrawal.status)}>
                  {t(withdrawalStatusLabels[withdrawal.status] || 'Unknown')}
                </Badge>
                <div className='text-muted-foreground mt-1 text-xs'>
                  {formatDate(withdrawal.created_at)}
                </div>
              </TableCell>
              <TableCell>
                {withdrawal.status === 1 ? (
                  <Input
                    value={props.notes[withdrawal.id] || ''}
                    onChange={(event) =>
                      props.onNoteChange(withdrawal.id, event.target.value)
                    }
                    placeholder={t('Optional')}
                  />
                ) : (
                  withdrawal.admin_note || '-'
                )}
              </TableCell>
              <TableCell>
                {withdrawal.status === 1 ? (
                  <div className='flex gap-2'>
                    <Button
                      size='sm'
                      onClick={() => props.onProcess(withdrawal.id, 2)}
                    >
                      <CheckCircle2 className='size-4' />
                      {t('Paid')}
                    </Button>
                    <Button
                      size='sm'
                      variant='destructive'
                      onClick={() => props.onProcess(withdrawal.id, 3)}
                    >
                      <XCircle className='size-4' />
                      {t('Reject')}
                    </Button>
                  </div>
                ) : (
                  <span className='text-muted-foreground text-sm'>
                    {formatDate(withdrawal.processed_at)}
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}

export function AgentAdmin() {
  const { t } = useTranslation()
  const [profiles, setProfiles] = useState<AgentProfileView[]>([])
  const [withdrawals, setWithdrawals] = useState<AgentWithdrawal[]>([])
  const [loading, setLoading] = useState(true)
  const [withdrawalStatus, setWithdrawalStatus] = useState(1)
  const [profilePage, setProfilePage] = useState(1)
  const [profileTotal, setProfileTotal] = useState(0)
  const [profileKeyword, setProfileKeyword] = useState('')
  const [profileKeywordInput, setProfileKeywordInput] = useState('')
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [customerId, setCustomerId] = useState('')
  const [agentId, setAgentId] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [activeTab, setActiveTab] = useState<'profiles' | 'withdrawals'>(
    'profiles'
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [profilesRes, withdrawalsRes] = await Promise.all([
        getAdminAgentProfiles(
          profilePage,
          agentProfilesPageSize,
          profileKeyword
        ),
        getAdminAgentWithdrawals(1, 50, withdrawalStatus),
      ])
      if (profilesRes.success && profilesRes.data) {
        setProfiles(profilesRes.data.items || [])
        setProfileTotal(profilesRes.data.total || 0)
      }
      if (withdrawalsRes.success && withdrawalsRes.data) {
        setWithdrawals(withdrawalsRes.data.items || [])
      }
    } finally {
      setLoading(false)
    }
  }, [profileKeyword, profilePage, withdrawalStatus])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleProfileSearch = async () => {
    const nextKeyword = profileKeywordInput.trim()
    if (profilePage === 1 && nextKeyword === profileKeyword) {
      await refresh()
      return
    }
    setProfilePage(1)
    setProfileKeyword(nextKeyword)
  }

  const handleAssign = async () => {
    const parsedCustomerId = Number(customerId)
    const parsedAgentId = Number(agentId)
    if (!parsedCustomerId || Number.isNaN(parsedCustomerId)) {
      toast.error(t('Please enter customer user ID'))
      return
    }
    if (Number.isNaN(parsedAgentId)) {
      toast.error(t('Please enter agent user ID'))
      return
    }
    setAssigning(true)
    try {
      const res = await assignAdminAgentCustomer({
        user_id: parsedCustomerId,
        agent_id: parsedAgentId,
      })
      if (res.success) {
        toast.success(t('Updated successfully'))
        setCustomerId('')
        setAgentId('')
        await refresh()
      } else {
        toast.error(res.message || t('Update failed'))
      }
    } finally {
      setAssigning(false)
    }
  }

  const handleProcess = async (id: number, status: number) => {
    const res = await processAdminAgentWithdrawal(id, {
      status,
      admin_note: notes[id] || '',
    })
    if (res.success) {
      toast.success(t('Updated successfully'))
      await refresh()
    } else {
      toast.error(res.message || t('Update failed'))
    }
  }

  const profileTotalPages = Math.max(
    1,
    Math.ceil(profileTotal / agentProfilesPageSize)
  )
  const profileDisplayStart =
    profileTotal === 0 ? 0 : (profilePage - 1) * agentProfilesPageSize + 1
  const profileDisplayEnd = Math.min(
    profilePage * agentProfilesPageSize,
    profileTotal
  )

  return (
    <SectionPageLayout fixedContent>
      <SectionPageLayout.Title>{t('Agent Management')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button variant='outline' onClick={refresh} disabled={loading}>
          <RefreshCw className='size-4' />
          {t('Refresh')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='flex h-full min-h-0 w-full flex-col gap-4 overflow-y-auto pr-1'>
          <div className='grid gap-4 xl:grid-cols-[1fr_380px]'>
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <BadgeDollarSign className='text-primary size-4' />
                  {t('Agent Rules')}
                </CardTitle>
                <CardDescription>
                  {t('Default 7%, upgrade to 10% at 100, then 13% at 1000.')}
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Users className='text-primary size-4' />
                  {t('Assign Customer')}
                </CardTitle>
              </CardHeader>
              <CardContent className='grid gap-3'>
                <div className='grid grid-cols-2 gap-2'>
                  <div className='grid gap-2'>
                    <Label>{t('Customer ID')}</Label>
                    <Input
                      value={customerId}
                      onChange={(event) => setCustomerId(event.target.value)}
                    />
                  </div>
                  <div className='grid gap-2'>
                    <Label>{t('Agent ID')}</Label>
                    <Input
                      value={agentId}
                      onChange={(event) => setAgentId(event.target.value)}
                    />
                  </div>
                </div>
                <Button onClick={handleAssign} disabled={assigning}>
                  <Send className='size-4' />
                  {t('Assign')}
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('Agent Management')}</CardTitle>
              <CardAction className='col-span-2 col-start-1 row-span-1 row-start-2 mt-2 flex w-full flex-col gap-2 justify-self-stretch sm:col-span-1 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:mt-0 sm:w-auto sm:flex-row sm:justify-self-end'>
                <div className='flex gap-2'>
                  <Button
                    type='button'
                    size='sm'
                    variant={activeTab === 'profiles' ? 'default' : 'outline'}
                    onClick={() => setActiveTab('profiles')}
                  >
                    {t('Profiles')}
                  </Button>
                  <Button
                    type='button'
                    size='sm'
                    variant={
                      activeTab === 'withdrawals' ? 'default' : 'outline'
                    }
                    onClick={() => setActiveTab('withdrawals')}
                  >
                    {t('Withdrawals')}
                  </Button>
                </div>
                {activeTab === 'profiles' ? (
                  <div className='flex min-w-0 flex-col gap-2 sm:flex-row'>
                    <form
                      className='flex min-w-0 gap-2 sm:w-[360px]'
                      onSubmit={(event) => {
                        event.preventDefault()
                        void handleProfileSearch()
                      }}
                    >
                      <div className='relative min-w-0 flex-1'>
                        <Search className='text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2' />
                        <Input
                          value={profileKeywordInput}
                          onChange={(event) =>
                            setProfileKeywordInput(event.target.value)
                          }
                          placeholder={t('Search users by ID, name, or email')}
                          className='h-7 pl-9'
                        />
                      </div>
                      <Button type='submit' size='sm' disabled={loading}>
                        <Search className='size-3.5' />
                        {t('Search')}
                      </Button>
                    </form>
                  </div>
                ) : null}
                {activeTab === 'withdrawals' ? (
                  <NativeSelect
                    size='sm'
                    value={withdrawalStatus.toString()}
                    onChange={(event) =>
                      setWithdrawalStatus(Number(event.target.value))
                    }
                  >
                    <NativeSelectOption value='0'>
                      {t('All')}
                    </NativeSelectOption>
                    <NativeSelectOption value='1'>
                      {t('Pending')}
                    </NativeSelectOption>
                    <NativeSelectOption value='2'>
                      {t('Paid')}
                    </NativeSelectOption>
                    <NativeSelectOption value='3'>
                      {t('Rejected')}
                    </NativeSelectOption>
                  </NativeSelect>
                ) : null}
              </CardAction>
            </CardHeader>
            <CardContent>
              {activeTab === 'profiles' ? (
                <div className='space-y-3'>
                  <div className='overflow-x-auto'>
                    <AgentProfileTable
                      profiles={profiles}
                      updatingUserId={null}
                      onRefresh={refresh}
                    />
                  </div>
                  {profileTotal > 0 ? (
                    <div className='flex flex-col items-center gap-3 border-t pt-3 sm:flex-row sm:justify-between'>
                      <div className='text-muted-foreground text-xs sm:text-sm'>
                        {t('Showing')} {profileDisplayStart}-{profileDisplayEnd}{' '}
                        {t('of')} {profileTotal}
                      </div>
                      <div className='flex items-center gap-2'>
                        <Button
                          type='button'
                          variant='outline'
                          size='icon-sm'
                          aria-label={t('Previous page')}
                          onClick={() =>
                            setProfilePage((current) =>
                              Math.max(1, current - 1)
                            )
                          }
                          disabled={loading || profilePage <= 1}
                        >
                          <ChevronLeft className='size-4' />
                        </Button>
                        <div className='text-muted-foreground flex min-w-12 items-center justify-center gap-1 text-sm'>
                          <span className='text-foreground font-medium'>
                            {profilePage}
                          </span>
                          <span>/</span>
                          <span>{profileTotalPages}</span>
                        </div>
                        <Button
                          type='button'
                          variant='outline'
                          size='icon-sm'
                          aria-label={t('Next page')}
                          onClick={() =>
                            setProfilePage((current) =>
                              Math.min(profileTotalPages, current + 1)
                            )
                          }
                          disabled={loading || profilePage >= profileTotalPages}
                        >
                          <ChevronRight className='size-4' />
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className='overflow-x-auto'>
                  <WithdrawalTable
                    withdrawals={withdrawals}
                    notes={notes}
                    onNoteChange={(id, value) =>
                      setNotes((current) => ({ ...current, [id]: value }))
                    }
                    onProcess={handleProcess}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
