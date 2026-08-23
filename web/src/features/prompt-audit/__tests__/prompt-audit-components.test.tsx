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
import type { ReactNode } from 'react'
import { afterAll, afterEach, describe, test, vi } from 'vitest'

const domWindow = new Window()
const domGlobals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLButtonElement',
  'HTMLInputElement',
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

type RouteSearch = {
  page?: number
  pageSize?: number
  action?: 'allowed' | 'blocked'
  userId?: string
  startTime?: number
  endTime?: number
}

let routeSearch: RouteSearch = {}
const navigateCalls: unknown[] = []
const navigate = (options: unknown) => {
  navigateCalls.push(options)
}

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useSearch: () => routeSearch,
    useNavigate: () => navigate,
  }),
}))

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { QueryClient, QueryClientProvider } =
  await import('@tanstack/react-query')
const { api } = await import('@/lib/api')
const { PromptAuditTable } = await import('../components/prompt-audit-table')
const { PromptAuditDetailDialog } =
  await import('../components/prompt-audit-detail-dialog')
const { PromptAuditReasonDialog } =
  await import('../components/prompt-audit-reason-dialog')

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

type ApiGet = (
  url: string,
  config?: unknown
) => Promise<{ data: Record<string, unknown> }>
const apiClient = api as unknown as { get: ApiGet }
type ApiDelete = (url: string) => Promise<{ data: Record<string, unknown> }>
const apiDeleteClient = api as unknown as { delete: ApiDelete }
const originalGet = apiClient.get
const originalDelete = apiDeleteClient.delete
let rendered:
  | {
      host: HTMLDivElement
      queryClient: InstanceType<typeof QueryClient>
      root: ReturnType<typeof createRoot>
    }
  | undefined

async function renderWithProviders(node: ReactNode) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  rendered = { host, queryClient, root }
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>{node}</I18nextProvider>
      </QueryClientProvider>
    )
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

async function flushUpdates() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
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

async function renderTable(
  search: RouteSearch,
  options?: {
    items?: Array<Record<string, unknown>>
    onViewPrompt?: (id: number) => void
    onViewReason?: (id: number) => void
  }
) {
  routeSearch = search
  const requests: Array<{ url: string; config?: unknown }> = []
  apiClient.get = async (url, config) => {
    requests.push({ url, config })
    await new Promise((resolve) => setTimeout(resolve, 10))
    return {
      data: {
        success: true,
        data: {
          items: options?.items ?? [],
          total: options?.items?.length ?? 0,
          page: search.page ?? 1,
          page_size: 20,
        },
      },
    }
  }
  await renderWithProviders(
    <PromptAuditTable
      onViewPrompt={options?.onViewPrompt ?? (() => undefined)}
      onViewReason={options?.onViewReason ?? (() => undefined)}
    />
  )
  if (
    search.startTime != null &&
    search.endTime != null &&
    search.startTime <= search.endTime
  ) {
    await waitFor(
      () => requests.length === 1 && !findButton('Search').disabled,
      'Initial audit log request did not finish'
    )
  }
  return requests
}

afterEach(async () => {
  apiClient.get = originalGet
  apiDeleteClient.delete = originalDelete
  navigateCalls.length = 0
  if (rendered) {
    await flushUpdates()
    await act(async () => rendered?.root.unmount())
    rendered.queryClient.clear()
    rendered.host.remove()
    rendered = undefined
  }
  document.body.replaceChildren()
})

afterAll(() => {
  vi.restoreAllMocks()
  domWindow.close()
})

