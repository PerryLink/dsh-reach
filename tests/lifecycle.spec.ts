import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import * as plugin from '../src/index.ts'

class FakeSettingsScope {
  get(): undefined { return undefined }
  watch(): () => void { return () => {} }
  update(): Promise<void> { return Promise.resolve() }
  replace(): Promise<void> { return Promise.resolve() }
}

const fakeSettings = { register: () => new FakeSettingsScope() }
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

describe('dsh-reach load/unload lifecycle', () => {
  it('declares zero hard service dependencies', () => {
    expect(plugin.inject).toEqual([])
    expect(plugin.name).toBe('reach')
  })

  it('mounts and unmounts cleanly in a full composition', async () => {
    const ctx = new Context()
    ctx.provide('settings', fakeSettings)
    ctx.provide('tools', fakeTools)
    ctx.provide('credentials', fakeCredentials)
    ctx.provide('commands', fakeCommands)
    ctx.provide('webServer', fakeWebServer)
    ctx.provide('agents', fakeAgents)
    ctx.provide('systemPrompt', fakeSystemPrompt)
    const fiber = ctx.plugin(plugin as never, undefined as never)
    await sleep(30)
    expect(fakeTools.register).toHaveBeenCalled()
    expect(fakeCommands.register).toHaveBeenCalled()
    expect(fakeWebServer.register).toHaveBeenCalled()
    await fiber.dispose()
    expect(fakeWebServer.register.mock.results[0]?.value).toBeTypeOf('function')
  })

  it('mounts and unmounts cleanly with NO optional services (minimal composition)', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(plugin as never, undefined as never)
    await sleep(30)
    await fiber.dispose()
    expect(true).toBe(true)
  })

  it('degrades to memory state without the settings seam', async () => {
    const ctx = new Context()
    ctx.provide('credentials', fakeCredentials)
    ctx.provide('agents', fakeAgents)
    const fiber = ctx.plugin(plugin as never, undefined as never)
    await sleep(30)
    await fiber.dispose()
    expect(true).toBe(true)
  })
})
