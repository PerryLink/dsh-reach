/**
 * Channel contract for `dsh-reach`: what a channel adapter must provide and
 * the normalized message vocabulary the bridge consumes.
 *
 * Red lines (learned from @wsz987/dsh-channels): adapters never touch
 * harness services — they receive/send `MessagePart`s only; every platform
 * payload is normalized to structured parts at the adapter boundary.
 */

/** One normalized inbound/outbound content part. */
export type MessagePart =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image'; readonly path: string; readonly mime?: string }
  | { readonly type: 'file'; readonly path: string; readonly name: string }
  | { readonly type: 'voice'; readonly path: string; readonly transcript?: string }

/** One inbound message from a channel. */
export interface InboundMessage {
  /** Channel-scoped sender id (e.g. iLink `xxx@im.wechat`). */
  readonly sender: string
  /** Channel-scoped chat id (same as sender for DMs; group id for groups). */
  readonly chatId: string
  /** Structured parts, in submission order. */
  readonly parts: readonly MessagePart[]
  /** Stable upstream message id when the channel provides one. */
  readonly upstreamId?: string
}

/** One outbound send request the adapter must fulfill. */
export interface OutboundRequest {
  /** Target chat id. */
  readonly chatId: string
  /** Parts to deliver; text parts may already be chunked by the bridge. */
  readonly parts: readonly MessagePart[]
}

/** Advertised capabilities a channel supports. */
export interface ChannelCapabilities {
  readonly text: true
  readonly image: boolean
  readonly file: boolean
  readonly voice: boolean
  readonly typing: boolean
  /** Interactive button cards — false on iLink (text ceiling). */
  readonly cards: boolean
}

/** Channel state surfaced to the settings page. */
export interface ChannelStatus {
  readonly phase: 'unconfigured' | 'logged-out' | 'waiting-scan' | 'scanned' | 'logged-in' | 'failed'
  readonly accountId: string | undefined
  readonly userId: string | undefined
  readonly monitorRunning: boolean
  readonly lastError: string | undefined
}

/** One channel adapter: transport only, no harness access. */
export interface ChannelAdapter {
  /** Stable channel id (e.g. `weixin`). */
  readonly id: string
  readonly capabilities: ChannelCapabilities

  /** Current status snapshot. */
  status(): ChannelStatus

  /**
   * Start the inbound long-poll/monitor loop. Calls `onMessage` for every
   * normalized inbound message; `onSessionInvalid` when the transport token
   * dies (recoverable via re-scan). The adapter owns reconnects and backoff.
   */
  start(signal: AbortSignal, onMessage: (message: InboundMessage) => void, onSessionInvalid: () => void): void

  /** Send one outbound request; resolves when the channel accepted it. */
  send(request: OutboundRequest): Promise<void>

  /** Begin a QR login flow; resolves with the account id on success. */
  login(renderQr: (qr: string) => void, signal: AbortSignal): Promise<string>

  /** Forget the stored session token (logout). */
  logout(): Promise<void>

  /** Send a typing indicator when supported. */
  typing(chatId: string): Promise<void>
}

/** Split one long text into channel-sized chunks on grapheme boundaries. */
export function chunkText(text: string, limit: number): string[] {
  if (limit < 1) throw new TypeError('chunk limit must be positive')
  if (text.length <= limit) return [text]
  const chunks: string[] = []
  let rest = text
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n', limit)
    if (cut <= 0) cut = limit
    chunks.push(rest.slice(0, cut))
    rest = rest.slice(cut)
  }
  if (rest.length > 0) chunks.push(rest)
  return chunks.map((chunk, index) => chunks.length > 1 ? `(${index + 1}/${chunks.length}) ${chunk}` : chunk)
}
