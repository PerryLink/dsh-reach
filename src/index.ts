/**
 * `dsh-reach` — multi-channel decision & remote-control bridge for
 * DeepSeek Harness.
 *
 * Host half: mounts the weixin channel adapter, the decision bridge
 * (deferred-answerer listeners on `approval/request` /
 * `user-questions/request`), the `reach` Remote service, the bridge-owned
 * slash commands (official `ctx.commands` registry), the `reach_send` tool,
 * and the channel-source prompt section.
 *
 * Function plugin — no default export (the Loader unwraps
 * `exports.default ?? exports`).
 *
 * @module dsh-reach
 */

import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
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
import { Bridge, type ReachRuntimeState } from './bridge.ts'
import type { AuditEntry } from './security.ts'
import { localCommands } from './commands.ts'
import { reachSendTool } from './tool.ts'
import { registerChannelPrompt } from './prompt.ts'
import { ReachService } from './service.ts'
import { createReachPush, registerPushRoute } from './push.ts'
import type {} from './types.ts'

export const name = 'reach'

/** Hard services: settings (config + runtime namespaces), tools, credentials. */
export const inject = ['settings', 'tools', 'credentials']

export { Config, resolveConfig, type Config as ReachConfig, type ResolvedConfig } from './config.ts'
export { WeixinAdapter } from './adapters/weixin/weixin.ts'
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
})

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

/**
 * Mount the plugin. Every registration is an effect on this fiber, so
 * unload/hot-reload removes the adapter monitor, the bridge listeners, the
 * service, the commands, and the tool together.
 *
 * @param ctx - context carrying settings + tools + credentials.
 * @param config - raw loader config; defaults applied through {@link resolveConfig}.
 */
export function apply(ctx: Context, config: Config): void {
  const resolved = resolveConfig(config)
  const log = (message: string): void => ctx.logger.info(`dsh-reach: ${message}`)
  const storageDir = resolveStorageDir('')

  // Settings namespaces: `reach` (config surface) and `reach-runtime` (state).
  const configScope = ctx.settings.register('reach', Config, { applies: 'live' })
  const runtimeScope = ctx.settings.register<`reach-runtime`, RuntimeNamespaceValue>(
    'reach-runtime',
    RuntimeStateSchema as unknown as Schema<RuntimeNamespaceValue>,
  )

  const sessionKey = credentialKey('dsh-reach', 'weixin-session')
  const adapter = new WeixinAdapter({
    baseUrl: resolved.baseUrl,
    cdnBaseUrl: resolved.cdnBaseUrl,
    botType: resolved.botType,
    textChunkLimit: resolved.textChunkLimit,
    storageDir,
    credentials: ctx.credentials,
    sessionKey,
    log,
  })

  const bridge = new Bridge({
    ctx,
    config: resolved,
    adapter,
    readState: () => toState(runtimeScope.get() ?? {}),
    writeState: (next) => {
      void runtimeScope.replace(toNamespace(next))
    },
    log,
  })

  // Decision waterfalls (deferred answerer): first reply wins with the GUI.
  ctx.on('approval/request', bridge.onApproval)
  ctx.on('user-questions/request', bridge.onQuestion)
  // Outbound observation.
  ctx.on('session/event', (session, event) => bridge.onSessionEvent(session.id, event))
  ctx.on('agent/error', ({ agent }) => bridge.onAgentError(agent))
  ctx.on('agent/status', ({ agent, status }) => bridge.onAgentStatus(agent, status))

  // Channel monitor: restart on token changes (login/logout/refresh).
  let controller = new AbortController()
  const startMonitor = (): void => {
    controller = new AbortController()
    adapter.start(controller.signal, (message) => bridge.handleInbound(message), () => {
      log('weixin session invalid — waiting for re-scan')
    })
  }
  ctx.effect(() => {
    startMonitor()
    const onRecord = (key: unknown): void => {
      if (key === sessionKey) {
        controller.abort()
        startMonitor()
      }
    }
    ctx.on('credentials/record-updated', onRecord)
    return () => {
      controller.abort()
    }
  }, 'dsh-reach: weixin monitor')

  // Remote service for the settings page.
  void ctx.plugin(function mountReachService(serviceCtx: Context): void {
    new ReachService(serviceCtx, {
      bridge,
      adapter,
      security: {
        owner: () => toState(runtimeScope.get() ?? {}).security?.owner,
        allowFrom: () => toState(runtimeScope.get() ?? {}).security?.allowFrom ?? [],
        setAllowFrom: (users) => {
          bridge.patchSecurity(users)
        },
      },
    })
  })

  // Bridge-owned slash commands (official registry: GUI discovery + audit).
  const commands = ctx.get('commands')
  if (commands !== undefined) {
    for (const definition of localCommands(bridge)) {
      ctx.effect(() => commands.register(definition), `dsh-reach: /${definition.name} command`)
    }
  } else {
    log('ctx.commands is not mounted; slash commands are unavailable')
  }

  // Proactive push tool.
  ctx.effect(() => ctx.tools.register(reachSendTool({
    bridge,
    allowedRoots: [resolved.cwd || process.cwd(), storageDir],
  })), 'dsh-reach: reach_send tool')

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

  // Channel-source prompt section.
  registerChannelPrompt(ctx, (agent) => bridge.isImSession(agent.session.id))

  // Keep the config scope referenced: the namespace resolves row defaults
  // and the settings page writes land here.
  void configScope
}
