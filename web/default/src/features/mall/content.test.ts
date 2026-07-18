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
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import * as mallContent from './content.ts'

describe('mall navigation config', () => {
  test('uses the embedded shop route', () => {
    assert.deepEqual(mallContent.MALL_LINK_CONFIG, {
      configUrls: ['/mall'],
      external: false,
      url: '/mall',
    })
  })
})

describe('mall embed config', () => {
  test('uses the direct shop URL and preserves the product-panel crop', () => {
    const config = (
      mallContent as typeof mallContent & {
        MALL_EMBED_CONFIG?: {
          cropPx: Record<string, number>
          minDesktopWidthPx: number
          panelHeightPx: number
          panelWidthPx: number
          src: string
        }
      }
    ).MALL_EMBED_CONFIG

    assert.ok(config)
    assert.equal(config.src, 'https://pay.ldxp.cn/shop/baixiaosheng')
    assert.deepEqual(config.cropPx, {
      bottom: 110,
      left: 241,
      right: 216,
      top: 226,
    })
    assert.equal(config.panelHeightPx, 770)
    assert.equal(config.panelWidthPx, 1367)
    assert.equal(config.minDesktopWidthPx, 1180)
  })

  test('keeps desktop cropping separate from the complete mobile layout', () => {
    const getLayout = (
      mallContent as typeof mallContent & {
        getMallIframeLayout?: (isMobile: boolean) => Record<string, string>
      }
    ).getMallIframeLayout

    assert.ok(getLayout)
    assert.deepEqual(getLayout(false), {
      height: '1106px',
      minWidth: '1637px',
      transform: 'translate(-241px, -226px)',
      width: '1824px',
    })
    assert.deepEqual(getLayout(true), {
      height: '100%',
      minWidth: '100%',
      transform: 'none',
      width: '100%',
    })
  })

  test('grants only the shop capabilities needed for checkout', () => {
    const content = mallContent as typeof mallContent & {
      MALL_IFRAME_ALLOW?: string
      MALL_IFRAME_SANDBOX?: string
    }

    assert.equal(
      content.MALL_IFRAME_SANDBOX,
      'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation allow-downloads'
    )
    assert.equal(content.MALL_IFRAME_ALLOW, 'clipboard-write; payment')
  })
})

describe('recharge and mall translations', () => {
  test('includes the user-facing names in English and Chinese locales', async () => {
    const localesDir = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../i18n/locales'
    )
    const [en, zh] = await Promise.all(
      ['en', 'zh'].map(async (locale) => {
        const source = await readFile(
          join(localesDir, `${locale}.json`),
          'utf8'
        )
        return JSON.parse(source).translation as Record<string, string>
      })
    )

    assert.equal(en['Recharge Center'], 'Recharge Center')
    assert.equal(en['Shanhai Treasure Pavilion'], 'Shanhai Treasure Pavilion')
    assert.equal(en['Open in new window'], 'Open in new window')
    assert.equal(zh['Recharge Center'], '充值中心')
    assert.equal(zh['Shanhai Treasure Pavilion'], '山海百宝阁')
    assert.equal(zh['Open in new window'], '在新窗口打开')
  })
})
