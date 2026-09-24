/**
 * `dsh-reach` — multi-channel decision & remote-control bridge for
 * DeepSeek Harness.
 *
 * Loose-coupling design: the plugin declares NO hard service dependencies
 * (`inject` is empty). Every feature gates on `ctx.get(...)` / `ctx.inject`
 * and degrades:
 * - no `settings` service → the generated settings form is not suppressed
 *   (the plugin's own `settings.plugins.tab` page needs no host service);
 * - runtime state is session-scoped either way (see `apply`);
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
import { credentialKey, type CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type { InboundMessage } from './channel.ts'
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
import {
  QqAdapter, restTransport as qqRestTransport, normalizeQqEvent, parseQqChatId, stripCqTags,
  type QqAppGrant, type QqEvent, type QqTransport,
} from './adapters/qq/qq.ts'
import {
  DingTalkAdapter, webhookTransport as dingtalkWebhookTransport, dingTalkSign, normalizeDingTalkEvent,
  type DingTalkEvent, type DingTalkTransport, type DingTalkWebhookGrant,
} from './adapters/dingtalk/dingtalk.ts'
import {
  WeComAdapter, webhookTransport as wecomWebhookTransport, decryptWeCom, decryptEchoStr, parseWeComXml, normalizeWeComEvent,
  type WeComTransport, type WeComWebhookGrant,
} from './adapters/wecom/wecom.ts'
import { ChannelRegistry, type ChannelRegistration, type ReachChannelsFace } from './registry.ts'
import { Bridge, type ReachRuntimeState } from './bridge.ts'
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
export {
  QqAdapter, qqRestTransport, normalizeQqEvent, parseQqChatId, stripCqTags,
  type QqAppGrant, type QqEvent, type QqTransport,
}
export {
  DingTalkAdapter, dingtalkWebhookTransport, dingTalkSign, normalizeDingTalkEvent,
  type DingTalkEvent, type DingTalkTransport, type DingTalkWebhookGrant,
}
export {
  WeComAdapter, wecomWebhookTransport, decryptWeCom, decryptEchoStr, parseWeComXml, normalizeWeComEvent,
  type WeComTransport, type WeComWebhookGrant,
}
export {
  ChannelRegistry, type ChannelRegistration, type ReachChannelsFace, type RegistryEvent,
} from './registry.ts'
export { Bridge, type ReachRuntimeState } from './bridge.ts'
export {
  parseDecisionReply, renderApprovalCard, renderQuestionCard, shortToken,
  type PendingApproval, type PendingCard, type PendingQuestion,
} from './decision.ts'
export { chunkText, type ChannelAdapter, type InboundMessage, type MessagePart } from './channel.ts'

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

/**
 * Structural face of the settings service we consume. The host's service is
 * `SettingsForms`, whose public surface is `configure` / `describe` /
 * `prepareDocument` / `update` / `replace` / `mutate` — `register` belonged to
 * the replaced `SettingsProvider` seam and no longer exists, so anything that
 * still calls it fails the whole mount with `settings?.register is not a
 * function`. Only `configure` is read here, and only through this shape, so a
 * service without it degrades instead of throwing.
 */
interface SettingsFace {
  configure(presentation: { auto?: boolean }, owner?: unknown): () => void
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

  // Consumer — consume the optional host services through `ctx.get` and
  // degrade each feature surface when its seam is absent.
  const tools = ctx.get('tools') as ToolsFace | undefined
  const credentials = ctx.get('credentials') as CredentialProvider | undefined

  // Runtime state is session-scoped: the durable form it used to ride (a
  // `settings.register` namespace) no longer exists on the host line this
  // package targets, and `reach-runtime` was plugin-private bookkeeping rather
  // than user-editable configuration, so it has no honest landing point on the
  // Config form. State therefore resets with the process; what has to outlive a
  // restart already lives elsewhere — channel tokens in `ctx.credentials`, and
  // the user-facing toggles below in the row config.
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
  const readState = (): ReachRuntimeState => memoryState
  const writeState = (next: ReachRuntimeState): void => {
    memoryState = next
  }
  // Adapter construction comes first: a throw inside a constructor must not
  // leave half-built registrations behind (A7-②), and the settings-page policy
  // above is claimed through an effect only once this body has run.
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
  const telegramKey = credentialKey('dsh-reach', 'telegram-token')
  const feishuKey = credentialKey('dsh-reach', 'feishu-app')
  const qqKey = credentialKey('dsh-reach', 'qq-app')
  const dingtalkKey = credentialKey('dsh-reach', 'dingtalk-webhook')
  const wecomKey = credentialKey('dsh-reach', 'wecom-webhook')
  const telegram = new TelegramAdapter({
    credentials: credentials ?? nullCredentials,
    sessionKey: telegramKey,
    configuredToken: resolved.telegramToken,
    log,
  })
  const feishu = new FeishuAdapter({
    appId: '',
    appSecret: '',
    requireMention: true,
    credentials: credentials ?? nullCredentials,
    sessionKey: feishuKey,
    transport: sdkTransport(() => feishu.credentials(), log),
    log,
  })
  const qq = new QqAdapter({
    credentials: credentials ?? nullCredentials,
    sessionKey: qqKey,
    transport: qqRestTransport(() => qq.credentials(), log),
    log,
  })
  const dingtalk = new DingTalkAdapter({
    credentials: credentials ?? nullCredentials,
    sessionKey: dingtalkKey,
    transport: dingtalkWebhookTransport(() => dingtalk.grant(), log),
    log,
  })
  const wecom = new WeComAdapter({
    credentials: credentials ?? nullCredentials,
    sessionKey: wecomKey,
    transport: wecomWebhookTransport(() => ({ webhookUrl: wecom.webhook() }), log),
    log,
  })

