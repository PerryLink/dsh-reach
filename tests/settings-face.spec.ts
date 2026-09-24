/**
 * The settings-face gate (regression for the 0.1.12 mount failure).
 *
 * A real profile at `dsh-v0.1.7-rc.1` could not activate the plugin row:
 * `settings?.register is not a function`, thrown from `apply()`. The host's
 * settings service is `SettingsForms`, whose public surface is
 * `configure`/`describe`/`prepareDocument`/`update`/`replace`/`mutate` — the
 * `register(ns, schema, options)` seam was deleted from the `0.1.7` line. The
 * test fixtures, however, handed the plugin a fake that DID provide `register`
 * and a writable scope, so the suite stayed green while every real mount died.
 *
 * These tests close that gap by comparing the fixture against the installed
 * package instead of against someone's memory of the API:
 * 1. the real `SettingsForms` must not carry `register` (the exact regression);
 * 2. every key the fake exposes must exist on the real class, so the fake can
 *    never satisfy a call the real service would reject;
 * 3. the fake must not silently pick the call up at runtime either — a
 *    `register` call against it throws, which is what a real profile does;
 * 4. the plugin, mounted with a REAL `SettingsForms` instance behind
 *    `ctx.settings`, must reach `configure` and be accepted.
 */

import { describe, expect, it } from 'vitest'
import { Context, Fiber } from '@deepseek-ai/cordis'
import SettingsForms from '@deepseek-ai/dsh-settings'
import * as plugin from '../src/index.ts'
import { fakeSettingsForms } from './fixtures/settings.ts'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Every member name on the class and its ancestors, including non-enumerables. */
function prototypeChainKeys(value: object): string[] {
  const keys = new Set<string>()
  let node: object | null = value
  while (node !== null && node !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(node)) keys.add(key)
    node = Object.getPrototypeOf(node) as object | null
  }
  return [...keys]
}

describe('settings face — the fixture must mirror the real SettingsForms', () => {
  it('the installed settings service has no register method (the mount-failure regression)', () => {
    const prototypeKeys = prototypeChainKeys(SettingsForms.prototype as object)
    expect(prototypeKeys).toContain('configure')
    expect(prototypeKeys).not.toContain('register')
    expect(prototypeKeys).not.toContain('namespaces')
  })

  it('exposes only members the real service also has', () => {
    const { service } = fakeSettingsForms()
    const real = prototypeChainKeys(SettingsForms.prototype as object)
    const missing = Object.keys(service).filter((key) => !real.includes(key))
    expect(missing).toEqual([])
    // The one member the plugin is allowed to call — by name and by callability,
    // not by reported arity (that is an implementation detail of the emitted
    // class and is not part of the contract).
    expect(typeof service.configure).toBe('function')
    // The surface is not accidentally WIDER than the real one either.
    expect(Object.keys(service)).toEqual(['configure'])
  })

  it('refuses a register call the way a real profile does', () => {
    const { service } = fakeSettingsForms()
    expect(() => {
      ;(service as unknown as Record<string, unknown>).register
    }).not.toThrow()
    expect((service as unknown as Record<string, unknown>).register).toBeUndefined()
    expect(() => {
      ;((service as unknown as { register(ns: string): unknown }).register)('reach')
    }).toThrow(TypeError)
  })

  it('mounts against a REAL SettingsForms service and is accepted', async () => {
    const ctx = new Context()
    // The constructor awaits `ctx.root.loader` to import a legacy settings
    // document; a never-resolving await is enough here and keeps the test off
    // the filesystem.
    Object.defineProperty(ctx.root, 'loader', { value: { await: () => new Promise(() => {}) }, configurable: true })
    const forms = new SettingsForms(ctx as never)

    const seen: unknown[] = []
    const original = forms.configure.bind(forms)
    ;(forms as unknown as { configure: unknown }).configure = (presentation: { auto?: boolean }, owner?: unknown) => {
      seen.push(owner)
      return original(presentation, owner as Fiber)
    }

    // No `ctx.provide('settings', …)`: the Service base already registered it.
    ctx.provide('tools', { register: () => () => {} })
    ctx.provide('commands', { register: () => () => {}, find: () => undefined, execute: async () => undefined })
    ctx.provide('webServer', { register: () => () => {} })
    ctx.provide('agents', { get: () => undefined, list: () => [], create: async () => ({ dispose: () => {} }) })
    ctx.provide('systemPrompt', { context: () => {}, getContextOrder: () => 0 })

    const fiber = ctx.plugin(plugin as never, undefined as never)
    await sleep(80)

    // The pre-fix `apply` threw here on `settings?.register is not a function`,
    // which failed the whole entry; the fix reaches the real `configure`.
    expect(seen).toHaveLength(1)
    expect(seen[0]).toBeInstanceOf(Fiber)
    await fiber.dispose()
  })
})
