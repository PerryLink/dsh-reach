/**
 * Settings-seam adaptation regressions (the 0.1.12 mount failure).
 *
 * `ctx.settings.register(ns, schema, options)` — how this plugin used to mount
 * the `reach` and `reach-runtime` namespaces — was deleted when the host
 * replaced `SettingsProvider` with `SettingsForms`, and a real profile died in
 * `apply()` on `settings?.register is not a function`, so the whole plugin row
 * failed to activate. `reach` is an optional seam with zero hard dependencies,
 * so the adaptation has to degrade on a service it does not recognize rather
 * than throw, and it must keep claiming its page policy on hosts that do have
 * one.
 *
 * Runtime state is covered here too: the `reach-runtime` namespace it used to
 * persist through is gone, so state is session-scoped and the four user-facing
 * toggles start from the row config (which is what the settings page and the
 * slash commands already fall back to).
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
import { Bridge, type ReachRuntimeState } from '../src/bridge.ts'
import { resolveConfig } from '../src/config.ts'
import { fakeSettingsForms, type ConfigureCall } from './fixtures/settings.ts'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

interface CapturedTool {
  readonly name: string
}

/**
 * Mount the real plugin through a body that records the fiber `apply` sees.
 *
 * `ctx.plugin(plugin)` returns a WRAPPER fiber whose `uid` differs from the one
 * `apply` observes (measured on the pinned cordis), so a service-owner identity
 * check has to compare against the captured one, not against `ctx.plugin()`.
 * `Config` must ride along: cordis validates a plugin's config against the
 * schema on the plugin it is handed, so a wrapper without it receives
 * `undefined` and the mount would fail for an unrelated reason.
 * @param ctx - composition to mount into.
 * @returns the wrapper fiber, its disposer, and a getter for the captured fiber.
 */
function mountCapturingApplyFiber(ctx: Context): { fiber: { dispose(): Promise<void> }; applyFiber: () => unknown } {
  let captured: unknown
  const wrapper = {
    Config: plugin.Config,
    apply(inner: Context, config: unknown): void {
      captured = inner.fiber
      ;(plugin.apply as (ctx: Context, config: unknown) => void)(inner, config)
    },
  }
  const fiber = ctx.plugin(wrapper as never, undefined as never) as unknown as { dispose(): Promise<void> }
  return { fiber, applyFiber: () => captured }
}

/** Compose the optional seams the plugin gates on; returns the tool captures. */
function mount(ctx: Context, settings: unknown): CapturedTool[] {
  const tools: CapturedTool[] = []
  ctx.provide('settings', settings as never)
  ctx.provide('commands', { register: () => () => {}, find: () => undefined, execute: async () => undefined })
  ctx.provide('tools', {
    register: (definition: CapturedTool) => {
      tools.push(definition)
      return () => {}
    },
  })
  ctx.provide('webServer', { register: () => () => {} })
  ctx.provide('agents', { get: () => undefined, list: () => [], create: async () => ({ dispose: () => {} }) })
  ctx.provide('systemPrompt', { context: () => {}, getContextOrder: () => 0 })
  return tools
}

describe('settings seam — degrade on a foreign service, claim the policy on the real one', () => {
  it('mounts when the settings service has no member this plugin knows (the old crash)', async () => {
    injected.adapterThrows = false
    const ctx = new Context()
    // A settings service of an unknown generation: nothing but a marker. The
    // pre-fix `apply` called `.register` on whatever `ctx.get('settings')`
    // returned and threw here; the fix shape-guards `configure` and moves on.
    const tools = mount(ctx, { someOtherSettingsApi: () => {} })
    const fiber = ctx.plugin(plugin as never, undefined as never)
    await sleep(60)

    expect(tools.map((tool) => tool.name)).toEqual(['reach_send'])
    await fiber.dispose()
  })

  it('claims its page policy on the plugin fiber, after every adapter is built', async () => {
    injected.adapterThrows = false
    const ctx = new Context()
    const seen: ConfigureCall[] = []
    const settings = fakeSettingsForms((call) => seen.push(call))
    mount(ctx, settings.service)

    const { fiber, applyFiber } = mountCapturingApplyFiber(ctx)
    await sleep(60)

    expect(settings.calls).toHaveLength(1)
    const first = settings.calls[0]
    expect(first?.presentation.auto).toBe(false)
    // The OWNER is the plugin instance, not the inject child — that identity is
    // what makes the policy apply to this row's config form and no other.
    expect(seen[0]?.owner === applyFiber()).toBe(true)
    await fiber.dispose()
    expect(settings.calls).toHaveLength(0)
  })

  it('claims no policy when an adapter constructor throws', async () => {
    injected.adapterThrows = true
    const ctx = new Context()
    const settings = fakeSettingsForms()
    mount(ctx, settings.service)

    try {
      ctx.plugin(plugin as never, undefined as never)
    } catch {
      // A synchronous surface is equally acceptable; the assertion below is the point.
    }
    await sleep(60)

    expect(settings.calls).toHaveLength(0)
    injected.adapterThrows = false
  })
})

describe('runtime state — session-scoped, seeded from the row config', () => {
  it('starts from the resolved config and follows in-memory writes', () => {
    const config = resolveConfig({ silent: true, queueMode: 'steer', crossSessionNotify: false })
    let state: ReachRuntimeState = {
      security: undefined,
      chatSessions: undefined,
      workspaceCwd: undefined,
      delivered: undefined,
      audit: undefined,
      silent: undefined,
      crossSessionNotify: config.crossSessionNotify,
      notifyTaskEvents: config.notifyTaskEvents,
      queueMode: undefined,
    }
    const bridge = new Bridge({
      ctx: new Context(),
      config,
      adapters: [],
      readState: () => state,
      writeState: (next) => { state = next },
      log: () => {},
    })

    // No persisted section: the row config is the answer.
    expect(bridge.isSilent()).toBe(true)
    expect(bridge.queueMode()).toBe('steer')
    expect(bridge.notifyGate()).toBe('off')

    // A command writes in-memory state, which now wins over the config.
    bridge.setSilent(false)
    expect(bridge.isSilent()).toBe(false)
    bridge.setQueueMode('queue')
    expect(bridge.queueMode()).toBe('queue')
  })
})
