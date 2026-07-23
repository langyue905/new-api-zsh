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
import { describe, test } from 'node:test'

import {
  PAYMENT_QR_CODE_MAX_LENGTH,
  fitPaymentQRCodeImageSize,
  isPaymentQRCodeImageDataUrl,
  isPaymentQRCodeWithinLimit,
} from './payment-qr-code.ts'

describe('agent payment QR code helpers', () => {
  test('checks data URL length against the backend storage limit', () => {
    assert.equal(
      isPaymentQRCodeWithinLimit('x'.repeat(PAYMENT_QR_CODE_MAX_LENGTH)),
      true
    )
    assert.equal(
      isPaymentQRCodeWithinLimit('x'.repeat(PAYMENT_QR_CODE_MAX_LENGTH + 1)),
      false
    )
  })

  test('fits QR code images inside a square without upscaling', () => {
    assert.deepEqual(fitPaymentQRCodeImageSize(1200, 600, 512), {
      width: 512,
      height: 256,
    })
    assert.deepEqual(fitPaymentQRCodeImageSize(200, 100, 512), {
      width: 200,
      height: 100,
    })
  })

  test('detects previewable QR code image data URLs', () => {
    assert.equal(isPaymentQRCodeImageDataUrl('data:image/png;base64,abc'), true)
    assert.equal(
      isPaymentQRCodeImageDataUrl('data:image/jpeg;base64,abc'),
      true
    )
    assert.equal(
      isPaymentQRCodeImageDataUrl('data:text/plain;base64,abc'),
      false
    )
    assert.equal(isPaymentQRCodeImageDataUrl(''), false)
  })
})