describe('Prompt audit table committed searches', () => {
  test('shows an accessible error and does not submit a cleared date', async () => {
    const requests = await renderTable({ startTime: 1, endTime: 2, page: 1 })
    const picker = [
      ...document.querySelectorAll<HTMLButtonElement>('button'),
    ].find((button) => button.textContent?.includes('~'))
    assert.ok(picker)
    await act(async () => picker.click())
    const dateInputs = [
      ...document.querySelectorAll<HTMLInputElement>(
        'input[type="datetime-local"]'
      ),
    ]
    assert.equal(dateInputs.length, 2)
    assert.equal(
      document.querySelector(`label[for="${dateInputs[0].id}"]`)?.textContent,
      'Start Time'
    )
    assert.equal(
      document.querySelector(`label[for="${dateInputs[1].id}"]`)?.textContent,
      'End Time'
    )
    assert.notEqual(dateInputs[0].id, dateInputs[1].id)
    await act(async () => {
      setInputValue(dateInputs[0], '')
    })
    await act(async () => findButton('Confirm').click())
    await act(async () => findButton('Search').click())
    await flushUpdates()

    const alert = document.querySelector('[role="alert"]')
    assert.equal(alert?.textContent, 'Start and end time are required')
    assert.equal(requests.length, 1)
    assert.equal(navigateCalls.length, 0)
  })

  test('refetches without navigation when first-page filters are unchanged', async () => {
    const requests = await renderTable({ startTime: 1, endTime: 2, page: 1 })

    await act(async () => {
      findButton('Search').click()
      await new Promise((resolve) => setTimeout(resolve, 30))
    })

    assert.equal(requests.length, 2)
    assert.equal(navigateCalls.length, 0)
  })

  test('navigates without refetching the old key when a draft changes', async () => {
    const requests = await renderTable({ startTime: 1, endTime: 2, page: 1 })
    const userInput = document.querySelector<HTMLInputElement>(
      'input[placeholder="Filter by User ID..."]'
    )
    assert.ok(userInput)
    await act(async () => {
      setInputValue(userInput, '42')
    })

    await act(async () => findButton('Search').click())

    assert.equal(navigateCalls.length, 1)
    assert.equal(requests.length, 1)
  })

  test('returns to page one without refetching the old page', async () => {
    const requests = await renderTable({ startTime: 1, endTime: 2, page: 2 })

    await act(async () => findButton('Search').click())

    assert.equal(navigateCalls.length, 1)
    assert.equal(requests.length, 1)
  })

  test('does not request logs for a reversed URL date range', async () => {
    const requests = await renderTable({ startTime: 2, endTime: 1, page: 1 })

    assert.equal(requests.length, 0)
    assert.equal(
      document.body.textContent?.includes('Start time must be before end time'),
      true
    )
    assert.equal(
      document.querySelector('[role="alert"]')?.textContent,
      'Start time must be before end time'
    )
  })

  test('does not turn a one-sided URL date into an open range', async () => {
    const requests = await renderTable({ startTime: 1, page: 1 })

    assert.equal(requests.length, 0)
    assert.equal(
      document.body.textContent?.includes('Start and end time are required'),
      true
    )
    assert.equal(
      document.querySelector('[role="alert"]')?.textContent,
      'Start and end time are required'
    )
  })
})

describe('Prompt audit table detail actions', () => {
  const baseItem = {
    id: 17,
    created_at: 1,
    action: 'allowed',
    confidence: 0.1,
    user_id: 42,
    username: 'tester',
    group: 'default',
    model: 'model',
    prompt_summary: 'prompt summary',
    duration_ms: 3,
    mode: 'blocking',
    actually_blocked: false,
    request_id: 'request',
  }

  test('opens reason detail from every non-empty reason summary', async () => {
    const viewedReasons: number[] = []
    await renderTable(
      { startTime: 1, endTime: 2, page: 1 },
      {
        items: [{ ...baseItem, reason_summary: 'full reason starts here' }],
        onViewReason: (id) => viewedReasons.push(id),
      }
    )

    await act(async () => findButton('full reason starts here').click())

    assert.deepEqual(viewedReasons, [17])
  })

  test('renders an empty reason as non-interactive dash', async () => {
    await renderTable(
      { startTime: 1, endTime: 2, page: 1 },
      { items: [{ ...baseItem, reason_summary: '' }] }
    )

    assert.equal(
      [...document.querySelectorAll('button')].some(
        (button) => button.textContent?.trim() === '—'
      ),
      false
    )
    assert.equal(document.body.textContent?.includes('—'), true)
  })
})

