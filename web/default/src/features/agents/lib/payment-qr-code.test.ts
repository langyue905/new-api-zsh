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
