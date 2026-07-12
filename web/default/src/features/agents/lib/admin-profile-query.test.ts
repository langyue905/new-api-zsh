import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { buildAdminAgentProfilesQuery } from './admin-profile-query.ts'

describe('admin agent profile query', () => {
  test('includes pagination and a trimmed keyword', () => {
    assert.equal(
      buildAdminAgentProfilesQuery({
        page: 2,
        pageSize: 20,
        keyword: '  alice@example.com  ',
      }),
      'p=2&page_size=20&keyword=alice%40example.com'
    )
  })

  test('omits blank keyword', () => {
    assert.equal(
      buildAdminAgentProfilesQuery({ page: 1, pageSize: 50, keyword: '  ' }),
      'p=1&page_size=50'
    )
  })
})
