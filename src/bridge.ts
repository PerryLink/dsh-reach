/**
 * The `dsh-reach` bridge: wires the channel adapter, per-user security, the
 * decision module, session routing, and the outbound ordered queue together.
 *
 * Official seams used: `approval/request` / `user-questions/request`
 * waterfalls (deferred answerer), `agent.followup` / `agent.inject` inbound,
 * `session/event` + `agent/error` + `agent/status` outbound observation,
 * `ctx.commands.execute` passthrough, `ctx.systemPrompt.context` channel
 * hint, `ctx.agents.create` session creation.
 */

import type { Context } from '@deepseek-ai/cordis'
import crypto from 'node:crypto'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ApprovalOutcome, ApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import type { AskUserQuestionAnswer, AskUserQuestionRequest } from '@deepseek-ai/dsh-user-questions'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { ChannelAdapter, InboundMessage } from './channel.ts'
import {
  parseDecisionReply,
  rejectAllApprovals,
  rejectAllQuestions,
  renderApprovalCard,
  renderQuestionCard,
  resolveApprovalValue,
  resolveQuestionValue,
  shortToken,
  type PendingApproval,
  type PendingCard,
  type PendingQuestion,
} from './decision.ts'
import { appendAudit, isAuthorized, pairOwner, type AuditEntry, type SecurityState } from './security.ts'
import type { ResolvedConfig } from './config.ts'

/** Persisted runtime state (settings namespace `reach-runtime`). */
export interface ReachRuntimeState {
  readonly security: SecurityState | undefined
  readonly chatSessions: Record<string, string> | undefined
  readonly delivered: readonly string[] | undefined
  readonly audit: readonly AuditEntry[] | undefined
  readonly silent: boolean | undefined
  readonly crossSessionNotify: boolean | undefined
  readonly notifyTaskEvents: boolean | undefined
  readonly queueMode: 'queue' | 'steer' | undefined
}

export interface BridgeDeps {
  readonly ctx: Context
  readonly config: ResolvedConfig
  readonly adapter: ChannelAdapter
  /** read/write the persisted runtime state. */
  readonly readState: () => ReachRuntimeState
  readonly writeState: (next: ReachRuntimeState) => void
  readonly log: (message: string) => void
}

interface OutboundEntry {
  readonly chatId: string
  readonly text: string
}

/** ES2022-safe deferred (Promise.withResolvers needs lib ES2024). */
interface Deferred<T> {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolver) => { resolve = resolver })
  return { promise, resolve }
}

/** Deferred-answerer waterfall listener — returns the held promise. */
export type ApprovalAnswerer = (
  request: ApprovalRequest,
  next: () => Promise<ApprovalOutcome>,
) => Promise<ApprovalOutcome>

export type QuestionAnswerer = (
  request: AskUserQuestionRequest,
  next: () => Promise<AskUserQuestionAnswer>,
) => Promise<AskUserQuestionAnswer>

export class Bridge {
  private readonly pendingByUser = new Map<string, PendingCard[]>()
  private cardSeq = 0
  private readonly runningAgents = new Set<Agent>()
  private readonly imSessions = new Set<string>()
  private readonly chatQueues = new Map<string, string[]>()
  private readonly outbound = new Map<string, OutboundEntry[]>()
  private budgetWindowStart = Date.now()
  private budgetUsed = 0

  constructor(private readonly deps: BridgeDeps) {}

  private state(): ReachRuntimeState {
    return this.deps.readState()
  }

  private persist(patch: Partial<ReachRuntimeState>): void {
    this.deps.writeState({ ...this.state(), ...patch })
  }

  private authorizedUsers(): string[] {
    const security = this.state().security ?? { owner: undefined, allowFrom: [] }
    const users = new Set<string>(security.allowFrom)
    if (security.owner) users.add(security.owner)
    return [...users]
  }

  /** First authorized user (single-user deployments: the owner). */
  firstUser(): string | undefined {
    return this.authorizedUsers()[0]
  }

  /** Replace the sender allowlist (settings page write path). */
  patchSecurity(users: readonly string[]): void {
    const security = this.state().security ?? { owner: undefined, allowFrom: [] }
    this.persist({ security: { owner: security.owner, allowFrom: [...users] } })
  }

  // ── Decision waterfalls ─────────────────────────────────────────────────

