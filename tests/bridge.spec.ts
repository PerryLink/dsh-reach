import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ApprovalRequest, ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import type { AskUserQuestionRequest } from '@deepseek-ai/dsh-user-questions'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { Bridge, type ReachRuntimeState } from '../src/bridge.ts'
import type { ChannelAdapter, ChannelCapabilities, ChannelStatus, OutboundRequest } from '../src/channel.ts'
import { resolveConfig } from '../src/config.ts'

/** Scripted adapter: records outbound sends; inbound driven by the test. */
class FakeAdapter implements ChannelAdapter {
  constructor(readonly id: string = 'fake') {}
  readonly capabilities: ChannelCapabilities = { text: true, image: false, file: false, voice: false, typing: false, cards: false }
  readonly sent: OutboundRequest[] = []
  failNext = false

  status(): ChannelStatus {
    return { phase: 'logged-in', accountId: 'bot1', userId: 'u1', monitorRunning: true, lastError: undefined }
  }
  start(): void {}
  async send(request: OutboundRequest): Promise<void> {
    if (this.failNext) {
      this.failNext = false
      throw new Error('simulated transport failure')
    }
    this.sent.push(request)
  }
  async login(): Promise<string> { return 'bot1' }
  async logout(): Promise<void> {}
  async typing(): Promise<void> {}
}

const fakeAgent = {
  session: { id: 'session-1' },
  inject: vi.fn(),
  followup: vi.fn(),
} as unknown as Agent

const followupCalls = (): number => (fakeAgent.followup as unknown as { mock: { calls: unknown[] } }).mock.calls.length

function makeRequest(): ApprovalRequest {
  return {
    agent: fakeAgent,
    toolName: 'bash',
    reason: 'run a command',
  } as ApprovalRequest
}

function makeQuestion(): AskUserQuestionRequest {
  return {
    agent: fakeAgent,
    questions: [{ id: 'q1', question: 'Pick one?', options: [{ label: 'A' }, { label: 'B' }] }],
  } as AskUserQuestionRequest
}

function makeAgents(): Record<string, unknown> {
  return {
    get: (id: unknown) => (typeof id === 'string' && id === 'session-1' ? fakeAgent : undefined),
    list: () => [],
    create: async () => ({ dispose: () => {} }),
  }
}

interface Harness {
  readonly bridge: Bridge
  readonly adapter: FakeAdapter
  readonly states: ReachRuntimeState[]
  readonly next: ReturnType<typeof vi.fn<() => Promise<ApprovalOutcome>>>
  readonly lastState: () => ReachRuntimeState
}

function setup(configOverrides: Parameters<typeof resolveConfig>[0] = {}): Harness {
  const ctx = new Context()
  const adapter = new FakeAdapter()
  const states: ReachRuntimeState[] = []
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
  const writeState = (next: ReachRuntimeState): void => {
    current = next
    states.push(next)
  }
  ctx.provide('agents', makeAgents())
  ctx.provide('workspaceRegistry', {
    list: () => [{ path: '/some/path', title: 'Project' }],
    create: async (path: string) => ({ path }),
  })
  const bridge = new Bridge({
    ctx: ctx as never,
    config: resolveConfig(configOverrides),
    adapters: [adapter],
    readState: () => current,
    writeState,
    log: () => {},
  })
  const next = vi.fn(async () => 'unavailable' as ApprovalOutcome)
  return { bridge, adapter, states, next, lastState: () => current }
}

