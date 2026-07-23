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
import { MessageCircle, QrCode } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Card, CardContent } from '@/components/ui/card'

import { SUPPORT_CONTACT } from './content'

export function Support() {
  const { t } = useTranslation()

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Customer Service')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='mx-auto flex w-full max-w-3xl flex-col gap-4'>
          <Card>
            <CardContent className='grid gap-6 p-4 sm:p-6 md:grid-cols-[minmax(0,1fr)_260px] md:items-center'>
              <div className='space-y-4'>
                <div className='flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary'>
                  <MessageCircle className='size-6' aria-hidden='true' />
                </div>
                <div className='space-y-2'>
                  <h2 className='text-2xl font-semibold tracking-normal'>
                    {t('Add WeChat for help')}
                  </h2>
                  <p className='text-sm leading-6 text-muted-foreground'>
                    {t(
                      'If you have any questions, add the WeChat below. Website users can also join the internal group through WeChat. You can ask questions in the group, and there will be occasional benefits.'
                    )}
                  </p>
                </div>
                <div className='rounded-lg border bg-muted/30 p-4'>
                  <div className='text-sm text-muted-foreground'>
                    {t('WeChat ID')}
                  </div>
                  <div className='mt-1 break-all font-mono text-xl font-semibold tracking-normal'>
                    {SUPPORT_CONTACT.wechatId}
                  </div>
                </div>
              </div>
              <div className='flex flex-col items-center gap-3 rounded-lg border bg-background p-4'>
                <img
                  src={SUPPORT_CONTACT.qrCodeSrc}
                  alt={t('Customer service WeChat QR code')}
                  className='aspect-square w-full max-w-[220px] rounded-md object-contain'
                />
                <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                  <QrCode className='size-4' aria-hidden='true' />
                  <span>{t('Scan the QR code to add WeChat')}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
