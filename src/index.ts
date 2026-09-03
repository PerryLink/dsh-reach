/**
 * `dsh-reach` — multi-channel decision & remote-control bridge for
 * DeepSeek Harness.
 *
 * Loose-coupling design: the plugin declares NO hard service dependencies
 * (`inject` is empty). Every feature gates on `ctx.get(...)` and degrades:
 * - no `settings` → runtime state becomes session-scoped (in-memory);
 * - no `tools` → the `reach_send` tool is skipped;
 * - no `credentials` → channel tokens come from the row config only;
 * - no `commands` / `webServer` / `systemPrompt` → those surfaces are skipped.
 *
 * Unload safety: every registration, timer, poller, and listener is an
 * effect on this fiber; `bridge.dispose()` settles every held decision
 * promise so unloading never strands a pending approval.
 *
 * Function plugin — no default export (the Loader unwraps
 * `exports.default ?? exports`).
 *
 * @module dsh-reach
 */

import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { credentialKey, type CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-user-approval'
import type {} from '@deepseek-ai/dsh-user-questions'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { Config, resolveConfig } from './config.ts'
import { WeixinAdapter, resolveStorageDir } from './adapters/weixin/weixin.ts'
import { TelegramAdapter } from './adapters/telegram/telegram.ts'
import { FeishuAdapter, sdkTransport } from './adapters/feishu/feishu.ts'
import { Bridge, type ReachRuntimeState } from './bridge.ts'
import type { AuditEntry } from './security.ts'
import { localCommands } from './commands.ts'
import { reachSendTool } from './tool.ts'
import { registerChannelPrompt } from './prompt.ts'
import { ReachService } from './service.ts'
import { createReachPush, registerPushRoute } from './push.ts'
import type {} from './types.ts'

export const name = 'reach'

/** Zero hard dependencies: every feature gates on `ctx.get` and degrades. */
export const inject: string[] = []

export { Config, resolveConfig, type Config as ReachConfig, type ResolvedConfig } from './config.ts'
export { WeixinAdapter } from './adapters/weixin/weixin.ts'
export { TelegramAdapter } from './adapters/telegram/telegram.ts'
export { FeishuAdapter, sdkTransport, renderDecisionCard, decisionTextFromButtonValue } from './adapters/feishu/feishu.ts'
export { Bridge, type ReachRuntimeState } from './bridge.ts'
export {
  parseDecisionReply, renderApprovalCard, renderQuestionCard, shortToken,
  type PendingApproval, type PendingCard, type PendingQuestion,
} from './decision.ts'
export { chunkText, type ChannelAdapter, type InboundMessage, type MessagePart } from './channel.ts'

/** Runtime-state schema (settings namespace `reach-runtime`). */
export const RuntimeStateSchema = Schema.object({
  security: Schema.object({
    owner: Schema.string(),
    allowFrom: Schema.array(Schema.string()),
  }),
  chatSessions: Schema.array(Schema.object({
    chat: Schema.string(),
    session: Schema.string(),
  })),
  workspaceCwd: Schema.array(Schema.object({
    chat: Schema.string(),
    cwd: Schema.string(),
  })),
  delivered: Schema.array(Schema.string()),
  audit: Schema.array(Schema.object({
    at: Schema.string(),
    kind: Schema.union(['inbound', 'command', 'decision', 'auth', 'ignored'] as const),
    sender: Schema.string(),
    detail: Schema.string(),
  })),
  silent: Schema.boolean(),
  crossSessionNotify: Schema.boolean(),
  notifyTaskEvents: Schema.boolean(),
  queueMode: Schema.union(['queue', 'steer'] as const),
}) as Schema<RuntimeNamespaceValue>

/** Persisted shape of the runtime namespace (mapped to/from ReachRuntimeState). */
interface RuntimeNamespaceValue {
  readonly security: { readonly owner: string | undefined; readonly allowFrom: string[] } | undefined
  readonly chatSessions: readonly { readonly chat: string; readonly session: string }[]
  readonly workspaceCwd: readonly { readonly chat: string; readonly cwd: string }[]
  readonly delivered: readonly string[]
  readonly audit: readonly AuditEntry[]
  readonly silent: boolean | undefined
  readonly crossSessionNotify: boolean | undefined
  readonly notifyTaskEvents: boolean | undefined
  readonly queueMode: 'queue' | 'steer' | undefined
}

const toState = (value: RuntimeNamespaceValue): ReachRuntimeState => ({
  security: value.security ? { owner: value.security.owner, allowFrom: value.security.allowFrom ?? [] } : undefined,
  chatSessions: value.chatSessions.length > 0
    ? Object.fromEntries(value.chatSessions.map((entry) => [entry.chat, entry.session]))
    : undefined,
  workspaceCwd: value.workspaceCwd.length > 0
    ? Object.fromEntries(value.workspaceCwd.map((entry) => [entry.chat, entry.cwd]))
    : undefined,
  delivered: value.delivered,
  audit: value.audit,
  silent: value.silent,
  crossSessionNotify: value.crossSessionNotify,
  notifyTaskEvents: value.notifyTaskEvents,
  queueMode: value.queueMode,
})

const toNamespace = (state: ReachRuntimeState): RuntimeNamespaceValue => ({
  security: state.security ? { owner: state.security.owner, allowFrom: [...state.security.allowFrom] } : undefined,
  chatSessions: state.chatSessions ? Object.entries(state.chatSessions).map(([chat, session]) => ({ chat, session })) : [],
  workspaceCwd: state.workspaceCwd ? Object.entries(state.workspaceCwd).map(([chat, cwd]) => ({ chat, cwd })) : [],
  delivered: state.delivered ?? [],
  audit: state.audit ?? [],
  silent: state.silent,
  crossSessionNotify: state.crossSessionNotify,
  notifyTaskEvents: state.notifyTaskEvents,
  queueMode: state.queueMode,
})

/** No-op credentials provider for compositions without the credentials seam. */
const nullCredentials = {
  resolve: async () => undefined,
  describe: async () => ({ configured: false, writable: false }),
  set: async () => {},
  unset: async () => {},
  readRecord: async () => undefined,
  describeRecord: async () => ({ configured: false, writable: false }),
  listRecords: async () => [],
  modifyRecord: async () => undefined,
  deleteRecord: async () => {},
} as unknown as CredentialProvider

/** Structural face of the settings scope we consume (register + owner scope). */
interface SettingsFace {
  register<Namespace extends string, T>(ns: Namespace, schema: unknown, options?: unknown): {
    get(): T | undefined
    watch(callback: (next: T, prev: T) => void | Promise<void>): () => void
    update(patch: object): Promise<void>
    replace(section: object): Promise<void>
  }
}

/** Structural face of the tool registry. */
interface ToolsFace {
  register(definition: unknown): () => void
}

/** Structural face of the command registry. */
interface CommandsFace {
  register(definition: unknown): () => void
  find(agent: unknown, name: string): unknown
  execute(agent: unknown, line: string, images: readonly unknown[], signal: AbortSignal): Promise<{
    readonly result: { readonly kind: 'success' | 'error'; readonly text?: string }
  } | undefined>
}

/**
 * Mount the plugin. Every registration is an effect on this fiber; unload
 * removes the monitors, listeners, service, commands, tool, route, and
 * digest timer together, and `bridge.dispose()` settles pending decisions.
 *
 * @param ctx - host context (any composition; features gate on available services).
 * @param config - raw loader config; defaults applied through {@link resolveConfig}.
 */
export function apply(ctx: Context, config: Config): void {
  const resolved = resolveConfig(config)
  const log = (message: string): void => ctx.logger.info(`dsh-reach: ${message}`)
  const storageDir = resolveStorageDir('')

  const settings = ctx.get('settings') as SettingsFace | undefined
  const tools = ctx.get('tools') as ToolsFace | undefined
  const credentials = ctx.get('credentials') as CredentialProvider | undefined

  // Runtime state: settings-backed when the seam exists, else session-scoped.
  let memoryState: ReachRuntimeState = {
    security: undefined,
    chatSessions: undefined,
    workspaceCwd: undefined,
    delivered: undefined,
    audit: undefined,
    silent: undefined,
    crossSessionNotify: resolved.crossSessionNotify,
    notifyTaskEvents: resolved.notifyTaskEvents,
    queueMode: undefined,
  }
  const configScope = settings?.register('reach', Config, { applies: 'live' })
  const runtimeScope = settings?.register<`reach-runtime`, RuntimeNamespaceValue>(
    'reach-runtime',
    RuntimeStateSchema as unknown as Schema<RuntimeNamespaceValue>,
  )
  const readState = (): ReachRuntimeState =>
    runtimeScope ? toState(runtimeScope.get() ?? {} as RuntimeNamespaceValue) : memoryState
  const writeState = (next: ReachRuntimeState): void => {
    if (runtimeScope) void runtimeScope.replace(toNamespace(next))
    else memoryState = next
  }

  const sessionKey = credentialKey('dsh-reach', 'weixin-session')
  const adapter = new WeixinAdapter({
    baseUrl: resolved.baseUrl,
    cdnBaseUrl: resolved.cdnBaseUrl,
    botType: resolved.botType,
    textChunkLimit: resolved.textChunkLimit,
    storageDir,
    credentials: credentials ?? nullCredentials,
    sessionKey,
    log,
  })
  const telegram = new TelegramAdapter({
    credentials: credentials ?? nullCredentials,
    sessionKey: credentialKey('dsh-reach', 'telegram-token'),
    configuredToken: resolved.telegramToken,
    log,
  })
  const feishu = new FeishuAdapter({
    appId: '',
    appSecret: '',
    requireMention: true,
    credentials: credentials ?? nullCredentials,
    sessionKey: credentialKey('dsh-reach', 'feishu-app'),
    transport: sdkTransport(() => feishu.credentials(), log),
    log,
  })

  const bridge = new Bridge({
    ctx,
    config: resolved,
    adapters: [adapter, telegram, feishu],
    readState,
    writeState,
    log,
  })

  // Decision waterfalls (deferred answerer): first reply wins with the GUI.
  ctx.on('approval/request', bridge.onApproval)
  ctx.on('user-questions/request', bridge.onQuestion)
  // Outbound observation.
  ctx.on('session/event', (session, event) => bridge.onSessionEvent(session.id, event))
  ctx.on('agent/error', ({ agent }) => bridge.onAgentError(agent))
  ctx.on('agent/status', ({ agent, status }) => bridge.onAgentStatus(agent, status))

  // Unload safety: never strand a pending decision.
  ctx.effect(() => () => bridge.dispose(), 'dsh-reach: bridge disposal')

  // Weixin monitor (restarts on token changes; the record-updated listener is
  // disposed WITH the effect — no leak on unload).
  ctx.effect(() => {
    let controller = new AbortController()
    const restart = (): void => {
      controller.abort()
      controller = new AbortController()
      adapter.start(controller.signal, (message) => bridge.handleInbound(message), () => {
        log('weixin session invalid — waiting for re-scan')
      })
    }
    restart()
    const disposeListener = credentials !== undefined
      ? ctx.on('credentials/record-updated', (key: unknown) => {
          if (key === sessionKey) restart()
        })
      : undefined
    return () => {
      controller.abort()
      disposeListener?.()
    }
  }, 'dsh-reach: weixin monitor')

  // Telegram monitor (no-op while unconfigured).
  ctx.effect(() => {
    const tgController = new AbortController()
    telegram.start(tgController.signal, (message) => bridge.handleInbound(message), () => {
      log('telegram session invalid — check the bot token')
    })
    return () => tgController.abort()
  }, 'dsh-reach: telegram monitor')

  // Feishu monitor (no-op until the feishu-app grant is configured).
  ctx.effect(() => {
    const fsController = new AbortController()
    feishu.start(fsController.signal, (message) => bridge.handleInbound(message), () => {
      log('feishu session invalid — check the app credentials')
    })
    return () => fsController.abort()
  }, 'dsh-reach: feishu monitor')

  // Remote service for the settings page.
  void ctx.plugin(function mountReachService(serviceCtx: Context): void {
    new ReachService(serviceCtx, {
      bridge,
      adapter,
      security: {
        owner: () => readState().security?.owner,
        allowFrom: () => readState().security?.allowFrom ?? [],
        setAllowFrom: (users) => {
          bridge.patchSecurity(users)
        },
      },
    })
  })

  // Bridge-owned slash commands (skipped when the registry is absent).
  const commands = ctx.get('commands') as CommandsFace | undefined
  if (commands !== undefined) {
    for (const definition of localCommands(bridge)) {
      ctx.effect(() => commands.register(definition), `dsh-reach: /${definition.name} command`)
    }
  } else {
    log('ctx.commands is not mounted; slash commands are unavailable')
  }

  // Proactive push tool (skipped when the tool registry is absent).
  if (tools !== undefined) {
    ctx.effect(() => tools.register(reachSendTool({
      bridge,
      allowedRoots: [resolved.cwd || process.cwd(), storageDir],
    })), 'dsh-reach: reach_send tool')
  } else {
    log('ctx.tools is not mounted; the reach_send tool is unavailable')
  }

  // Open push surface: ctx.reachPush.notify() + POST /reach/api/push (loopback).
  const push = createReachPush(ctx, { bridge, pushToken: resolved.pushToken })
  ctx.effect(() => ctx.provide('reachPush', push), 'dsh-reach: reachPush service')
  ctx.effect(() => registerPushRoute(ctx, push, resolved.pushToken), 'dsh-reach: /reach/api/push route')

  // Busy-task progress digest (off when digestSec = 0).
  if (resolved.digestSec > 0) {
    ctx.effect(() => {
      const timer = setInterval(() => {
        const user = bridge.firstUser()
        if (!user || bridge.isSilent()) return
        if (bridge.busyCount() > 0) {
          void bridge.sendText(user, '🔄 仍在处理中…')
        }
      }, resolved.digestSec * 1000)
      timer.unref?.()
      return () => clearInterval(timer)
    }, 'dsh-reach: busy digest')
  }

  // Channel-source prompt section (skipped when systemPrompt is absent).
  if (ctx.get('systemPrompt') !== undefined) {
    registerChannelPrompt(ctx, (agent) => bridge.isImSession(agent.session.id))
  }

  // Keep the config scope referenced: the namespace resolves row defaults
  // and the settings page writes land here.
  void configScope
}
