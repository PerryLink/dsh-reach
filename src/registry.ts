/**
 * Open channel registry for `dsh-reach`: the extension point third-party
 * plugins use to drop a channel into the bridge without touching bridge
 * internals. Built-in channels (weixin/telegram/feishu) and the v2 channels
 * (qq/dingtalk/wecom) register through the exact same path, so every adapter
 * gets identical routing, outbound, and monitor treatment.
 *
 * The registry is published as the `reachChannels` cordis service; its
 * `registerChannel(entry)` returns the disposer that removes the channel
 * again. Chat ids are channel-normalized (each adapter prefixes its ids,
 * e.g. `qq:…`, `dt:…`, `wc:…`), and routing is a predicate scan in priority
 * order — the catch-all (weixin) always sits last.
 */

import type { ChannelAdapter, InboundMessage } from './channel.ts'

/** One registered channel: adapter + routing predicate + optional monitor bootstrap. */
export interface ChannelRegistration {
  /** Stable channel id (e.g. `qq`). Unique inside the registry. */
  readonly id: string
  /** The adapter instance (transport only, no harness access). */
  readonly adapter: ChannelAdapter
  /** Routing priority; higher wins. Built-ins: weixin 0, telegram 1, feishu 2. */
  readonly priority?: number
  /** True when the channel-normalized chat id belongs to this channel. */
  readonly ownsChatId: (chatId: string) => boolean
  /**
   * Optional monitor bootstrap: called once when the channel is attached to
   * a bridge; receives the bridge's inbound handler and must return the
   * disposer that tears the monitor down (abort controllers, listeners).
   * Channels without a monitor (e.g. webhook-only senders) omit it.
   */
  readonly startMonitor?: (handleInbound: (message: InboundMessage) => void) => () => void
}

export type RegistryEvent = 'add' | 'remove'

/**
 * Insertion-ordered channel table. `register` sorts by priority (stable for
 * equal priorities, first-registered first); `resolve` returns the first
 * entry whose predicate owns the chat id, so the catch-all channel must have
 * the lowest priority.
 */
export class ChannelRegistry {
  private entries: ChannelRegistration[] = []
  private readonly listeners = new Set<(entry: ChannelRegistration, event: RegistryEvent) => void>()

  /** Register a channel; the returned disposer removes it again. */
  registerChannel(entry: ChannelRegistration): () => void {
    if (this.entries.some((existing) => existing.id === entry.id)) {
      throw new Error(`dsh-reach: channel "${entry.id}" is already registered`)
    }
    const next = [...this.entries, entry].sort((a, b) =>
      (b.priority ?? 0) - (a.priority ?? 0) || this.entries.indexOf(a) - this.entries.indexOf(b))
    this.entries = next
    this.emit(entry, 'add')
    let disposed = false
    return () => {
      if (disposed) return
      disposed = true
      this.entries = this.entries.filter((existing) => existing !== entry)
      this.emit(entry, 'remove')
    }
  }

  /** Resolve the channel owning one chat id (first predicate match, priority order). */
  resolve(chatId: string): ChannelRegistration | undefined {
    return this.entries.find((entry) => entry.ownsChatId(chatId))
  }

  /** All registered channels, priority order. */
  list(): readonly ChannelRegistration[] {
    return [...this.entries]
  }

  /** One channel by id. */
  get(id: string): ChannelRegistration | undefined {
    return this.entries.find((entry) => entry.id === id)
  }

  /** Subscribe to registrations/removals; returns the unsubscribe disposer. */
  watch(listener: (entry: ChannelRegistration, event: RegistryEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(entry: ChannelRegistration, event: RegistryEvent): void {
    for (const listener of [...this.listeners]) listener(entry, event)
  }
}

/** Structural face of the `reachChannels` cordis service. */
export interface ReachChannelsFace {
  /** Register a channel adapter; the disposer removes it and its monitor. */
  registerChannel(entry: ChannelRegistration): () => void
  /** All registered channels (priority order). */
  list(): readonly ChannelRegistration[]
  /** One channel by id. */
  get(id: string): ChannelRegistration | undefined
  /** Watch registrations/removals. */
  watch(listener: (entry: ChannelRegistration, event: RegistryEvent) => void): () => void
}
