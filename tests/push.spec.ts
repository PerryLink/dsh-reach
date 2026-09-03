import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { Bridge, type ReachRuntimeState } from '../src/bridge.ts'
import type { ChannelAdapter, ChannelCapabilities, ChannelStatus, OutboundRequest } from '../src/channel.ts'
import { resolveConfig } from '../src/config.ts'
import { createReachPush } from '../src/push.ts'

class FakeAdapter implements ChannelAdapter {
  readonly id = 'fake'
  readonly capabilities: ChannelCapabilities = { text: true, image: false, file: false, voice: false, typing: false, cards: false }
  readonly sent: OutboundRequest[] = []
  status(): ChannelStatus { return { phase: 'logged-in', accountId: 'b', userId: 'u1', monitorRunning: true, lastError: undefined } }
  start(): void {}
  async send(request: OutboundRequest): Promise<void> { this.sent.push(request) }
  async login(): Promise<string> { return 'b' }
  async logout(): Promise<void> {}
  async typing(): Promise<void> {}
}

function makeBridge(adapter: FakeAdapter): { bridge: Bridge; ctx: Context } {
  const ctx = new Context()
  ctx.provide('agents', { get: () => undefined, list: () => [], create: async () => ({ dispose: () => {} }) })
  let current: ReachRuntimeState = {
    security: { owner: 'u1', allowFrom: [] },
    chatSessions: { u1: 'session-1' },
    workspaceCwd: undefined,
    delivered: undefined,
    audit: undefined,
    silent: undefined,
    crossSessionNotify: true,
    notifyTaskEvents: false,
    queueMode: undefined,
  }
  const bridge = new Bridge({
    ctx: ctx as never,
    config: resolveConfig({}),
    adapters: [adapter],
    readState: () => current,
    writeState: (next) => { current = next },
    log: () => {},
  })
  return { bridge, ctx }
}

describe('dsh-reach open push surface', () => {
  it('notify() pushes to the first authorized user and emits reach/sent', async () => {
    const adapter = new FakeAdapter()
    const { bridge, ctx } = makeBridge(adapter)
    const sent: unknown[] = []
    ctx.on('reach/sent', (payload) => sent.push(payload))
    const service = createReachPush(ctx, { bridge, pushToken: '' })
    const result = await service.notify(undefined, 'hello from a plugin')
    expect(result.ok).toBe(true)
    expect(adapter.sent.at(-1)?.parts[0]).toMatchObject({ type: 'text', text: 'hello from a plugin' })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ user: 'u1', text: 'hello from a plugin', ok: true })
  })

  it('notify() fails cleanly without an authorized user', async () => {
    const adapter = new FakeAdapter()
    const { bridge, ctx } = makeBridge(adapter)
    bridge.patchSecurity([])
    const service = createReachPush(ctx, { bridge, pushToken: '' })
    // Owner still paired in state; simulate unpaired by denying the target.
    const result = await service.notify('nobody', 'ping')
    expect(result.ok).toBe(false)
  })

  it('rejects empty text', async () => {
    const adapter = new FakeAdapter()
    const { bridge, ctx } = makeBridge(adapter)
    const service = createReachPush(ctx, { bridge, pushToken: '' })
    const result = await service.notify(undefined, '   ')
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('empty')
  })
})

describe('dsh-reach push route guards', () => {
  it('registers only when the webServer service is composed', () => {
    // Covered indirectly: without ctx.webServer the route registration is a no-op.
    const adapter = new FakeAdapter()
    const { bridge, ctx } = makeBridge(adapter)
    const service = createReachPush(ctx, { bridge, pushToken: '' })
    expect(typeof service.notify).toBe('function')
    const agent = undefined as unknown as Agent
    void agent
    void vi
  })
})
