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

  test('omits legacy profile scope', () => {
    const options = { page: 1, pageSize: 20, scope: 'all' }

    assert.equal(buildAdminAgentProfilesQuery(options), 'p=1&page_size=20')
  })

  test('omits blank keyword', () => {
    assert.equal(
      buildAdminAgentProfilesQuery({ page: 1, pageSize: 50, keyword: '  ' }),
      'p=1&page_size=50'
    )
  })
})