describe('Prompt audit detail containment', () => {
  test('shows and copies the current request ID above the full prompt', async () => {
    const prompt = 'x'.repeat(500)
    const requestId = 'r'.repeat(300)
    const clipboardWrites: string[] = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => clipboardWrites.push(value),
      },
    })
    apiClient.get = async () => ({
      data: {
        success: true,
        data: {
          id: 7,
          created_at: 1,
          action: 'blocked',
          confidence: 1,
          user_id: 42,
          username: 'tester',
          group: 'default',
          model: 'model',
          prompt,
          reason: 'reason',
          duration_ms: 3,
          mode: 'blocking',
          actually_blocked: true,
          request_id: requestId,
          audit_model_output: `\n\`\`\`json\n${'y'.repeat(500)}\n\`\`\`\n`,
          cache_source_request_id: '',
          cache_source_reason: '',
        },
      },
    })
    await renderWithProviders(
      <PromptAuditDetailDialog logId={7} onOpenChange={() => undefined} />
    )
    await waitFor(
      () => document.querySelector('pre')?.textContent === prompt,
      'Prompt detail did not load'
    )

    const dialog = document.querySelector('[data-slot="dialog-content"]')
    assert.ok(dialog)
    assert.equal(dialog.querySelectorAll('[data-slot="scroll-area"]').length, 1)
    const requestIdBlock = dialog.querySelector(
      '[data-testid="prompt-request-id"]'
    )
    assert.equal(requestIdBlock?.textContent, requestId)
    for (const className of [
      'w-full',
      'min-w-0',
      'max-w-full',
      'overflow-x-hidden',
      '[overflow-wrap:anywhere]',
    ]) {
      assert.equal(requestIdBlock?.classList.contains(className), true)
    }
    await act(async () => findButton('Copy Request ID').click())
    assert.deepEqual(clipboardWrites, [requestId])

    const promptBlock = dialog.querySelector('pre')
    assert.ok(promptBlock)
    for (const className of [
      'w-full',
      'min-w-0',
      'max-w-full',
      'overflow-x-hidden',
      '[overflow-wrap:anywhere]',
    ]) {
      assert.equal(promptBlock.classList.contains(className), true)
    }

    assert.equal(dialog.textContent?.includes('Reason'), false)
    assert.equal(dialog.textContent?.includes('Audit Model Result'), false)
    assert.equal(dialog.querySelectorAll('[data-slot="scroll-area"]').length, 1)
  })

  test('shows a dash and disables request ID copying when the ID is empty', async () => {
    apiClient.get = async () => ({
      data: {
        success: true,
        data: {
          id: 8,
          created_at: 1,
          action: 'allowed',
          confidence: 0.1,
          user_id: 42,
          username: 'tester',
          group: 'default',
          model: 'model',
          prompt: 'prompt',
          reason: '',
          duration_ms: 3,
          mode: 'blocking',
          actually_blocked: false,
          request_id: '',
          audit_model_output: '',
          cache_source_request_id: '',
          cache_source_reason: '',
        },
      },
    })
    await renderWithProviders(
      <PromptAuditDetailDialog logId={8} onOpenChange={() => undefined} />
    )
    await waitFor(
      () => document.querySelector('[data-testid="prompt-request-id"]') != null,
      'Prompt request ID did not load'
    )

    assert.equal(
      document.querySelector('[data-testid="prompt-request-id"]')?.textContent,
      '—'
    )
    assert.equal(findButton('Copy Request ID').disabled, true)
  })
})

