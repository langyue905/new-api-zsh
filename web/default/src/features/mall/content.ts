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
export const MALL_LINK_CONFIG = {
  configUrls: ['/mall'] as string[],
  external: false,
  url: '/mall',
} as const

export const MALL_EMBED_CONFIG = {
  src: 'https://shop.zshai.cc/',
  cropPx: {
    bottom: 110,
    left: 241,
    right: 216,
    top: 226,
  },
  panelHeightPx: 770,
  panelWidthPx: 1367,
  minDesktopWidthPx: 1180,
} as const

export const MALL_IFRAME_SANDBOX =
  'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation allow-downloads'

export const MALL_IFRAME_ALLOW = 'clipboard-write; payment'

export function getMallIframeLayout(isMobile: boolean) {
  if (isMobile) {
    return {
      height: '100%',
      minWidth: '100%',
      transform: 'none',
      width: '100%',
    }
  }

  const horizontalCrop =
    MALL_EMBED_CONFIG.cropPx.left + MALL_EMBED_CONFIG.cropPx.right
  const verticalCrop =
    MALL_EMBED_CONFIG.cropPx.top + MALL_EMBED_CONFIG.cropPx.bottom

  return {
    height: `${MALL_EMBED_CONFIG.panelHeightPx + verticalCrop}px`,
    minWidth: `${MALL_EMBED_CONFIG.minDesktopWidthPx + horizontalCrop}px`,
    transform: `translate(-${MALL_EMBED_CONFIG.cropPx.left}px, -${MALL_EMBED_CONFIG.cropPx.top}px)`,
    width: `${MALL_EMBED_CONFIG.panelWidthPx + horizontalCrop}px`,
  }
}