  readonly onApproval: ApprovalAnswerer = (request, next) => {
    const agent = request.agent
    const users = this.authorizedUsers()
    if (users.length === 0) return next()
    const token = shortToken(request.callId ?? crypto.randomUUID())
    const sessionId = agent.session.id
    const shouldPush = this.state().crossSessionNotify !== false || this.isBoundChat(sessionId, users[0] ?? '')
    if (!shouldPush) return next()
    const holder = deferred<ApprovalOutcome>()
    const card: PendingApproval = {
      kind: 'approval',
      token,
      agent,
      toolName: request.toolName,
      reason: request.reason,
      requestedAt: Date.now(),
      number: 0,
      resolve: (outcome) => {
        holder.resolve(outcome)
        this.settleCard(users[0] ?? '', card)
      },
    }
    this.admit(users[0] ?? '', card)
    this.deliverCard(users[0] ?? '', card, sessionId)
    if (this.deps.config.cardTimeoutSec > 0 && this.deps.config.approvalOnTimeout !== 'wait') {
      card.timer = setTimeout(() => {
        this.settleCard(users[0] ?? '', card)
        if (this.deps.config.approvalOnTimeout === 'delegate') {
          void next().then(card.resolve, () => card.resolve('unavailable'))
        } else {
          card.resolve('rejected')
        }
      }, this.deps.config.cardTimeoutSec * 1000)
      card.timer.unref?.()
    }
    request.signal?.addEventListener('abort', () => card.resolve('cancelled'), { once: true })
    return holder.promise
  }

  readonly onQuestion: QuestionAnswerer = (request, next) => {
    const agent = request.agent
    if (!agent) return next()
    const users = this.authorizedUsers()
    if (users.length === 0) return next()
    const token = shortToken(crypto.randomUUID())
    const sessionId = agent.session.id
    const shouldPush = this.state().crossSessionNotify !== false || this.isBoundChat(sessionId, users[0] ?? '')
    if (!shouldPush) return next()
    const holder = deferred<AskUserQuestionAnswer>()
    const card: PendingQuestion = {
      kind: 'question',
      token,
      agent,
      request,
      requestedAt: Date.now(),
      number: 0,
      resolve: (answer) => {
        holder.resolve(answer ?? { answers: [] })
        this.settleCard(users[0] ?? '', card)
      },
    }
    this.admit(users[0] ?? '', card)
    this.deliverCard(users[0] ?? '', card, sessionId)
    if (this.deps.config.cardTimeoutSec > 0 && this.deps.config.approvalOnTimeout !== 'wait') {
      card.timer = setTimeout(() => {
        this.settleCard(users[0] ?? '', card)
        if (this.deps.config.approvalOnTimeout === 'delegate') {
          void next().then(card.resolve, () => card.resolve({ answers: [] }))
        } else {
          card.resolve({ answers: [] })
        }
      }, this.deps.config.cardTimeoutSec * 1000)
      card.timer.unref?.()
    }
    request.signal?.addEventListener('abort', () => card.resolve({ answers: [] }), { once: true })
    return holder.promise
  }

  private admit(user: string, card: PendingCard): void {
    this.cardSeq += 1
    card.number = this.cardSeq
    const pendings = this.pendingByUser.get(user) ?? []
    pendings.push(card)
    this.pendingByUser.set(user, pendings)
    // Persist the delivered marker so replays never re-push an answered card.
    const delivered = this.state().delivered ?? []
    if (!delivered.includes(card.token)) this.persist({ delivered: [...delivered, card.token].slice(-1000) })
  }

  private settleCard(user: string, card: PendingCard): void {
    if (card.timer) clearTimeout(card.timer)
    const pendings = (this.pendingByUser.get(user) ?? []).filter((entry) => entry !== card)
    this.pendingByUser.set(user, pendings)
  }

  private isBoundChat(sessionId: string, user: string): boolean {
    return this.state().chatSessions?.[user] === sessionId
  }

  private deliverCard(user: string, card: PendingCard, sessionId: string): void {
    const label = { workspaceLabel: '任意工作区', sessionLabel: sessionId.slice(0, 8) }
    const text = card.kind === 'approval'
      ? renderApprovalCard(card, label)
      : renderQuestionCard(card, label)
    void this.sendText(user, text)
  }

  // ── Inbound ─────────────────────────────────────────────────────────────

