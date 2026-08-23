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
import { Settings } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'

import { PromptAuditDetailDialog } from './components/prompt-audit-detail-dialog'
import { PromptAuditReasonDialog } from './components/prompt-audit-reason-dialog'
import { PromptAuditSettingsDialog } from './components/prompt-audit-settings-dialog'
import { PromptAuditTable } from './components/prompt-audit-table'

export function PromptAudit() {
  const { t } = useTranslation()
  const [promptLogId, setPromptLogId] = useState<number | null>(null)
  const [reasonLogId, setReasonLogId] = useState<number | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const openPrompt = useCallback((id: number) => setPromptLogId(id), [])
  const openReason = useCallback((id: number) => setReasonLogId(id), [])

  return (
    <>
      <SectionPageLayout fixedContent>
        <SectionPageLayout.Title>
          {t('Prompt Audit Logs')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <Button variant='outline' onClick={() => setSettingsOpen(true)}>
            <Settings data-icon='inline-start' />
            {t('Settings')}
          </Button>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <PromptAuditTable
            onViewPrompt={openPrompt}
            onViewReason={openReason}
          />
        </SectionPageLayout.Content>
      </SectionPageLayout>
      <PromptAuditDetailDialog
        logId={promptLogId}
        onOpenChange={(open) => !open && setPromptLogId(null)}
      />
      <PromptAuditReasonDialog
        logId={reasonLogId}
        onOpenChange={(open) => !open && setReasonLogId(null)}
      />
      <PromptAuditSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </>
  )
}
