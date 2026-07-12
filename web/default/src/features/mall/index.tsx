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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Spinner } from '@/components/ui/spinner'

import { MALL_EMBED_CONFIG } from './content'

export function Mall() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const crop = MALL_EMBED_CONFIG.cropPx
  const horizontalCrop = crop.left + crop.right
  const verticalCrop = crop.top + crop.bottom

  return (
    <SectionPageLayout fixedContent>
      <SectionPageLayout.Title>{t('Mall')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='relative h-full min-h-0 overflow-hidden bg-transparent'>
          {loading && (
            <div className='bg-background/80 text-muted-foreground absolute inset-0 z-10 flex items-center justify-center gap-2 text-sm backdrop-blur-sm'>
              <Spinner className='size-4' />
              <span>{t('Loading...')}</span>
            </div>
          )}
          <div className='h-full overflow-hidden bg-transparent'>
            {/* eslint-disable react/iframe-missing-sandbox -- The embedded shop is a cross-origin SPA that needs scripts plus its own same-origin cookies and API calls. */}
            <iframe
              title={t('Mall')}
              src={MALL_EMBED_CONFIG.src}
              className='block border-0 bg-white'
              style={{
                height: `calc(100% + ${verticalCrop}px)`,
                minWidth: MALL_EMBED_CONFIG.minDesktopWidthPx + horizontalCrop,
                transform: `translate(-${crop.left}px, -${crop.top}px)`,
                width: `calc(100% + ${horizontalCrop}px)`,
              }}
              referrerPolicy='no-referrer-when-downgrade'
              sandbox='allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation allow-downloads'
              allow='clipboard-write; payment'
              onLoad={() => setLoading(false)}
            />
            {/* eslint-enable react/iframe-missing-sandbox */}
          </div>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