describe('Prompt audit reason detail', () => {
  test('contains and copies a long reason and expands the raw model result', async () => {
    const reason = 'z'.repeat(500)
    const auditModelOutput = `\n\`\`\`json\n${'y'.repeat(500)}\n\`\`\`\n`
    const clipboardWrites: string[] = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => clipboardWrites.push(value),
      },
    })
    apiClient.get = async () => ({
      data: {
        success: true,
        data: {
          id: 9,
          created_at: 1,
          action: 'blocked',
          confidence: 1,
          user_id: 42,
          username: 'tester',
          group: 'default',
          model: 'model',
          prompt: 'prompt',
          reason,
          duration_ms: 3,
          mode: 'blocking',
          actually_blocked: true,
          request_id: 'request',
          audit_model_output: auditModelOutput,
          cache_source_request_id: '',
          cache_source_reason: '',
        },
      },
    })
    await renderWithProviders(
      <PromptAuditReasonDialog logId={9} onOpenChange={() => undefined} />
    )
    await waitFor(
      () => document.querySelector('[data-testid="reason-content"]') != null,
      'Reason detail did not load'
    )

    const dialog = document.querySelector('[data-slot="dialog-content"]')
    assert.ok(dialog)
    assert.equal(dialog.querySelectorAll('[data-slot="scroll-area"]').length, 1)
    const reasonBlock = dialog.querySelector('[data-testid="reason-content"]')
    assert.equal(reasonBlock?.textContent, reason)
    for (const className of [
      'w-full',
      'min-w-0',
      'max-w-full',
      'overflow-x-hidden',
      '[overflow-wrap:anywhere]',
    ]) {
      assert.equal(reasonBlock?.classList.contains(className), true)
    }

    await act(async () => findButton('Copy Reason').click())
    assert.deepEqual(clipboardWrites, [reason])

    const outputButton = findButton('Audit Model Result')
    assert.equal(outputButton.getAttribute('aria-expanded'), 'false')
    await act(async () => outputButton.click())
    assert.equal(outputButton.getAttribute('aria-expanded'), 'true')
    const outputBlock = dialog.querySelector(
      '[data-testid="audit-model-output"]'
    )
    assert.equal(outputBlock?.textContent, auditModelOutput)
    for (const className of [
      'w-full',
      'min-w-0',
      'max-w-full',
      'overflow-x-hidden',
      '[overflow-wrap:anywhere]',
    ]) {
      assert.equal(outputBlock?.classList.contains(className), true)
    }
  })

  test('shows an empty state when the reason has no raw model result', async () => {
    apiClient.get = async () => ({
      data: {
        success: true,
        data: {
          id: 10,
          created_at: 1,
          action: 'allowed',
          confidence: null,
          user_id: 42,
          username: 'tester',
          group: 'default',
          model: 'model',
          prompt: 'prompt',
          reason: 'network failure',
          duration_ms: 3,
          mode: 'blocking',
          actually_blocked: false,
          request_id: 'request',
          audit_model_output: '',
          cache_source_request_id: '',
          cache_source_reason: '',
        },
      },
    })
    await renderWithProviders(
      <PromptAuditReasonDialog logId={10} onOpenChange={() => undefined} />
    )
    await waitFor(
      () => document.body.textContent?.includes('Audit Model Result') === true,
      'Audit model result trigger did not load'
    )

    await act(async () => findButton('Audit Model Result').click())

    assert.equal(
      document.body.textContent?.includes('No audit model result available.'),
      true
    )
    assert.equal(
      document.body.textContent?.includes('Historical Allow Reason'),
      false
    )
  })

  test('shows the cache source request and full historical reason by default', async () => {
    const sourceRequestId = 'source-'.repeat(60)
    const sourceReason = 'historical reason '.repeat(40)
    const clipboardWrites: string[] = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => clipboardWrites.push(value),
      },
    })
    apiClient.get = async () => ({
      data: {
        success: true,
        data: {
          id: 11,
          created_at: 1,
          action: 'allowed',
          confidence: null,
          user_id: 42,
          username: 'tester',
          group: 'default',
          model: 'model',
          prompt: 'prompt',
          reason: 'Conversation allow cache hit',
          duration_ms: 3,
          mode: 'blocking',
          actually_blocked: false,
          request_id: 'current-request',
          audit_model_output: '',
          cache_source_request_id: sourceRequestId,
          cache_source_reason: sourceReason,
        },
      },
    })
    await renderWithProviders(
      <PromptAuditReasonDialog logId={11} onOpenChange={() => undefined} />
    )
    await waitFor(
      () =>
        document.querySelector('[data-testid="cache-source-reason"]') != null,
      'Historical allow reason did not load'
    )

    const historyButton = findButton('Historical Allow Reason')
    assert.equal(historyButton.getAttribute('aria-expanded'), 'true')
    const sourceRequestBlock = document.querySelector(
      '[data-testid="cache-source-request-id"]'
    )
    const sourceReasonBlock = document.querySelector(
      '[data-testid="cache-source-reason"]'
    )
    assert.equal(sourceRequestBlock?.textContent, sourceRequestId)
    assert.equal(sourceReasonBlock?.textContent, sourceReason)
    for (const block of [sourceRequestBlock, sourceReasonBlock]) {
      for (const className of [
        'w-full',
        'min-w-0',
        'max-w-full',
        'overflow-x-hidden',
        '[overflow-wrap:anywhere]',
      ]) {
        assert.equal(block?.classList.contains(className), true)
      }
    }

    await act(async () => findButton('Copy Source Request ID').click())
    assert.deepEqual(clipboardWrites, [sourceRequestId])
  })

  test('shows an explicit empty state when cache source reason is empty', async () => {
    apiClient.get = async () => ({
      data: {
        success: true,
        data: {
          id: 12,
          created_at: 1,
          action: 'allowed',
          confidence: null,
          user_id: 42,
          username: 'tester',
          group: 'default',
          model: 'model',
          prompt: 'prompt',
          reason: 'Conversation allow cache hit',
          duration_ms: 3,
          mode: 'blocking',
          actually_blocked: false,
          request_id: 'current-request',
          audit_model_output: '',
          cache_source_request_id: 'source-request',
          cache_source_reason: '',
        },
      },
    })
    await renderWithProviders(
      <PromptAuditReasonDialog logId={12} onOpenChange={() => undefined} />
    )
    await waitFor(
      () =>
        document.body.textContent?.includes('Historical Allow Reason') === true,
      'Historical allow reason did not load'
    )

    assert.equal(
      document.body.textContent?.includes(
        'No historical allow reason available.'
      ),
      true
    )
  })

  test('shows unavailable history for a legacy cache-hit log without source metadata', async () => {
    apiClient.get = async () => ({
      data: {
        success: true,
        data: {
          id: 13,
          created_at: 1,
          action: 'allowed',
          confidence: null,
          user_id: 42,
          username: 'tester',
          group: 'default',
          model: 'model',
          prompt: 'prompt',
          reason: '命中对话放行缓存',
          duration_ms: 3,
          mode: 'blocking',
          actually_blocked: false,
          request_id: 'current-request',
          audit_model_output: '',
          cache_source_request_id: '',
          cache_source_reason: '',
        },
      },
    })
    await renderWithProviders(
      <PromptAuditReasonDialog logId={13} onOpenChange={() => undefined} />
    )
    await waitFor(
      () =>
        document.body.textContent?.includes('Historical Allow Reason') === true,
      'Historical allow reason did not load'
    )

    assert.equal(
      document.body.textContent?.includes(
        'No historical allow reason available.'
      ),
      true
    )
    assert.equal(
      document.querySelector('[data-testid="cache-source-request-id"]')
        ?.textContent,
      '—'
    )
    assert.equal(findButton('Copy Source Request ID').disabled, true)
  })

  test('does not treat a real audit with the cache marker reason as a cache hit', async () => {
    apiClient.get = async () => ({
      data: {
        success: true,
        data: {
          id: 14,
          created_at: 1,
          action: 'allowed',
          confidence: 0.1,
          user_id: 42,
          username: 'tester',
          group: 'default',
          model: 'model',
          prompt: 'prompt',
          reason: '命中对话放行缓存',
          duration_ms: 3,
          mode: 'blocking',
          actually_blocked: false,
          request_id: 'current-request',
          audit_model_output: '',
          cache_source_request_id: '',
          cache_source_reason: '',
        },
      },
    })
    await renderWithProviders(
      <PromptAuditReasonDialog logId={14} onOpenChange={() => undefined} />
    )
    await waitFor(
      () => document.body.textContent?.includes('命中对话放行缓存') === true,
      'Audit reason did not load'
    )

    assert.equal(
      document.body.textContent?.includes('Historical Allow Reason'),
      false
    )
  })

  test('shows the immutable block source request and full historical block reason by default', async () => {
    const sourceRequestId = 'blocked-source-'.repeat(40)
    const sourceReason = 'full historical blocked reason '.repeat(30)
    const clipboardWrites: string[] = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => clipboardWrites.push(value),
      },
    })
    apiClient.get = async () => ({
      data: {
        success: true,
        data: {
          id: 141,
          created_at: 1,
          action: 'blocked',
          confidence: null,
          user_id: 42,
          username: 'tester',
          group: 'default',
          model: 'model',
          prompt: 'danger',
          reason: '命中已拦截对话',
          duration_ms: 3,
          mode: 'blocking',
          actually_blocked: true,
          request_id: 'current-request',
          audit_model_output: '',
          cache_source_request_id: '',
          cache_source_reason: '',
          block_source_request_id: sourceRequestId,
          block_source_reason: sourceReason,
          conversation_blocked: true,
        },
      },
    })

    await renderWithProviders(
      <PromptAuditReasonDialog logId={141} onOpenChange={() => undefined} />
    )
    await waitFor(
      () =>
        document.querySelector('[data-testid="block-source-reason"]') != null,
      'Historical block reason did not load'
    )

    const historyButton = findButton('Historical Block Reason')
    assert.equal(historyButton.getAttribute('aria-expanded'), 'true')
    assert.equal(
      document.querySelector('[data-testid="block-source-request-id"]')
        ?.textContent,
      sourceRequestId
    )
    const sourceReasonBlock = document.querySelector(
      '[data-testid="block-source-reason"]'
    )
    assert.equal(sourceReasonBlock?.textContent, sourceReason)
    assert.equal(
      sourceReasonBlock?.classList.contains('overflow-x-hidden'),
      true
    )
    assert.equal(
      sourceReasonBlock?.classList.contains('[overflow-wrap:anywhere]'),
      true
    )

    await act(async () => findButton('Copy Block Source Request ID').click())
    assert.deepEqual(clipboardWrites, [sourceRequestId])
  })

  test('shows unavailable history for a legacy permanent-block hit without a source snapshot', async () => {
    apiClient.get = async () => ({
      data: {
        success: true,
        data: {
          id: 142,
          created_at: 1,
          action: 'blocked',
          confidence: null,
          user_id: 42,
          username: 'tester',
          group: 'default',
          model: 'model',
          prompt: 'danger',
          reason: '命中已拦截对话',
          duration_ms: 3,
          mode: 'blocking',
          actually_blocked: true,
          request_id: 'current-request',
          audit_model_output: '',
          cache_source_request_id: '',
          cache_source_reason: '',
          block_source_request_id: '',
          block_source_reason: '',
          conversation_blocked: false,
        },
      },
    })

    await renderWithProviders(
      <PromptAuditReasonDialog logId={142} onOpenChange={() => undefined} />
    )
    await waitFor(
      () =>
        document.body.textContent?.includes('Historical Block Reason') === true,
      'Legacy block history did not load'
    )

    assert.equal(
      document.body.textContent?.includes(
        'No historical block reason available.'
      ),
      true
    )
    assert.equal(findButton('Copy Block Source Request ID').disabled, true)
  })

  test('confirms and releases an active blocked conversation, then refreshes details', async () => {
    let detailLoads = 0
    let deleteCalls = 0
    apiClient.get = async () => {
      detailLoads += 1
      return {
        data: {
          success: true,
          data: {
            id: 15,
            created_at: 1,
            action: 'blocked',
            confidence: 0.95,
            user_id: 42,
            username: 'tester',
            group: 'default',
            model: 'model',
            prompt: 'danger',
            reason: 'risk',
            duration_ms: 3,
            mode: 'blocking',
            actually_blocked: true,
            request_id: 'request',
            audit_model_output: '',
            cache_source_request_id: '',
            cache_source_reason: '',
            conversation_blocked: detailLoads === 1,
          },
        },
      }
    }
    apiDeleteClient.delete = async (url: string) => {
      deleteCalls += 1
      assert.equal(url, '/api/prompt-audit/logs/15/conversation-block')
      return { data: { success: true, data: { released: true } } }
    }

    await renderWithProviders(
      <PromptAuditReasonDialog logId={15} onOpenChange={() => undefined} />
    )
    await waitFor(
      () =>
        document.body.textContent?.includes(
          'Stop Blocking This Conversation'
        ) === true,
      'Release action did not load'
    )
    await act(async () => findButton('Stop Blocking This Conversation').click())
    assert.equal(deleteCalls, 0)
    assert.equal(
      document.body.textContent?.includes('Release Conversation Block?'),
      true
    )
    await act(async () => findButton('Confirm Release').click())
    await waitFor(
      () => deleteCalls === 1 && detailLoads >= 2,
      'Release did not refresh details'
    )
    assert.equal(
      document.body.textContent?.includes('Stop Blocking This Conversation'),
      false
    )
  })

  test('keeps the reason dialog open and shows an accessible error when release fails', async () => {
    apiClient.get = async () => ({
      data: {
        success: true,
        data: {
          id: 16,
          created_at: 1,
          action: 'blocked',
          confidence: null,
          user_id: 42,
          username: 'tester',
          group: 'default',
          model: 'model',
          prompt: 'danger',
          reason: 'risk',
          duration_ms: 3,
          mode: 'blocking',
          actually_blocked: true,
          request_id: 'request',
          audit_model_output: '',
          cache_source_request_id: '',
          cache_source_reason: '',
          conversation_blocked: true,
        },
      },
    })
    apiDeleteClient.delete = async () => ({
      data: { success: false, message: 'release failed' },
    })
    await renderWithProviders(
      <PromptAuditReasonDialog logId={16} onOpenChange={() => undefined} />
    )
    await waitFor(
      () =>
        document.body.textContent?.includes(
          'Stop Blocking This Conversation'
        ) === true,
      'Release action did not load'
    )
    await act(async () => findButton('Stop Blocking This Conversation').click())
    await act(async () => findButton('Confirm Release').click())
    await waitFor(
      () =>
        document.querySelector('[role="alert"]')?.textContent ===
        'release failed',
      'Release error was not shown'
    )
    assert.equal(document.body.textContent?.includes('Reason Detail'), true)
  })
})
