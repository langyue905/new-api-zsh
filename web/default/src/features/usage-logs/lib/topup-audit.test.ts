import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { isAgentBalanceActionLogContent } from './topup-audit.ts'

describe('top-up audit log helpers', () => {
  test('detects legacy agent balance action logs', () => {
    assert.equal(
      isAgentBalanceActionLogContent('代理佣金划转到余额 $11.476822 额度'),
      true
    )
    assert.equal(isAgentBalanceActionLogContent('代理申请提现 $10'), true)
    assert.equal(isAgentBalanceActionLogContent('使用在线充值成功'), false)
    assert.equal(isAgentBalanceActionLogContent(''), false)
  })
})
