import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { isExternalHref } from './url-utils.ts'

describe('layout URL utilities', () => {
  test('detects absolute web URLs as external links', () => {
    assert.equal(isExternalHref('https://pay.ldxp.cn/shop/baixiaosheng'), true)
    assert.equal(isExternalHref('http://example.com/shop'), true)
    assert.equal(isExternalHref('/wallet'), false)
    assert.equal(isExternalHref('mailto:support@example.com'), false)
  })
})
