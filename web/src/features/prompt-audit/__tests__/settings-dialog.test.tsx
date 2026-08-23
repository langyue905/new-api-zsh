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

import { Window } from 'happy-dom'
import { afterAll, afterEach, describe, test } from 'vitest'

const domWindow = new Window()
const domGlobals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLButtonElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLFormElement',
  'SVGElement',
  'Node',
  'Element',
  'Event',
  'PointerEvent',
  'MouseEvent',
  'FocusEvent',
  'CustomEvent',
  'MutationObserver',
  'ResizeObserver',
  'IntersectionObserver',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
] as const

for (const key of domGlobals) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: domWindow[key],
  })
}

Object.defineProperty(domWindow.Element.prototype, 'getAnimations', {
  configurable: true,
  value: () => [],
})

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { QueryClient, QueryClientProvider } =
  await import('@tanstack/react-query')
const { api } = await import('@/lib/api')
const { PromptAuditSettingsDialog } =
  await import('../components/prompt-audit-settings-dialog')

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'zh',
  resources: {
    zh: {
      translation: {
        'Pre-request blocking': '前置拦截',
        'Asynchronous observation': '异步观察',
        Cancel: '取消',
        Save: '保存',
      },
    },
  },
})

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

type ApiMethod = (url: string, data?: unknown) => Promise<{ data: unknown }>
type MockableApi = { get: ApiMethod; put: ApiMethod; post: ApiMethod }
const apiClient = api as unknown as MockableApi
const originalGet = apiClient.get
const originalPut = apiClient.put
const originalPost = apiClient.post
let rendered:
  | {
      host: HTMLDivElement
      queryClient: InstanceType<typeof QueryClient>
      root: ReturnType<typeof createRoot>
    }
  | undefined

function installApiFixtures(
  savedPayloads: unknown[],
  cleanupRequests: string[] = [],
  fixture: { groups?: string[]; auditGroups?: string[] } = {}
) {
  apiClient.get = async (url) => {
    if (url === '/api/group') {
      return {
        data: { success: true, data: fixture.groups ?? ['default'] },
      }
    }
    if (url === '/api/prompt-audit/settings') {
      return {
        data: {
          success: true,
          data: {
            enabled: false,
            mode: 'blocking',
            model: 'deepseek-v4-flash',
            base_url: '',
            key_configured: false,
            system_prompt: 'Audit this prompt.',
            sampling_rate: 1,
            threshold: 0.9,
            timeout_seconds: 5,
            audit_groups: fixture.auditGroups ?? [],
            async_concurrency: 10,
            async_queue_size: 1000,
            allowed_retention_days: 1,
            blocked_retention_days: 7,
          },
        },
      }
    }
    throw new Error(`Unexpected GET ${url}`)
  }
  apiClient.put = async (url, data) => {
    assert.equal(url, '/api/prompt-audit/settings')
    savedPayloads.push(data)
    return new Promise(() => undefined)
  }
  apiClient.post = async (url) => {
    assert.equal(url, '/api/prompt-audit/logs/cleanup')
    cleanupRequests.push(url)
    return {
      data: {
        success: true,
        data: { allowed_deleted: 3, blocked_deleted: 2 },
      },
    }
  }
}

async function waitForSettings(): Promise<void> {
  const hasSettings = () =>
    document.querySelector('#audit-system-prompt') != null &&
    document.body.textContent?.includes('前置拦截') === true
  if (hasSettings()) return
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10))
    if (hasSettings()) return
  }
  throw new Error(`Settings did not load: ${document.body.textContent}`)
}

async function flushDialogUpdates(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function waitFor(condition: () => boolean, message: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) return
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  }
  throw new Error(message)
}

async function renderDialog(onOpenChange: (open: boolean) => void) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  rendered = { host, queryClient, root }
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <PromptAuditSettingsDialog open onOpenChange={onOpenChange} />
        </I18nextProvider>
      </QueryClientProvider>
    )
  })
  await act(waitForSettings)
}

