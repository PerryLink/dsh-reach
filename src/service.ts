/**
 * `ReachService`: the `reach` Remote namespace the settings page calls —
 * status snapshot, live config switches, and the QR login/logout flows.
 */

import { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Bridge } from './bridge.ts'
import type { ChannelAdapter } from './channel.ts'
import type { ReachConfigInput, ReachConfigResult, ReachStatus } from './wire.ts'

export interface ReachServiceOptions {
  readonly bridge: Bridge
  readonly adapter: ChannelAdapter
  readonly security: {
    readonly owner: () => string | undefined
    readonly allowFrom: () => readonly string[]
    readonly setAllowFrom: (users: readonly string[]) => void
  }
}

export class ReachService extends TypertRemoteService {
  private readonly bridge: Bridge
  private readonly adapter: ChannelAdapter
  private readonly security: ReachServiceOptions['security']
  private loginController: AbortController | undefined

  constructor(ctx: Context, options: ReachServiceOptions) {
    super(ctx, 'reach')
    this.bridge = options.bridge
    this.adapter = options.adapter
    this.security = options.security
  }

  // Wire method `reach/status` — registered by the hand-written TYPERT
  // manifest (src/typert.host.ts); the bundle ships no runtime decorators
  // (the loader resolves strict descriptors from the manifest, mirroring the
  // dsh-talk proven layout).
  status(): ReachStatus {
    const channel = this.adapter.status()
    const user = this.bridge.firstUser()
    return {
      phase: channel.phase,
      accountId: channel.accountId,
      userId: channel.userId,
      monitorRunning: channel.monitorRunning,
      lastError: channel.lastError,
      pendingCards: user ? this.bridge.pendingCount(user) : 0,
      outboundQueue: user ? this.bridge.outboundLength(user) : 0,
      silent: this.bridge.isSilent(),
      crossSessionNotify: this.bridge.notifyGate() === 'on',
      notifyTaskEvents: this.bridge.taskEventsGate() === 'on',
      queueMode: this.bridge.queueMode(),
      channels: [...this.bridge.channelStatuses()],
    }
  }

  // Wire method `reach/config`.
  config(input: ReachConfigInput): ReachConfigResult {
    if (input.crossSessionNotify !== undefined) this.bridge.setCrossSessionNotify(input.crossSessionNotify)
    if (input.notifyTaskEvents !== undefined) this.bridge.setNotifyTaskEvents(input.notifyTaskEvents)
    if (input.silent !== undefined) this.bridge.setSilent(input.silent)
    if (input.queueMode !== undefined) this.bridge.setQueueMode(input.queueMode)
    if (input.allowFrom !== undefined) this.security.setAllowFrom(input.allowFrom)
    return { ok: true }
  }

  // Wire method `reach/relogin`.
  async relogin(signal: AbortSignal): Promise<ReachConfigResult> {
    this.loginController?.abort()
    const controller = new AbortController()
    this.loginController = controller
    const abort = (): void => controller.abort()
    signal.addEventListener('abort', abort, { once: true })
    try {
      await this.adapter.login(() => {}, controller.signal)
      return { ok: true }
    } catch (error: unknown) {
      return { ok: false, reason: String(error) }
    } finally {
      signal.removeEventListener('abort', abort)
      this.loginController = undefined
    }
  }

  // Wire method `reach/logout`.
  async logout(): Promise<ReachConfigResult> {
    await this.adapter.logout()
    return { ok: true }
  }
}
