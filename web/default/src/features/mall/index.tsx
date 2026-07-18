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
import { ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useMediaQuery } from '@/hooks'

import {
  getMallIframeLayout,
  MALL_EMBED_CONFIG,
  MALL_IFRAME_ALLOW,
  MALL_IFRAME_SANDBOX,
} from './content'

export function Mall() {
  const { t } = useTranslation()
  const isMobile = useMediaQuery('(max-width: 767px)')
  const [loading, setLoading] = useState(true)
  const iframeLayout = getMallIframeLayout(isMobile)

  const openShop = () => {
    window.open(MALL_EMBED_CONFIG.src, '_blank', 'noopener,noreferrer')
  }

  return (
    <SectionPageLayout fixedContent>
      <SectionPageLayout.Title>
        {t('Shanhai Treasure Pavilion')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button variant='outline' size='sm' onClick={openShop}>
          <ExternalLink aria-hidden='true' />
          {t('Open in new window')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='h-full min-h-0 overflow-hidden bg-transparent'>
          <div
            className='relative mx-auto h-full max-w-full overflow-hidden rounded-xl bg-white shadow-sm'
            style={{
              height: isMobile
                ? '100%'
                : `min(${MALL_EMBED_CONFIG.panelHeightPx}px, 100%)`,
              width: isMobile
                ? '100%'
                : `min(${MALL_EMBED_CONFIG.panelWidthPx}px, 100%)`,
            }}
          >
            {loading && (
              <div className='bg-background/80 text-muted-foreground absolute inset-0 z-10 flex items-center justify-center gap-2 text-sm backdrop-blur-sm'>
                <Spinner className='size-4' />
                <span>{t('Loading...')}</span>
              </div>
            )}
            {/* eslint-disable react/iframe-missing-sandbox -- The embedded shop is a cross-origin SPA that needs scripts plus its own same-origin cookies and API calls. */}
            <iframe
              title={t('Shanhai Treasure Pavilion')}
              src={MALL_EMBED_CONFIG.src}
              className='block border-0 bg-white'
              style={iframeLayout}
              referrerPolicy='no-referrer-when-downgrade'
              sandbox={MALL_IFRAME_SANDBOX}
              allow={MALL_IFRAME_ALLOW}
              onLoad={() => setLoading(false)}
            />
            {/* eslint-enable react/iframe-missing-sandbox */}
          </div>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
