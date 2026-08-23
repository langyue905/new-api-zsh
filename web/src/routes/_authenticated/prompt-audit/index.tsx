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
import { createFileRoute, redirect } from '@tanstack/react-router'
import z from 'zod'

import { PromptAudit } from '@/features/prompt-audit'
import { canAccessPromptAudit } from '@/features/prompt-audit/lib'
import { useAuthStore } from '@/stores/auth-store'

const promptAuditSearchSchema = z.object({
  page: z.number().int().min(1).optional().catch(1),
  pageSize: z.number().int().min(1).max(100).optional().catch(undefined),
  action: z.enum(['allowed', 'blocked']).optional().catch(undefined),
  userId: z.string().optional().catch(''),
  startTime: z.number().int().nonnegative().optional().catch(undefined),
  endTime: z.number().int().nonnegative().optional().catch(undefined),
})

export const Route = createFileRoute('/_authenticated/prompt-audit/')({
  beforeLoad: () => {
    if (!canAccessPromptAudit(useAuthStore.getState().auth.user?.role)) {
      throw redirect({ to: '/403' })
    }
  },
  validateSearch: promptAuditSearchSchema,
  component: PromptAudit,
})
