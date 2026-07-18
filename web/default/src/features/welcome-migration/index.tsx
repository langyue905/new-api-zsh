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
import { ExternalLink, MessageCircle } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

const NEW_SITE_URL = 'https://zshai.cc'
const WECHAT_ID = 'xxz231005'
const DISMISSED_STORAGE_KEY = 'welcome-migration:dismissed'
const SHOWN_SESSION_KEY = 'welcome-migration:shown'

type BrowserStorageName = 'localStorage' | 'sessionStorage'

function getBrowserStorage(name: BrowserStorageName): Storage | null {
  try {
    return window[name]
  } catch {
    return null
  }
}

function readStorage(storage: Storage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null
  } catch {
    return null
  }
}

function writeStorage(storage: Storage | null, key: string) {
  try {
    storage?.setItem(key, 'true')
  } catch {
    // The dialog remains usable when browser storage is unavailable.
  }
}

export function WelcomeMigrationDialog() {
  const [open, setOpen] = useState(false)
  const [dontRemindAgain, setDontRemindAgain] = useState(false)

  useEffect(() => {
    const localStorage = getBrowserStorage('localStorage')
    const sessionStorage = getBrowserStorage('sessionStorage')

    if (readStorage(localStorage, DISMISSED_STORAGE_KEY) === 'true') {
      return
    }

    if (readStorage(sessionStorage, SHOWN_SESSION_KEY) === 'true') {
      return
    }

    writeStorage(sessionStorage, SHOWN_SESSION_KEY)
    setOpen(true)
  }, [])

  const closeDialog = () => {
    if (dontRemindAgain) {
      writeStorage(getBrowserStorage('localStorage'), DISMISSED_STORAGE_KEY)
    }
    setOpen(false)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setOpen(true)
      return
    }
    closeDialog()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      title='网站迁移通知'
      description='为了给大家带来更稳定、顺畅的使用体验，我们正在更换服务器，并启用了新的域名。'
      contentClassName='sm:max-w-xl'
      descriptionClassName='pr-7 leading-6'
      bodyClassName='space-y-4'
      footer={
        <>
          <Button
            variant='outline'
            render={
              <a
                href={NEW_SITE_URL}
                target='_blank'
                rel='noopener noreferrer'
              />
            }
            onClick={closeDialog}
          >
            <ExternalLink className='size-4' aria-hidden='true' />
            前往新网站
          </Button>
          <Button onClick={closeDialog}>我知道了</Button>
        </>
      }
    >
      <div className='grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center'>
        <div className='space-y-4'>
          <p className='text-muted-foreground text-sm leading-6'>
            新网站目前仍在部署中，完成后请前往
            <a
              href={NEW_SITE_URL}
              target='_blank'
              rel='noopener noreferrer'
              className='text-foreground mx-1 font-medium underline underline-offset-4'
            >
              zshai.cc
            </a>
            重新注册并使用。
          </p>

          <div className='bg-muted/30 space-y-3 rounded-lg border p-4'>
            <div className='flex items-start gap-3'>
              <div className='bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg'>
                <MessageCircle className='size-5' aria-hidden='true' />
              </div>
              <p className='text-sm leading-6'>
                为避免错过新站开放、网站迁移等重要消息，请先添加主播微信。
              </p>
            </div>
            <div>
              <div className='text-muted-foreground text-xs'>微信号</div>
              <div className='mt-1 font-mono text-lg font-semibold break-all'>
                {WECHAT_ID}
              </div>
            </div>
          </div>
        </div>

        <div className='bg-background flex flex-col items-center gap-2 rounded-lg border p-3'>
          <img
            src='/welcome-migration-wechat.jpg'
            alt='主播微信二维码'
            className='aspect-square w-full max-w-[180px] rounded-md object-contain'
          />
          <span className='text-muted-foreground text-xs'>扫码添加微信</span>
        </div>
      </div>

      <div className='flex items-center gap-3 border-t pt-4'>
        <Checkbox
          id='welcome-migration-dont-remind'
          checked={dontRemindAgain}
          onCheckedChange={(checked) => setDontRemindAgain(checked === true)}
        />
        <Label
          htmlFor='welcome-migration-dont-remind'
          className='cursor-pointer text-sm font-normal'
        >
          不再提醒
        </Label>
      </div>
    </Dialog>
  )
}
