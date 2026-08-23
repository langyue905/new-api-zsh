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
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

import { adjustUserViolationCount } from '../api'
import type { ViolationCountAdjustMode } from '../types'

const MAX_VIOLATION_COUNT = 2_147_483_647
const VIOLATION_MODE_LABELS: Record<ViolationCountAdjustMode, string> = {
  add: 'Add',
  subtract: 'Subtract',
  override: 'Override',
}

type UserViolationDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: number
  currentCount: number
  onSuccess: () => void
}

export function UserViolationDialog(props: UserViolationDialogProps) {
  const { t } = useTranslation()
  const inputId = useId()
  const [mode, setMode] = useState<ViolationCountAdjustMode>('add')
  const [amount, setAmount] = useState('')
  const [errorKey, setErrorKey] = useState('')
  const [loading, setLoading] = useState(false)

  const parsedAmount = Number(amount)
  const previewValue = Number.isSafeInteger(parsedAmount) ? parsedAmount : 0
  let nextCount = previewValue
  let operator = '→'
  if (mode === 'add') {
    nextCount = props.currentCount + previewValue
    operator = '+'
  } else if (mode === 'subtract') {
    nextCount = props.currentCount - previewValue
    operator = '-'
  }

  const reset = () => {
    setMode('add')
    setAmount('')
    setErrorKey('')
  }

  const close = () => {
    reset()
    props.onOpenChange(false)
  }

  const validate = () => {
    if (
      amount.trim() === '' ||
      !Number.isSafeInteger(parsedAmount) ||
      parsedAmount < 0 ||
      parsedAmount > MAX_VIOLATION_COUNT
    ) {
      return 'Enter a whole number between 0 and 2147483647'
    }
    if (mode !== 'override' && parsedAmount === 0) {
      return 'Adjustment must be greater than zero'
    }
    if (mode === 'subtract' && parsedAmount > props.currentCount) {
      return 'Violation count cannot be below zero'
    }
    if (
      mode === 'add' &&
      props.currentCount + parsedAmount > MAX_VIOLATION_COUNT
    ) {
      return 'Violation count cannot exceed 2147483647'
    }
    return ''
  }

  const handleConfirm = async () => {
    const validationError = validate()
    setErrorKey(validationError)
    if (validationError) return

    setLoading(true)
    try {
      const result = await adjustUserViolationCount({
        id: props.userId,
        action: 'adjust_violation_count',
        mode,
        value: parsedAmount,
      })
      if (!result.success) {
        setErrorKey(result.message || 'Failed to adjust violation count')
        return
      }
      toast.success(t('Violation count adjusted successfully'))
      close()
      props.onSuccess()
    } catch (error) {
      setErrorKey(
        error instanceof Error
          ? error.message
          : 'Failed to adjust violation count'
      )
    } finally {
      setLoading(false)
    }
  }

  const preview = `${t('Current violation count')}: ${props.currentCount} ${operator} ${previewValue} = ${nextCount}`

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) reset()
        props.onOpenChange(open)
      }}
      title={t('Adjust Violation Count')}
      description={t('Select an operation mode and enter the count')}
      contentHeight='auto'
      bodyClassName='space-y-4'
      footer={
        <>
          <Button variant='outline' onClick={close} disabled={loading}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading ? t('Processing...') : t('Confirm')}
          </Button>
        </>
      }
    >
      <p className='text-muted-foreground text-sm'>{preview}</p>
      <div className='space-y-2'>
        <Label>{t('Mode')}</Label>
        <div className='flex gap-1'>
          {(['add', 'subtract', 'override'] as const).map((option) => (
            <Button
              key={option}
              type='button'
              variant='outline'
              size='sm'
              className={cn(
                mode === option &&
                  'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
              )}
              onClick={() => {
                setMode(option)
                setAmount('')
                setErrorKey('')
              }}
            >
              {t(VIOLATION_MODE_LABELS[option])}
            </Button>
          ))}
        </div>
      </div>
      <div className='space-y-2'>
        <Label htmlFor={inputId}>{t('Count')}</Label>
        <Input
          id={inputId}
          type='number'
          step={1}
          min={0}
          max={MAX_VIOLATION_COUNT}
          value={amount}
          aria-invalid={Boolean(errorKey)}
          onChange={(event) => {
            setAmount(event.target.value)
            setErrorKey('')
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void handleConfirm()
          }}
        />
        {errorKey ? (
          <p role='alert' className='text-destructive text-sm'>
            {t(errorKey)}
          </p>
        ) : null}
      </div>
    </Dialog>
  )
}