describe('dsh-reach bridge — decision mirror (the 19-patch behaviors)', () => {
  let harness: Harness
  beforeEach(() => {
    harness = setup()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('mirrors an approval card with a stable token and P{n} number', async () => {
    const outcome = harness.bridge.onApproval(makeRequest(), harness.next)
    expect(harness.adapter.sent.length).toBe(1)
    const text = harness.adapter.sent[0]?.parts[0]
    expect(text && text.type === 'text' ? text.text : '').toMatch(/🔐 P1 权限卡待处理/)
    expect(harness.adapter.sent[0]?.parts[0]).toMatchObject({ type: 'text' })
    expect((harness.adapter.sent[0]?.parts[0] as { text: string }).text).toMatch(/卡号 #[0-9a-f]{6}/)
    // The promise must still be pending (no decision yet).
    let settled = false
    void outcome.then(() => { settled = true })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(settled).toBe(false)
    expect(harness.next).not.toHaveBeenCalled()
  })

  it('answers a single bare reply and resolves the held waterfall', async () => {
    const outcome = harness.bridge.onApproval(makeRequest(), harness.next)
    harness.bridge.handleInbound({ sender: 'u1', chatId: 'u1', parts: [{ type: 'text', text: '1' }] })
    await expect(outcome).resolves.toBe('allowed-once')
    expect(harness.adapter.sent.at(-1)?.parts[0]).toMatchObject({ type: 'text', text: expect.stringContaining('已允许 bash') })
  })

  it('answers by token and by P{n} number across multiple cards', async () => {
    const first = harness.bridge.onApproval(makeRequest(), harness.next)
    const second = harness.bridge.onApproval(makeRequest(), harness.next)
    expect(harness.adapter.sent.length).toBe(2)
    harness.bridge.handleInbound({ sender: 'u1', chatId: 'u1', parts: [{ type: 'text', text: 'P1=2' }] })
    await expect(first).resolves.toBe('rejected')
    // The second card carries its own stable token.
    const tokenLine = (harness.adapter.sent[1]?.parts[0] as { text: string }).text
    const token = /卡号 (#[0-9a-f]{6})/u.exec(tokenLine)?.[1]
    expect(token).toBeDefined()
    harness.bridge.handleInbound({ sender: 'u1', chatId: 'u1', parts: [{ type: 'text', text: `${token}=1` }] })
    await expect(second).resolves.toBe('allowed-once')
  })

  it('blocks bare replies when multiple cards are pending (multi-card guard)', async () => {
    const first = harness.bridge.onApproval(makeRequest(), harness.next)
    const second = harness.bridge.onApproval(makeRequest(), harness.next)
    harness.bridge.handleInbound({ sender: 'u1', chatId: 'u1', parts: [{ type: 'text', text: '1' }] })
    const last = harness.adapter.sent.at(-1)?.parts[0]
    expect(last).toMatchObject({ type: 'text', text: expect.stringContaining('裸回复已拦截') })
    let settled = false
    void Promise.all([first, second]).then(() => { settled = true })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(settled).toBe(false)
  })

  it('/rp rejects every pending approval', async () => {
    const first = harness.bridge.onApproval(makeRequest(), harness.next)
    const second = harness.bridge.onApproval(makeRequest(), harness.next)
    harness.bridge.handleInbound({ sender: 'u1', chatId: 'u1', parts: [{ type: 'text', text: '/rp' }] })
    await expect(first).resolves.toBe('rejected')
    await expect(second).resolves.toBe('rejected')
    expect(harness.adapter.sent.at(-1)?.parts[0]).toMatchObject({ type: 'text', text: expect.stringContaining('已拒绝 2 张权限卡') })
  })

  it('answers structured question cards with P{n}=Q1=<option>', async () => {
    const outcome = harness.bridge.onQuestion(makeQuestion(), async () => ({ answers: [] }))
    harness.bridge.handleInbound({ sender: 'u1', chatId: 'u1', parts: [{ type: 'text', text: 'P1=Q1=2' }] })
    const answer = await outcome
    expect(answer.answers[0]?.selected).toEqual(['B'])
  })

  it('delegates on timeout when the policy is delegate', async () => {
    const quick = setup({ cardTimeoutSec: 0.05, approvalOnTimeout: 'delegate' })
    const outcome = quick.bridge.onApproval(makeRequest(), quick.next)
    await expect(outcome).resolves.toBe('unavailable')
    expect(quick.next).toHaveBeenCalledTimes(1)
  })

  it('fails closed on timeout when the policy is reject', async () => {
    const quick = setup({ cardTimeoutSec: 0.05, approvalOnTimeout: 'reject' })
    const outcome = quick.bridge.onApproval(makeRequest(), quick.next)
    await expect(outcome).resolves.toBe('rejected')
    expect(quick.next).not.toHaveBeenCalled()
  })

  it('persists the delivered set per admitted card', () => {
    void harness.bridge.onApproval(makeRequest(), harness.next)
    expect(harness.lastState().delivered).toHaveLength(1)
    void harness.bridge.onApproval(makeRequest(), harness.next)
    expect(harness.lastState().delivered).toHaveLength(2)
  })

  it('does not push cards when no user is authorized', async () => {
    const none = setup()
    none.bridge.patchSecurity([])
    const state = none.lastState()
    // Owner still exists in this harness; simulate a fresh unpaired deployment.
    none.bridge.setCrossSessionNotify(true)
    const unpaired = new Bridge({
      ctx: new Context() as never,
      config: resolveConfig({}),
      adapters: [none.adapter],
      readState: () => ({ ...state, security: { owner: undefined, allowFrom: [] } }),
      writeState: () => {},
      log: () => {},
    })
    const outcome = unpaired.onApproval(makeRequest(), none.next)
    await expect(outcome).resolves.toBe('unavailable')
    expect(none.adapter.sent.length).toBe(0)
  })

  it('bootstrap-pairs the first inbound sender as owner', () => {
    const ctx = new Context()
    ctx.provide('agents', makeAgents())
    let current: ReachRuntimeState = {
      security: { owner: undefined, allowFrom: [] },
      chatSessions: undefined,
      workspaceCwd: undefined,
      delivered: undefined,
      audit: undefined,
      silent: undefined,
      crossSessionNotify: true,
      notifyTaskEvents: false,
      queueMode: undefined,
    }
    const unpaired = new Bridge({
      ctx: ctx as never,
      config: resolveConfig({}),
      adapters: [new FakeAdapter()],
      readState: () => current,
      writeState: (next) => { current = next },
      log: () => {},
    })
    unpaired.handleInbound({ sender: 'stranger', chatId: 'stranger', parts: [{ type: 'text', text: 'hello' }] })
    expect(unpaired.firstUser()).toBe('stranger')
  })

  it('ignores unauthorized senders and sends a notice (denyUnauthorized=false)', () => {
    const h = setup({ denyUnauthorized: false })
    h.bridge.handleInbound({ sender: 'evil', chatId: 'evil', parts: [{ type: 'text', text: 'hello' }] })
    expect(h.adapter.sent.at(-1)?.parts[0]).toMatchObject({ type: 'text', text: expect.stringContaining('未授权') })
  })

  it('silently ignores unauthorized senders with denyUnauthorized=true', () => {
    const h = setup({ denyUnauthorized: true })
    const before = h.adapter.sent.length
    h.bridge.handleInbound({ sender: 'evil', chatId: 'evil', parts: [{ type: 'text', text: 'hello' }] })
    expect(h.adapter.sent.length).toBe(before)
  })

  it('forwards non-decision chat text to the agent (narrowed capture)', () => {
    void harness.bridge.onApproval(makeRequest(), harness.next)
    const before = followupCalls()
    harness.bridge.handleInbound({ sender: 'u1', chatId: 'u1', parts: [{ type: 'text', text: '帮我看看这个任务' }] })
    expect(followupCalls()).toBeGreaterThan(before)
  })

  it('relays assistant messages unless silent', () => {
    const event = { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '你好' }] } } } as unknown as SessionEvent
    harness.bridge.onSessionEvent('session-1', event)
    expect(harness.adapter.sent.at(-1)?.parts[0]).toMatchObject({ type: 'text', text: '你好' })
    harness.bridge.setSilent(true)
    const before = harness.adapter.sent.length
    harness.bridge.onSessionEvent('session-1', event)
    expect(harness.adapter.sent.length).toBe(before)
  })

  it('sends turn/end notices only when notifyTaskEvents is on', () => {
    const event = { type: 'turn/end', data: { reason: 'completed' } } as unknown as SessionEvent
    harness.bridge.onSessionEvent('session-1', event)
    expect(harness.adapter.sent.length).toBe(0)
    harness.bridge.setNotifyTaskEvents(true)
    harness.bridge.onSessionEvent('session-1', event)
    expect(harness.adapter.sent.at(-1)?.parts[0]).toMatchObject({ type: 'text', text: expect.stringContaining('任务结束') })
  })

  it('queues outbound within the send budget and drains on /next', async () => {
    const h = setup({ sendBudget: 2, windowSec: 60 })
    h.bridge.sendText('u1', 'one')
    h.bridge.sendText('u1', 'two')
    h.bridge.sendText('u1', 'three')
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(h.adapter.sent.filter((entry) => entry.parts[0]?.type === 'text').length).toBe(2)
    expect(h.bridge.outboundLength('u1')).toBe(1)
    h.bridge.drainNow('u1')
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(h.adapter.sent.filter((entry) => entry.parts[0]?.type === 'text').length).toBe(3)
  })

  it('re-queues failed sends for a later drain', async () => {
    const h = setup({ sendBudget: 10 })
    h.adapter.failNext = true
    h.bridge.sendText('u1', 'boom')
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(h.bridge.outboundLength('u1')).toBe(1)
    h.bridge.drainNow('u1')
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(h.bridge.outboundLength('u1')).toBe(0)
  })

  // ── Phase 2 behaviors ────────────────────────────────────────────────────

  it('requires the auth code suffix when authCode is configured', async () => {
    const h = setup({ authCode: 'xyz' })
    const outcome = h.bridge.onApproval(makeRequest(), h.next)
    h.bridge.handleInbound({ sender: 'u1', chatId: 'u1', parts: [{ type: 'text', text: 'P1=1' }] })
    expect(h.adapter.sent.at(-1)?.parts[0]).toMatchObject({ type: 'text', text: expect.stringContaining('授权码') })
    h.bridge.handleInbound({ sender: 'u1', chatId: 'u1', parts: [{ type: 'text', text: 'P1=1:xyz' }] })
    await expect(outcome).resolves.toBe('allowed-once')
  })

  it('accepts natural-language reject-all', async () => {
    const first = harness.bridge.onApproval(makeRequest(), harness.next)
    const second = harness.bridge.onApproval(makeRequest(), harness.next)
    harness.bridge.handleInbound({ sender: 'u1', chatId: 'u1', parts: [{ type: 'text', text: '全部拒绝' }] })
    await expect(first).resolves.toBe('rejected')
    await expect(second).resolves.toBe('rejected')
  })

  it('accepts natural-language numbered approval (批准第2张)', async () => {
    const first = harness.bridge.onApproval(makeRequest(), harness.next)
    const second = harness.bridge.onApproval(makeRequest(), harness.next)
    harness.bridge.handleInbound({ sender: 'u1', chatId: 'u1', parts: [{ type: 'text', text: '批准第2张' }] })
    await expect(second).resolves.toBe('allowed-once')
    void first
  })

  it('persists a per-chat workspace override and applies it to new sessions', () => {
    const reply = harness.bridge.switchWorkspace('u1', '1')
    expect(reply).toContain('已切换工作区')
    expect(harness.lastState().workspaceCwd).toEqual({ u1: '/some/path' })
  })

  it('forgets the chat binding on /session new', () => {
    harness.bridge.newChatSession('u1')
    expect(harness.lastState().chatSessions).not.toHaveProperty('u1')
  })

  it('reports the busy digest driver', () => {
    expect(harness.bridge.busyCount()).toBe(0)
    harness.bridge.onAgentStatus(fakeAgent, 'running')
    expect(harness.bridge.busyCount()).toBe(1)
    harness.bridge.onAgentStatus(fakeAgent, 'idle')
    expect(harness.bridge.busyCount()).toBe(0)
  })

  it('dispose() settles every pending decision so unload never strands an approval', async () => {
    const first = harness.bridge.onApproval(makeRequest(), harness.next)
    const second = harness.bridge.onApproval(makeRequest(), harness.next)
    harness.bridge.dispose()
    await expect(first).resolves.toBe('unavailable')
    await expect(second).resolves.toBe('unavailable')
    expect(harness.bridge.pendingCount('u1')).toBe(0)
    expect(harness.next).not.toHaveBeenCalled()
  })

  it('routes numeric chat ids to the telegram adapter and others to weixin', async () => {
    const ctx = new Context()
    const weixin = new FakeAdapter('weixin')
    const telegram = new FakeAdapter('telegram')
    ctx.provide('agents', makeAgents())
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
      adapters: [weixin, telegram],
      readState: () => current,
      writeState: (next) => { current = next },
      log: () => {},
    })
    bridge.sendText('u1@im.wechat', 'via weixin')
    bridge.sendText('12345', 'via telegram')
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(weixin.sent.some((entry) => entry.chatId === 'u1@im.wechat')).toBe(true)
    expect(telegram.sent.some((entry) => entry.chatId === '12345')).toBe(true)
  })
})