  /** Handle one normalized inbound message. */
  handleInbound(message: InboundMessage): void {
    const sender = message.sender
    const security = pairOwner(sender, this.state().security ?? { owner: undefined, allowFrom: [] })
    if (!isAuthorized(sender, security)) {
      this.persist({ security, audit: appendAudit(this.state().audit ?? [], { at: new Date().toISOString(), kind: 'ignored', sender, detail: 'unauthorized' }) })
      if (!this.deps.config.denyUnauthorized) {
        void this.sendText(sender, '⚠️ 未授权发送者。请先由 owner 在设置页将该用户加入白名单。')
      }
      return
    }
    this.persist({ security, audit: appendAudit(this.state().audit ?? [], { at: new Date().toISOString(), kind: 'inbound', sender, detail: message.parts.map((part) => part.type).join(',') }) })

    const textPart = message.parts.find((part): part is Extract<(typeof message.parts)[number], { type: 'text' }> => part.type === 'text')
    const text = textPart?.text ?? ''

    // Decision capture (narrowed): only decision-shaped replies are consumed.
    const pendings = this.pendingByUser.get(sender) ?? []
    if (pendings.length > 0) {
      const trimmed = text.trim()
      if (/^[12]$/u.test(trimmed) && pendings.length > 1) {
        void this.sendText(sender, `⚠️ 当前有 ${pendings.length} 张卡待处理，裸回复已拦截。请用编号指定，例如 P1=1 或 P1=Q1=2（/history 可重看）。`)
        return
      }
      const reply = parseDecisionReply(text)
      if (reply !== undefined) {
        this.handleDecisionReply(sender, pendings, reply)
        return
      }
      if (/^[12]$/u.test(trimmed) && pendings.length === 1) {
        this.handleDecisionReply(sender, pendings, { kind: 'bare', value: trimmed })
        return
      }
      // Non-decision text flows to the agent normally (no chat hijack).
    }

    if (text.startsWith('/')) {
      void this.dispatchSlash(sender, text)
      return
    }
    this.submitToAgent(sender, message)
  }

  private handleDecisionReply(sender: string, pendings: PendingCard[], reply: ReturnType<typeof parseDecisionReply>): void {
    if (!reply) return
    if (reply.kind === 'rp') {
      const count = rejectAllApprovals(pendings)
      this.persist({ audit: appendAudit(this.state().audit ?? [], { at: new Date().toISOString(), kind: 'decision', sender, detail: `rp rejected ${count} approval(s)` }) })
      void this.sendText(sender, `已拒绝 ${count} 张权限卡。`)
      return
    }
    if (reply.kind === 'rq') {
      const count = rejectAllQuestions(pendings)
      this.persist({ audit: appendAudit(this.state().audit ?? [], { at: new Date().toISOString(), kind: 'decision', sender, detail: `rq rejected ${count} question(s)` }) })
      void this.sendText(sender, `已拒绝 ${count} 张提问卡。`)
      return
    }
    let target: PendingCard | undefined
    if (reply.kind === 'by-token') {
      target = pendings.find((card) => card.token === reply.token)
    } else if (reply.kind === 'by-number') {
      target = pendings.find((card) => card.number === reply.number && (reply.question ? card.kind === 'question' : card.kind === 'approval'))
    } else if (reply.kind === 'bare') {
      target = pendings.length === 1 ? pendings[0] : undefined
    } else {
      return
    }
    if (!target) {
      void this.sendText(sender, '⚠️ 该卡片不存在或已处理。')
      return
    }
    if (target.kind === 'approval') {
      const outcome = resolveApprovalValue(target, reply.value)
      if (outcome === undefined) {
        void this.sendText(sender, '⚠️ 无法识别该决策（1 允许一次 / 2 拒绝）。')
        return
      }
      target.resolve(outcome)
      void this.sendText(sender, outcome === 'allowed-once' ? `✅ 已允许 ${target.toolName}（一次）。` : `🚫 已拒绝 ${target.toolName}。`)
    } else {
      const questionIndex = reply.kind === 'by-number' && reply.question ? 0 : 0
      const answer = resolveQuestionValue(target, questionIndex, reply.value)
      target.resolve(answer)
      void this.sendText(sender, '✅ 已作答提问卡。')
    }
    this.persist({ audit: appendAudit(this.state().audit ?? [], { at: new Date().toISOString(), kind: 'decision', sender, detail: `${target.token} decided` }) })
  }

  private async dispatchSlash(sender: string, line: string): Promise<void> {
    const sessionId = this.state().chatSessions?.[sender]
    const agent = sessionId ? this.deps.ctx.agents.get(SessionId(sessionId)) : undefined
    const commands = this.deps.ctx.get('commands')
    if (agent && commands) {
      const parsed = /^\/([a-z][a-z0-9_-]*)(.*)$/iu.exec(line)
      const name = parsed?.[1]
      if (name && commands.find(agent, name) !== undefined) {
        const result = await commands.execute(agent, line, [], new AbortController().signal)
        if (result !== undefined) {
          const text = result.result.kind === 'success' ? (result.result.text ?? 'ok') : `⚠️ ${result.result.text}`
          void this.sendText(sender, text)
          return
        }
      }
    }
    // Unknown slash command: forward to the agent as text (pan17 semantics).
    this.submitToAgent(sender, { sender, chatId: sender, parts: [{ type: 'text', text: line }] })
  }

