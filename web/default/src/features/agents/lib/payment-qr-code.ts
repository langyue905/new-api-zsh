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
export const PAYMENT_QR_CODE_MAX_LENGTH = 60000
export const PAYMENT_QR_CODE_INPUT_MAX_BYTES = 5 * 1024 * 1024

const paymentQRCodeDimensions = [512, 384, 320, 256, 192]

export function isPaymentQRCodeWithinLimit(dataUrl: string): boolean {
  return dataUrl.length <= PAYMENT_QR_CODE_MAX_LENGTH
}

export function fitPaymentQRCodeImageSize(
  width: number,
  height: number,
  maxDimension: number
): { width: number; height: number } {
  if (width <= 0 || height <= 0 || maxDimension <= 0) {
    return { width: 1, height: 1 }
  }
  const scale = Math.min(1, maxDimension / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result || '')))
    reader.addEventListener('error', () => reject(reader.error))
    reader.readAsDataURL(file)
  })
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', () =>
      reject(new Error('failed to load payment QR code'))
    )
    image.src = dataUrl
  })
}

function drawPaymentQRCodeImage(
  image: HTMLImageElement,
  maxDimension: number
): HTMLCanvasElement {
  const size = fitPaymentQRCodeImageSize(
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
    maxDimension
  )
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('failed to prepare payment QR code')
  }
  context.imageSmoothingEnabled = false
  context.drawImage(image, 0, 0, size.width, size.height)
  return canvas
}

function getPaymentQRCodeCandidates(canvas: HTMLCanvasElement): string[] {
  const png = canvas.toDataURL('image/png')
  const webp = canvas.toDataURL('image/webp', 0.92)
  const jpeg = canvas.toDataURL('image/jpeg', 0.88)
  return [...new Set([png, webp, jpeg])]
}

export async function preparePaymentQRCodeDataUrl(file: File): Promise<string> {
  const original = await readFileAsDataUrl(file)
  if (isPaymentQRCodeWithinLimit(original)) {
    return original
  }

  const image = await loadImage(original)
  for (const maxDimension of paymentQRCodeDimensions) {
    const canvas = drawPaymentQRCodeImage(image, maxDimension)
    const accepted = getPaymentQRCodeCandidates(canvas).find(
      isPaymentQRCodeWithinLimit
    )
    if (accepted) {
      return accepted
    }
  }

  throw new Error('payment QR code image is too large')
}
