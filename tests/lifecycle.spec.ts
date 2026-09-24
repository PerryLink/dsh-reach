import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import * as plugin from '../src/index.ts'
import { fakeSettingsForms } from './fixtures/settings.ts'

const fakeTools = { register: vi.fn(() => () => {}) }
const fakeCommands = { register: vi.fn(() => () => {}), find: () => undefined, execute: async () => undefined }
const fakeWebServer = { register: vi.fn(() => () => {}) }
const fakeAgents = { get: () => undefined, list: () => [], create: async () => ({ dispose: () => {} }) }
const fakeSystemPrompt = { context: vi.fn(), getContextOrder: () => 0 }
const fakeCredentials = {
  resolve: async () => undefined,
  describe: async () => ({ configured: false, writable: false }),
  set: async () => {},
  unset: async () => {},
  readRecord: async () => undefined,
  describeRecord: async () => ({ configured: false, writable: false }),
  listRecords: async () => [],
  modifyRecord: async () => undefined,
  deleteRecord: async () => {},
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Mount {@link plugin} while capturing the fiber its own body sees.
 *
 * `ctx.plugin(plugin)` returns a wrapper fiber: measured on the pinned cordis,
 * `apply`'s `ctx.fiber` is a different object with a different `uid`, so the
 * owner a service receives must be compared against this capture rather than
 * against the value `ctx.plugin()` hands back.
 * @param ctx - composition to mount into.
 * @returns the wrapper fiber to dispose, plus a getter for the captured fiber.
 */
function mountCapturingApplyFiber(ctx: Context): { fiber: { dispose(): Promise<void> }; applyFiber: () => unknown } {
  let applyFiber: unknown
  // `Config` must ride along: cordis resolves a plugin's config against the
  // schema on the plugin it is handed, so a bare wrapper receives `undefined`.
  const wrapper = {
    Config: plugin.Config,
    apply(inner: Context, config: unknown): void {
      applyFiber = inner.fiber
      ;(plugin.apply as (ctx: Context, config: unknown) => void)(inner, config)
    },
  }
  const fiber = ctx.plugin(wrapper as never, undefined as never) as unknown as { dispose(): Promise<void> }
  return { fiber, applyFiber: () => applyFiber }
}

describe('dsh-reach load/unload lifecycle', () => {
  it('declares zero hard service dependencies', () => {
    expect(plugin.inject).toEqual([])
    expect(plugin.name).toBe('reach')
  })

  it('mounts and unmounts cleanly in a full composition', async () => {
    const ctx = new Context()
    let owner: unknown
    const settings = fakeSettingsForms((call) => { owner = call.owner })
    ctx.provide('settings', settings.service as never)
    ctx.provide('tools', fakeTools)
    ctx.provide('credentials', fakeCredentials)
    ctx.provide('commands', fakeCommands)
    ctx.provide('webServer', fakeWebServer)
    ctx.provide('agents', fakeAgents)
    ctx.provide('systemPrompt', fakeSystemPrompt)
    // `ctx.plugin()` returns a WRAPPER fiber, not the `ctx.fiber` the plugin
    // body sees, so the owner is compared against the fiber actually captured
    // inside `apply`. (Measured on the pinned cordis, not assumed.)
    const { fiber, applyFiber } = mountCapturingApplyFiber(ctx)
    await sleep(30)
    expect(fakeTools.register).toHaveBeenCalled()
    expect(fakeCommands.register).toHaveBeenCalled()
    expect(fakeWebServer.register).toHaveBeenCalled()
    // The settings face is claimed, not registered: `configure` gets the page
    // policy and THIS plugin instance's fiber, and nothing else on the service
    // is touched (the fake offers nothing else — see settings-face.spec.ts).
    expect(settings.calls).toHaveLength(1)
    expect(settings.calls[0]?.presentation.auto).toBe(false)
    expect(owner === applyFiber()).toBe(true)
    await fiber.dispose()
    // The policy rode an effect, so unload withdraws it again.
    expect(settings.calls).toHaveLength(0)
    expect(fakeWebServer.register.mock.results[0]?.value).toBeTypeOf('function')
  })

  it('mounts and unmounts cleanly with NO optional services (minimal composition)', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(plugin as never, undefined as never)
    await sleep(30)
    await fiber.dispose()
    expect(true).toBe(true)
  })

  it('mounts without a settings service, then claims the policy when one arrives', async () => {
    // No settings service composed at mount: `ctx.inject(['settings'], …)` runs
    // nothing and the plugin still mounts (zero hard dependencies). A service
    // appearing later must still be picked up — that is what the inject child is
    // for, and it is why the policy is not claimed with a one-shot `ctx.get`.
    const ctx = new Context()
    ctx.provide('credentials', fakeCredentials)
    ctx.provide('agents', fakeAgents)
    const fiber = ctx.plugin(plugin as never, undefined as never)
    await sleep(30)
    const settings = fakeSettingsForms()
    ctx.provide('settings', settings.service as never)
    await sleep(30)
    expect(settings.calls).toHaveLength(1)
    expect(settings.calls[0]?.presentation.auto).toBe(false)
    await fiber.dispose()
    expect(settings.calls).toHaveLength(0)
  })
})