  private submitToAgent(sender: string, message: InboundMessage): void {
    const sessionId = this.ensureSession(sender)
    const agent = this.deps.ctx.agents.get(SessionId(sessionId))
    if (!agent) {
      void this.sendText(sender, '⚠️ 会话创建失败，请稍后重试。')
      return
    }
    const text = message.parts.filter((part): part is Extract<typeof message.parts[number], { type: 'text' }> => part.type === 'text')
      .map((part) => part.text)
      .join('\n')
    const attachmentLines = message.parts
      .filter((part) => part.type === 'image' || part.type === 'file')
      .map((part) => `[附件: ${part.path}]`)
    const content = [text, ...attachmentLines].filter(Boolean).join('\n')
    const userMessage = createUserMessage({
      content: [{ type: 'text', text: content }],
      source: { kind: 'plugin', plugin: 'dsh-reach' },
    })
    if (this.runningAgents.has(agent)) {
      const mode = this.state().queueMode ?? this.deps.config.queueMode
      if (mode === 'steer') {
        agent.inject(userMessage)
        void this.sendText(sender, '🔀 已插入当前轮次（steer）。')
      } else {
        const queue = this.chatQueues.get(sender) ?? []
        if (queue.length >= this.deps.config.maxQueue) queue.shift()
        queue.push(content)
        this.chatQueues.set(sender, queue)
        void this.sendText(sender, `⏳ agent 正在处理中，已排队（第 ${queue.length} 条）。完成后自动继续。`)
      }
      return
    }
    agent.followup(userMessage)
  }

  private ensureSession(sender: string): string {
    const existing = this.state().chatSessions?.[sender]
    if (existing && this.deps.ctx.agents.get(SessionId(existing))) return existing
    const sessionId = SessionId(crypto.randomUUID())
    const cwd = this.deps.config.cwd
    void this.deps.ctx.agents.create({
      sessionId,
      ...(cwd ? { meta: { cwd } } : {}),
    }).then((handle) => {
      this.imSessions.add(sessionId)
      void handle
    }).catch((error: unknown) => {
      this.deps.log(`session create failed: ${String(error)}`)
    })
    const chatSessions = { ...(this.state().chatSessions ?? {}), [sender]: sessionId }
    this.persist({ chatSessions })
    return sessionId
  }

  // ── Outbound ────────────────────────────────────────────────────────────

  /** Queue a text for one authorized user; the pump drains within the budget. */
  sendText(user: string, text: string): Promise<void> {
    const entries = this.outbound.get(user) ?? []
    entries.push({ chatId: user, text })
    this.outbound.set(user, entries)
    void this.pump(user)
    return Promise.resolve()
  }

  private async pump(user: string): Promise<void> {
    const entries = this.outbound.get(user) ?? []
    if (entries.length === 0) return
    const now = Date.now()
    if (now - this.budgetWindowStart >= this.deps.config.windowSec * 1000) {
      this.budgetWindowStart = now
      this.budgetUsed = 0
    }
    while (entries.length > 0 && this.budgetUsed < this.deps.config.sendBudget) {
      const entry = entries.shift()
      if (!entry) break
      this.budgetUsed += 1
      try {
        await this.deps.adapter.send({ chatId: entry.chatId, parts: [{ type: 'text', text: entry.text }] })
      } catch (error: unknown) {
        // Real iLink limit responses (ret -2 prepare failed) or transport
        // failures: re-queue and stop draining this window.
        entries.unshift(entry)
        this.deps.log(`send failed (queued for /next): ${String(error)}`)
        break
      }
    }
    this.outbound.set(user, entries)
  }

  /** Force an outbound drain attempt (the `/next` command). */
  drainNow(user: string): void {
    this.budgetWindowStart = Date.now()
    this.budgetUsed = 0
    void this.pump(user)
  }

  pendingCount(user: string): number {
    return this.pendingByUser.get(user)?.length ?? 0
  }

  pendingCards(user: string): readonly PendingCard[] {
    return this.pendingByUser.get(user) ?? []
  }

  /** Session-scoped view helpers (commands handlers receive the agent, not the sender). */
  private userFor(sessionId: string): string | undefined {
    return this.userForSession(sessionId)
  }

  pendingCountForSession(sessionId: string): number {
    const user = this.userFor(sessionId)
    return user ? this.pendingCount(user) : 0
  }