  // Settings surface. `settings.register(ns, schema, options)` — which used to
  // mount the `reach` and `reach-runtime` namespaces here — was deleted from
  // the host's settings service; under the replacement contract a plugin's
  // editable surface is its own `Config`, addressed by the profile entry id
  // and projected field by field through `.volatile()`. This plugin keeps its
  // settings page (the `reach` Remote service + `settings.plugins.tab`), so the
  // only thing left to claim is the presentation policy that suppresses the
  // host's auto-generated duplicate form. Reached through the optional seam
  // (still no hard dependency), and shape-guarded rather than assumed, because
  // a composition may mount no settings service at all.
  ctx.inject(['settings'], (scope) => {
    const settings = scope.get('settings') as SettingsFace | undefined
    if (typeof settings?.configure !== 'function') return
    scope.effect(() => settings.configure({ auto: false }, ctx.fiber), 'dsh-reach: settings presentation')
  })

  // Open channel registry: every channel (built-in + third-party) gets the
  // same routing, outbound, and monitor treatment through one extension point.
  const registry = new ChannelRegistry()
  const monitorFor = (
    id: string,
    channel: { start(signal: AbortSignal, onMessage: (message: InboundMessage) => void, onSessionInvalid: () => void): void },
    invalidNote: string,
    restartKey: ReturnType<typeof credentialKey> | undefined,
  ): Pick<ChannelRegistration, 'startMonitor'> => ({
    startMonitor: (handleInbound) => {
      let controller = new AbortController()
      const restart = (): void => {
        controller.abort()
        controller = new AbortController()
        channel.start(controller.signal, handleInbound, () => log(`${id} ${invalidNote}`))
      }
      restart()
      const disposeListener = credentials !== undefined && restartKey !== undefined
        ? ctx.on('credentials/record-updated', (key: unknown) => {
            if (key === restartKey) restart()
          })
        : undefined
      return () => {
        controller.abort()
        disposeListener?.()
      }
    },
  })
  registry.registerChannel({ id: 'telegram', adapter: telegram, priority: 1, ownsChatId: (chatId) => /^[-0-9]+$/u.test(chatId), ...monitorFor('telegram', telegram, 'session invalid — check the bot token', telegramKey) })
  registry.registerChannel({ id: 'feishu', adapter: feishu, priority: 2, ownsChatId: (chatId) => chatId.startsWith('oc_'), ...monitorFor('feishu', feishu, 'session invalid — check the app credentials', feishuKey) })
  registry.registerChannel({ id: 'qq', adapter: qq, priority: 3, ownsChatId: (chatId) => chatId.startsWith('qq:'), ...monitorFor('qq', qq, 'session invalid — check the qq-app grant', qqKey) })
  registry.registerChannel({ id: 'dingtalk', adapter: dingtalk, priority: 3, ownsChatId: (chatId) => chatId.startsWith('dt:'), ...monitorFor('dingtalk', dingtalk, 'session invalid — check the webhook grant', dingtalkKey) })
  registry.registerChannel({ id: 'wecom', adapter: wecom, priority: 3, ownsChatId: (chatId) => chatId.startsWith('wc:'), ...monitorFor('wecom', wecom, 'session invalid — check the webhook grant', wecomKey) })
  registry.registerChannel({ id: 'weixin', adapter, priority: 0, ownsChatId: () => true, ...monitorFor('weixin', adapter, 'session invalid — waiting for re-scan', sessionKey) })

  const bridge = new Bridge({
    ctx,
    config: resolved,
    adapters: [],
    registry,
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

  // Unload safety: never strand a pending decision; also stops every
  // channel monitor the bridge attached (registry watch + startMonitor).
  ctx.effect(() => () => bridge.dispose(), 'dsh-reach: bridge disposal')

  // Service Provider — the open extension point: third-party plugins call
  // `ctx.get('reachChannels')?.registerChannel(...)` to drop a channel in.
  ctx.effect(() => ctx.provide('reachChannels', registry as ReachChannelsFace), 'dsh-reach: reachChannels service')

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
}
