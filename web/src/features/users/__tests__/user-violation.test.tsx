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
import { afterAll, afterEach, describe, test } from 'vitest'

const domWindow = new Window()
for (const key of [
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
] as const) {
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
const { api } = await import('@/lib/api')
const { useUsersColumns } = await import('../components/users-columns')
const { UserViolationDialog } =
  await import('../components/user-violation-dialog')

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

type ApiPost = (
  url: string,
  payload: unknown
) => Promise<{ data: Record<string, unknown> }>
const apiClient = api as unknown as { post: ApiPost }
const originalPost = apiClient.post
let rendered:
  | {
      host: HTMLDivElement
      root: ReturnType<typeof createRoot>
    }
  | undefined

async function render(node: ReactNode) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  rendered = { host, root }
  await act(async () => {
    root.render(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>)
  })
}

async function waitFor(condition: () => boolean, message: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) return
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)))
  }
  assert.fail(message)
}

function findButton(label: string) {
  const button = [
    ...document.querySelectorAll<HTMLButtonElement>('button'),
  ].find((candidate) => candidate.textContent?.trim() === label)
  assert.ok(button)
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

function ColumnsProbe() {
  const columns = useUsersColumns()
  return (
    <div>
      {columns.map((column) => {
        const id =
          column.id ?? ('accessorKey' in column ? column.accessorKey : '')
        return typeof column.header === 'string' ? (
          <span key={String(id)}>{column.header}</span>
        ) : null
      })}
    </div>
  )
}

afterEach(async () => {
  apiClient.post = originalPost
  if (rendered) {
    await act(async () => rendered?.root.unmount())
    rendered.host.remove()
    rendered = undefined
  }
  document.body.replaceChildren()
})

afterAll(() => {
  reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = false
  domWindow.close()
})

describe('user violation management', () => {
  test('replaces invite information with the violation count column', async () => {
    await render(<ColumnsProbe />)

    assert.equal(document.body.textContent?.includes('Violation Count'), true)
    assert.equal(document.body.textContent?.includes('Invite Info'), false)
  })

  test('rejects a subtraction below zero and submits a valid adjustment', async () => {
    const calls: Array<{ url: string; payload: unknown }> = []
    apiClient.post = async (url, payload) => {
      calls.push({ url, payload })
      return { data: { success: true } }
    }
    let successes = 0
    await render(
      <UserViolationDialog
        open
        onOpenChange={() => undefined}
        userId={7}
        currentCount={3}
        onSuccess={() => {
          successes += 1
        }}
      />
    )

    await act(async () => findButton('Subtract').click())
    const input = document.querySelector('input[type="number"]')
    assert.ok(input instanceof domWindow.HTMLInputElement)
    await act(async () => {
      setInputValue(input, '4')
    })
    await act(async () => findButton('Confirm').click())
    assert.equal(calls.length, 0)
    assert.equal(
      document.querySelector('[role="alert"]')?.textContent,
      'Violation count cannot be below zero'
    )

    await act(async () => {
      setInputValue(input, '2')
    })
    await act(async () => findButton('Confirm').click())
    await waitFor(
      () => calls.length === 1,
      'Violation adjustment was not submitted'
    )
    assert.deepEqual(calls[0], {
      url: '/api/user/manage',
      payload: {
        id: 7,
        action: 'adjust_violation_count',
        mode: 'subtract',
        value: 2,
      },
    })
    assert.equal(successes, 1)
  })

  test('allows overriding the violation count with zero', async () => {
    const payloads: unknown[] = []
    apiClient.post = async (_url, payload) => {
      payloads.push(payload)
      return { data: { success: true } }
    }
    await render(
      <UserViolationDialog
        open
        onOpenChange={() => undefined}
        userId={8}
        currentCount={5}
        onSuccess={() => undefined}
      />
    )

    await act(async () => findButton('Override').click())
    const input = document.querySelector('input[type="number"]')
    assert.ok(input instanceof domWindow.HTMLInputElement)
    await act(async () => {
      setInputValue(input, '0')
    })
    await act(async () => findButton('Confirm').click())
    await waitFor(() => payloads.length === 1, 'Override was not submitted')
    assert.deepEqual(payloads[0], {
      id: 8,
      action: 'adjust_violation_count',
      mode: 'override',
      value: 0,
    })
  })
})