  outboundFor(sessionId: string): number {
    const user = this.userFor(sessionId)
    return user ? this.outboundLength(user) : 0
  }

  pendingCardsForSession(sessionId: string): readonly PendingCard[] {
    const user = this.userFor(sessionId)
    return user ? this.pendingCards(user) : []
  }

  stopSession(sessionId: string): void {
    const user = this.userFor(sessionId)
    if (user) this.stop(user)
  }

  drainForFirstUser(): void {
    const user = this.firstUser()
    if (user) this.drainNow(user)
  }

  /** Whether a session is IM-driven (channel prompt gate). */
  isImSession(sessionId: string): boolean {
    return this.imSessions.has(sessionId)
  }

  queueLength(user: string): number {
    return this.chatQueues.get(user)?.length ?? 0
  }

  outboundLength(user: string): number {
    return this.outbound.get(user)?.length ?? 0
  }

  isSilent(): boolean {
    return this.state().silent ?? this.deps.config.silent
  }

  notifyGate(): 'on' | 'off' {
    return this.state().crossSessionNotify ?? this.deps.config.crossSessionNotify ? 'on' : 'off'
  }

  taskEventsGate(): 'on' | 'off' {
    return this.state().notifyTaskEvents ?? this.deps.config.notifyTaskEvents ? 'on' : 'off'
  }

  queueMode(): 'queue' | 'steer' {
    return this.state().queueMode ?? this.deps.config.queueMode
  }

  /** Render one pending card for `/history`. */
  renderCard(card: PendingCard): string {
    const label = { workspaceLabel: '任意工作区', sessionLabel: card.agent.session.id.slice(0, 8) }
    return card.kind === 'approval' ? renderApprovalCard(card, label) : renderQuestionCard(card, label)
  }

  /** Request a stop of the sender's bound session. */
  stop(sender: string): void {
    const sessionId = this.state().chatSessions?.[sender]
    if (!sessionId) return
    const agent = this.deps.ctx.agents.get(SessionId(sessionId))
    const cancel = this.deps.ctx.get('sessions') as { cancel?: (id: SessionId) => unknown } | undefined
    if (agent && cancel?.cancel) cancel.cancel(SessionId(sessionId))
  }

  setSilent(value: boolean): void {
    this.persist({ silent: value })
  }

  setCrossSessionNotify(value: boolean): void {
    this.persist({ crossSessionNotify: value })
  }

  setNotifyTaskEvents(value: boolean): void {
    this.persist({ notifyTaskEvents: value })
  }

  setQueueMode(mode: 'queue' | 'steer'): void {
    this.persist({ queueMode: mode })
  }

  // ── Outbound observation ────────────────────────────────────────────────

  /** session/event listener: relay assistant replies; turn/end notifications. */
  onSessionEvent(sessionId: string, event: SessionEvent): void {
    if (event.type === 'assistant/message') {
      const user = this.userForSession(sessionId)
      if (!user || this.isSilent()) return
      const message = event.data.message as { content?: readonly { type: string; text?: string }[] }
      const text = (message.content ?? [])
        .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
        .map((block) => block.text)
        .join('')
      if (text) void this.sendText(user, text)
      return
    }
    if (event.type === 'turn/end') {
      if (this.state().notifyTaskEvents === true) {
        const user = this.userForSession(sessionId)
        if (user) void this.sendText(user, `✅ 任务结束（reason: ${event.data.reason}）`)
      }
      // Drain queued inbound for this session's chat.
      this.drainQueued(sessionId)
      return
    }
  }

  onAgentError(agent: Agent): void {
    if (this.state().notifyTaskEvents !== true) return
    const user = this.userForSession(agent.session.id)
    if (user) void this.sendText(user, '⚠️ 任务出错，详情见 DSH GUI。')
  }

  onAgentStatus(agent: Agent, status: string): void {
    if (status === 'running') this.runningAgents.add(agent)
    else this.runningAgents.delete(agent)
  }

  private userForSession(sessionId: string): string | undefined {
    for (const [user, id] of Object.entries(this.state().chatSessions ?? {})) {
      if (id === sessionId) return user
    }
    return undefined
  }

  private drainQueued(sessionId: string): void {
    const user = this.userForSession(sessionId)
    if (!user) return
    const queue = this.chatQueues.get(user)
    if (!queue || queue.length === 0) return
    const next = queue.shift()
    this.chatQueues.set(user, queue)
    if (next === undefined) return
    const agent = this.deps.ctx.agents.get(SessionId(sessionId))
    if (agent) {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: next }],
        source: { kind: 'plugin', plugin: 'dsh-reach' },
      }))
    }
  }
}