function findButton(text: string): HTMLButtonElement {
  const button = [
    ...document.querySelectorAll<HTMLButtonElement>('button'),
  ].find((candidate) => candidate.textContent?.trim() === text)
  assert.ok(button, `Expected button "${text}"`)
  return button
}

function setInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    domWindow.HTMLInputElement.prototype,
    'value'
  )?.set
  assert.ok(valueSetter)
  valueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

afterEach(async () => {
  apiClient.get = originalGet
  apiClient.put = originalPut
  apiClient.post = originalPost
  if (rendered) {
    await act(async () => rendered?.root.unmount())
    rendered.queryClient.clear()
    rendered.host.remove()
    rendered = undefined
  }
  document.body.replaceChildren()
})

afterAll(() => domWindow.close())

describe('Prompt audit settings dialog layout', () => {
  test('keeps the footer outside the scroll viewport and above the form body', async () => {
    installApiFixtures([])
    await renderDialog(() => undefined)

    assert.equal(document.body.textContent?.includes('前置拦截'), true)
    const form = document.querySelector('[data-slot="dialog-content"] form')
    const viewport = form?.querySelector('[data-slot="scroll-area"]')
    const footer = form?.querySelector('[data-slot="dialog-footer"]')
    assert.ok(form)
    assert.ok(viewport)
    assert.ok(footer)
    assert.equal(viewport.contains(footer), false)
    assert.equal(form.classList.contains('grid'), true)
    assert.equal(viewport.classList.contains('min-h-0'), true)
    assert.equal(footer.classList.contains('z-10'), true)
    await flushDialogUpdates()
  })

  test('cancel closes the dialog without focusing the system prompt', async () => {
    const openChanges: boolean[] = []
    installApiFixtures([])
    await renderDialog((open) => openChanges.push(open))
    const prompt = document.querySelector<HTMLTextAreaElement>(
      '#audit-system-prompt'
    )
    assert.ok(prompt)

    await act(async () => findButton('取消').click())

    assert.deepEqual(openChanges, [false])
    assert.notEqual(document.activeElement, prompt)
    await flushDialogUpdates()
  })

  test('save still submits the current form', async () => {
    const savedPayloads: unknown[] = []
    installApiFixtures(savedPayloads)
    await renderDialog(() => undefined)

    const form = document.querySelector<HTMLFormElement>(
      '[data-slot="dialog-content"] form'
    )
    assert.ok(form)
    await act(async () => {
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true })
      )
    })
    await act(async () => {
      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(
          () => reject(new Error('Settings were not submitted')),
          1500
        )
        const check = () => {
          if (savedPayloads.length === 0) return setTimeout(check, 0)
          clearTimeout(timeoutId)
          resolve()
        }
        check()
      })
    })

    assert.equal(savedPayloads.length, 1)
    assert.equal(
      (savedPayloads[0] as { sampling_rate: number }).sampling_rate,
      1
    )
    await flushDialogUpdates()
  })

  test('keeps removed selected groups visible until they are deselected and saved', async () => {
    const savedPayloads: unknown[] = []
    installApiFixtures(savedPayloads, [], {
      groups: ['default', 'available'],
      auditGroups: ['default', 'deleted-one', 'deleted-two'],
    })
    await renderDialog(() => undefined)

    const firstRemoved = document.querySelector<HTMLInputElement>(
      '#audit-group-deleted-one'
    )
    const secondRemoved = document.querySelector<HTMLInputElement>(
      '#audit-group-deleted-two'
    )
    assert.ok(firstRemoved)
    assert.ok(secondRemoved)
    await waitFor(
      () => firstRemoved.checked && secondRemoved.checked,
      'Removed audit groups did not retain their saved selection'
    )
    assert.equal(firstRemoved.checked, true)
    assert.equal(secondRemoved.checked, true)
    assert.equal(
      document.querySelectorAll('[data-testid="removed-audit-group"]').length,
      2
    )
    assert.equal(
      document.body.textContent?.includes('This group has been removed'),
      true
    )

    await act(async () =>
      firstRemoved.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    )
    assert.ok(document.querySelector('#audit-group-deleted-one'))
    assert.equal(firstRemoved.checked, false)
    assert.equal(secondRemoved.checked, true)

    await act(async () =>
      secondRemoved.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    )
    const form = document.querySelector<HTMLFormElement>(
      '[data-slot="dialog-content"] form'
    )
    assert.ok(form)
    await act(async () => {
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true })
      )
    })
    await waitFor(
      () => savedPayloads.length > 0,
      'Settings without removed groups were not submitted'
    )

    assert.deepEqual(
      (savedPayloads[0] as { audit_groups: string[] }).audit_groups,
      ['default']
    )
  })

  test('shows sampling rate help and submits the current decimal value', async () => {
    const savedPayloads: unknown[] = []
    installApiFixtures(savedPayloads)
    await renderDialog(() => undefined)
    const samplingInput = document.querySelector<HTMLInputElement>(
      '#audit-sampling-rate'
    )
    assert.ok(samplingInput)
    assert.equal(samplingInput.step, '0.01')
    assert.equal(
      document.body.textContent?.includes(
        '0.2 audits approximately 20% of requests; 1 audits all requests.'
      ),
      true
    )
    await act(async () => setInputValue(samplingInput, '0.2'))

    const form = document.querySelector<HTMLFormElement>(
      '[data-slot="dialog-content"] form'
    )
    assert.ok(form)
    await act(async () => {
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true })
      )
    })
    await waitFor(
      () => savedPayloads.length > 0,
      'Sampling-rate settings were not submitted'
    )

    assert.equal(
      (savedPayloads[0] as { sampling_rate: number }).sampling_rate,
      0.2
    )
  })

  test('manual cleanup confirms saved retention and refreshes the log query', async () => {
    const cleanupRequests: string[] = []
    installApiFixtures([], cleanupRequests)
    await renderDialog(() => undefined)
    rendered?.queryClient.setQueryData(['prompt-audit-logs', 'active'], {
      items: [],
    })
    const allowedRetention = document.querySelector<HTMLInputElement>(
      '#audit-allowed-retention'
    )
    assert.ok(allowedRetention)
    await act(async () => setInputValue(allowedRetention, '30'))

    await act(async () => findButton('Clean Up Logs Now').click())

    const confirmation = document.querySelector(
      '[data-slot="alert-dialog-content"]'
    )
    assert.ok(confirmation)
    assert.equal(
      confirmation.textContent?.includes(
        'Saved retention: allowed 1 days, blocked 7 days.'
      ),
      true
    )
    assert.equal(
      confirmation.textContent?.includes(
        'Unsaved changes in this form will not be used.'
      ),
      true
    )
    assert.equal(confirmation.textContent?.includes('allowed 30 days'), false)

    await act(async () => findButton('Confirm Cleanup').click())
    await waitFor(
      () => cleanupRequests.length > 0,
      'Prompt audit cleanup was not submitted'
    )

    assert.deepEqual(cleanupRequests, ['/api/prompt-audit/logs/cleanup'])
    assert.equal(
      document.body.textContent?.includes(
        'Cleanup complete: 3 allowed logs and 2 blocked logs deleted.'
      ),
      true
    )
    assert.equal(
      rendered?.queryClient.getQueryState(['prompt-audit-logs', 'active'])
        ?.isInvalidated,
      true
    )
  })

  test('cleanup failure keeps settings and confirmation open with an error', async () => {
    installApiFixtures([])
    apiClient.post = async () => {
      throw new Error('cleanup failed')
    }
    await renderDialog(() => undefined)
    await act(async () => findButton('Clean Up Logs Now').click())
    await act(async () => findButton('Confirm Cleanup').click())
    await waitFor(
      () => document.body.textContent?.includes('cleanup failed') === true,
      'Cleanup failure was not displayed'
    )

    assert.ok(document.querySelector('[data-slot="dialog-content"]'))
    assert.ok(document.querySelector('[data-slot="alert-dialog-content"]'))
    assert.equal(document.body.textContent?.includes('cleanup failed'), true)
  })
})
