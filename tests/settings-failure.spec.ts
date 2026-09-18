/**
 * A7 hardening regressions.
 *
 * A7-① — a refused runtime-settings write must be reported, not discarded
 * (`void runtimeScope.replace(...)` used to swallow the rejection, so the next
 * read served stale state with no signal).
 *
 * A7-② — the two settings namespaces must be registered only after every
 * channel adapter has been constructed, so a constructor throw cannot strand a
 * half-registered namespace. The control case proves the fixture path really
 * does register both namespaces, which is what makes the throwing case
 * meaningful.
 *
 * The adapter mock extends the real class and only injects a constructor
 * failure, so the rest of the adapter surface (start/status/login/…) stays
 * intact and the mount is otherwise realistic.
 */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'

/** Shared with the hoisted module mock (vi.mock factories cannot close over locals). */
const injected = vi.hoisted(() => ({ adapterThrows: false }))

vi.mock('../src/adapters/telegram/telegram.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/adapters/telegram/telegram.ts')>()
  return {
    TelegramAdapter: class extends actual.TelegramAdapter {
      constructor(options: import('../src/adapters/telegram/telegram.ts').TelegramAdapterOptions) {
        if (injected.adapterThrows) throw new Error('injected adapter construction failure')
        super(options)
      }
    },
  }
})

import * as plugin from '../src/index.ts'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Settings scope stand-in: `fail` makes every write land as a rejection. */
class FakeScope {
  constructor(private readonly fail: boolean) {}

  get(): undefined {
    return undefined
  }

  watch(): () => void {
    return () => {}
  }

  update(): Promise<void> {
    return this.fail ? Promise.reject(new Error('write refused by the host')) : Promise.resolve()
  }

  replace(): Promise<void> {
    return this.fail ? Promise.reject(new Error('write refused by the host')) : Promise.resolve()
  }
}

interface CapturedCommand {
  readonly name: string
  readonly handler: (invocation: unknown) => unknown
}

/** Compose the optional seams the plugin gates on; `register` is the spy. */
function mount(
  ctx: Context,
  register: (ns: string, schema: unknown, options?: unknown) => FakeScope,
  commands: CapturedCommand[] = [],
): void {
  ctx.provide('settings', { register: (ns: string, schema: unknown, options?: unknown) => register(ns, schema, options) })
  ctx.provide('commands', {
    register: (definition: CapturedCommand) => {
      commands.push(definition)
      return () => {}
    },
    find: () => undefined,
    execute: async () => undefined,
  })
  ctx.provide('tools', { register: () => () => {} })
  ctx.provide('webServer', { register: () => () => {} })
  ctx.provide('agents', { get: () => undefined, list: () => [], create: async () => ({ dispose: () => {} }) })
  ctx.provide('systemPrompt', { context: () => {}, getContextOrder: () => 0 })
}

describe('A7 — settings registration ordering and write failures', () => {
  it('registers both namespaces in the normal path (A7-② control)', async () => {
    injected.adapterThrows = false
    const namespaces: string[] = []
    const register = vi.fn((ns: string) => {
      namespaces.push(ns)
      return new FakeScope(false)
    })
    const ctx = new Context()
    mount(ctx, register)

    const fiber = ctx.plugin(plugin as never, undefined as never)
    await sleep(60)

    expect(namespaces).toEqual(['reach', 'reach-runtime'])
    await fiber.dispose()
  })

  it('registers no settings namespace when an adapter constructor throws (A7-②)', async () => {
    injected.adapterThrows = true
    const register = vi.fn(() => new FakeScope(false))
    const ctx = new Context()
    mount(ctx, register)

    try {
      ctx.plugin(plugin as never, undefined as never)
    } catch {
      // A synchronous surface is equally acceptable; the assertion below is the point.
    }
    await sleep(60)

    expect(register).not.toHaveBeenCalled()
    injected.adapterThrows = false
  })

  it('reports a refused runtime settings write instead of failing silently (A7-①)', async () => {
    injected.adapterThrows = false
    const captured: string[] = []
    const commands: CapturedCommand[] = []
    const ctx = new Context()
    mount(ctx, () => new FakeScope(true), commands)
    vi.spyOn(ctx.logger, 'info').mockImplementation((message: unknown) => {
      captured.push(String(message))
    })

    const fiber = ctx.plugin(plugin as never, undefined as never)
    await sleep(60)

    // `/silent on` persists through bridge.setSilent -> writeState, i.e. the
    // exact call whose rejection used to be discarded.
    const silent = commands.find((definition) => definition.name === 'silent')
    expect(silent).toBeDefined()
    silent?.handler({ rawInput: 'on', agent: { session: { id: 'session-1' } } })
    await sleep(40)

    expect(captured.some((line) => line.includes('runtime settings write failed'))).toBe(true)
    await fiber.dispose()
  })
})
