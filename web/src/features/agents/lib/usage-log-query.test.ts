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
*/
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  AGENT_RECORDS_DEFAULT_PAGE_SIZE,
  buildAgentUsageLogsQuery,
} from './usage-log-query.ts'

describe('agent usage log query', () => {
  test('uses a wider default page size for agent record tables', () => {
    assert.equal(AGENT_RECORDS_DEFAULT_PAGE_SIZE, 50)
    assert.equal(buildAgentUsageLogsQuery({ page: 1 }), 'p=1&page_size=50')
  })

  test('includes pagination parameters', () => {
    assert.equal(
      buildAgentUsageLogsQuery({ page: 3, pageSize: 20 }),
      'p=3&page_size=20'
    )
  })
})
