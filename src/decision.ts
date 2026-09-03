/**
 * The decision bridge: the deferred-answerer core of `dsh-reach`.
 *
 * Listens to the official `approval/request` / `user-questions/request`
 * Cordis waterfalls (Agent-scoped) and mirrors every pending card into IM,
 * then answers from chat by resolving the held promise. Timeout policy:
 * `delegate` calls `next()` (the GUI answerer chain continues), `reject`
 * fails closed, `wait` keeps the card open. The request's own signal aborts
 * to `'cancelled'`.
 *
 * Design rules (the 19-patch behavior, now first-class):
 * - Every pending card gets a stable short token (`#ab12cd` from the request
 *   id) plus a per-user arrival number `P{n}` / `Q{n}`.
 * - Capture is narrowed: only decision-shaped text is consumed while cards
 *   are pending; bare `1`/`2` decides only when exactly one card exists.
 * - Multiple cards always require `P{n}=`/`Q{n}=` targeting (bare replies
 *   are blocked with guidance) — including same-session multi-cards.
 * - `/rp` / `/rq` reject every pending card of their kind; `/history`
 *   re-renders all pending cards.
 */

import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import type { AskUserQuestionAnswer, AskUserQuestionRequest } from '@deepseek-ai/dsh-user-questions'
import type { Agent } from '@deepseek-ai/dsh-agent'

/** A pending approval card mirrored from `approval/request`. */
export interface PendingApproval {
  readonly kind: 'approval'
  /** Stable short token: first 6 chars of the request id. */
  readonly token: string
  readonly agent: Agent
  readonly toolName: string
  readonly reason: string | undefined
  readonly requestedAt: number
  /** Arrival number among this user's pending cards of any kind. */
  number: number
  resolve: (outcome: ApprovalOutcome) => void
  timer?: ReturnType<typeof setTimeout>
}

/** A pending question card mirrored from `user-questions/request`. */
export interface PendingQuestion {
  readonly kind: 'question'
  readonly token: string
  readonly agent: Agent
  readonly request: AskUserQuestionRequest
  readonly requestedAt: number
  number: number
  resolve: (answer: AskUserQuestionAnswer | undefined) => void
  timer?: ReturnType<typeof setTimeout>
}

export type PendingCard = PendingApproval | PendingQuestion

export interface DecisionBridgeOptions {
  /** Seconds before the timeout policy applies (0 = wait forever). */
  readonly cardTimeoutSec: number
  readonly onTimeout: 'delegate' | 'reject' | 'wait'
  readonly log: (message: string) => void
}

export interface RenderCardOptions {
  readonly workspaceLabel: string
  readonly sessionLabel: string
}

/** Derive the stable short token from a request id (uuid string). */
export function shortToken(id: string): string {
  const hex = id.replace(/-/gu, '')
  return `#${hex.slice(0, 6)}`
}

/** Render one pending approval card for IM. */
export function renderApprovalCard(card: PendingApproval, options: RenderCardOptions): string {
  const reason = card.reason ? `\n原因: ${card.reason}` : ''
  const target = `\n工作区: ${options.workspaceLabel} · 会话: ${options.sessionLabel}`
  return `🔐 P${card.number} 权限卡待处理${target}\n工具: ${card.toolName}${reason}\n回复: 1 允许一次 / 2 拒绝（多卡请用 P${card.number}=1 指定；卡号 ${card.token}）`
}

/** Render one pending question card for IM. */
export function renderQuestionCard(card: PendingQuestion, options: RenderCardOptions): string {
  const target = `\n工作区: ${options.workspaceLabel} · 会话: ${options.sessionLabel}`
  const lines = card.request.questions.map((question, index) => {
    const options = (question.options ?? []).map((option, optionIndex) => `  ${optionIndex + 1}. ${option.label}`).join('\n')
    return `Q${card.number}-${index + 1} ${question.question}${options ? `\n${options}` : ''}`
  })
  return `❓ P${card.number} 提问卡待处理${target}\n${lines.join('\n')}\n回复: 答案或编号（多卡请用 P${card.number}=Q1=2 指定；卡号 ${card.token}）`
}

/** Whether a text is decision-shaped (`P{n}=`, `Q{n}=`, `#token=`). */
export function isDecisionShaped(text: string): boolean {
  return /^(?:P\d+=|Q\d+=|#[\da-f]{4,}=)/iu.test(text.trim())
}

/** A parsed decision reply. */
export type DecisionReply =
  | { readonly kind: 'rp' }
  | { readonly kind: 'rq' }
  | { readonly kind: 'by-token'; readonly token: string; readonly value: string }
  | { readonly kind: 'by-number'; readonly number: number; readonly question: boolean; readonly value: string }
  | { readonly kind: 'bare'; readonly value: string }

/** Parse a decision reply line. */
export function parseDecisionReply(text: string): DecisionReply | undefined {
  const line = text.trim()
  if (/^\/rp$/iu.test(line)) return { kind: 'rp' }
  if (/^\/rq$/iu.test(line)) return { kind: 'rq' }
  const tokenMatch = /^#([\da-f]{4,})=(.+)$/iu.exec(line)
  if (tokenMatch) {
    const token = tokenMatch[1] ?? ''
    const value = tokenMatch[2] ?? ''
    return { kind: 'by-token', token: `#${token.toLowerCase()}`, value: value.trim() }
  }
  const numberMatch = /^P(\d+)=(?:Q(\d+)=)?(.+)$/iu.exec(line)
  if (numberMatch) {
    const number = Number(numberMatch[1])
    const question = numberMatch[2] !== undefined
    return { kind: 'by-number', number, question, value: (numberMatch[3] ?? '').trim() }
  }
  if (/^[12]$/u.test(line) || /^(?:yes|no)$/iu.test(line)) return { kind: 'bare', value: line.toLowerCase() }
  return undefined
}

/** Reject every pending approval card of one user. */
export function rejectAllApprovals(cards: readonly PendingCard[]): number {
  let count = 0
  for (const card of cards) {
    if (card.kind === 'approval') {
      card.resolve('rejected')
      count++
    }
  }
  return count
}

/** Reject every pending question card of one user. */
export function rejectAllQuestions(cards: readonly PendingCard[]): number {
  let count = 0
  for (const card of cards) {
    if (card.kind === 'question') {
      card.resolve(undefined)
      count++
    }
  }
  return count
}

/** Resolve one approval card from a reply value (`1` allow-once, `2` reject). */
export function resolveApprovalValue(_card: PendingApproval, value: string): ApprovalOutcome | undefined {
  if (value === '1' || value === 'allow' || value === 'yes') return 'allowed-once'
  if (value === '2' || value === 'reject' || value === 'no') return 'rejected'
  return undefined
}

/** Resolve one question of a card from a reply value (option number or free text). */
export function resolveQuestionValue(
  card: PendingQuestion,
  questionIndex: number,
  value: string,
): AskUserQuestionAnswer {
  const question = card.request.questions[questionIndex]
  const answers = card.request.questions.map((item, index) => {
    if (index !== questionIndex || question === undefined) return { id: item.id, selected: [] as string[] }
    const numeric = /^\d+$/u.test(value) ? Number(value) : undefined
    if (numeric !== undefined && numeric >= 1 && numeric <= (question.options?.length ?? 0)) {
      const label = question.options?.[numeric - 1]?.label
      if (label) return { id: question.id, selected: [label] }
    }
    return { id: question.id, selected: [], custom: value }
  })
  return { answers }
}
