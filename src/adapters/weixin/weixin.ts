/**
 * WeChat iLink channel adapter for `dsh-reach`.
 *
 * Transport port of pan17/dsh-wechat 0.7.2 `dist/weixin/*` +
 * `dist/adapter/inbound.js` (MIT, originally @tencent-weixin/openclaw-weixin /
 * wechat-opencode — https://github.com/pan17/wechat-opencode), rebuilt on the
 * `ChannelAdapter` contract: this module touches no harness service.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { ChannelAdapter, ChannelCapabilities, ChannelStatus, InboundMessage, MessagePart, OutboundRequest } from '../../channel.ts'
import { chunkText } from '../../channel.ts'
import type { CredentialProvider, CredentialKey } from '@deepseek-ai/dsh-credentials'
import { getBotQrcode, getQrcodeStatus, sendMessage, sendTyping, type SendMessageParams } from './protocol.ts'
import { downloadAndDecrypt, parseAesKey } from './media.ts'
import { startMonitor, type SyncBufStore } from './monitor.ts'

export const UploadMediaType = { IMAGE: 1, VIDEO: 2, FILE: 3, VOICE: 4 } as const
const MessageType = { BOT: 2 } as const
const MessageState = { FINISH: 2 } as const
export const MessageItemType = { TEXT: 1, IMAGE: 2, VOICE: 3, FILE: 4, VIDEO: 5 } as const

/** Stored bot session (grant-record payload; opaque JSON to the seam). */
export interface WeixinSessionToken {
  readonly token: string
  readonly baseUrl: string
  readonly accountId: string
  readonly userId: string
  readonly savedAt: string
}

/** Raw iLink update message (transport shape). */
export interface WeixinUpdate {
  readonly from_user_id?: string
  readonly context_token?: string
  readonly item_list?: readonly WeixinItem[]
}

interface WeixinItem {
  readonly type: number
  readonly text_item?: { readonly text?: string }
  readonly image_item?: { readonly media?: { readonly encrypt_query_param?: string; readonly aes_key?: string } }
  readonly file_item?: { readonly media?: { readonly encrypt_query_param?: string; readonly aes_key?: string }; readonly file_name?: string }
  readonly voice_item?: { readonly media?: { readonly encrypt_query_param?: string; readonly aes_key?: string }; readonly text?: string }
  readonly video_item?: { readonly media?: { readonly encrypt_query_param?: string; readonly aes_key?: string } }
  readonly ref_msg?: { readonly title?: string; readonly message_item?: { readonly text_item?: { readonly text?: string } } }
}

export interface WeixinAdapterOptions {
  readonly baseUrl: string
  readonly cdnBaseUrl: string
  readonly botType: string
  readonly textChunkLimit: number
  readonly storageDir: string
  readonly credentials: CredentialProvider
  readonly sessionKey: CredentialKey
  readonly log: (message: string) => void
}

function readSessionToken(adapter: WeixinAdapter): WeixinSessionToken | undefined {
  return adapter.cachedToken
}

/** File-backed sync-buf store under the plugin storage dir. */
class FileSyncBuf implements SyncBufStore {
  private readonly file: string
  constructor(storageDir: string) {
    this.file = path.join(storageDir, 'sync-buf.json')
  }
  load(): string {
    try {
      if (!fs.existsSync(this.file)) return ''
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8')) as { get_updates_buf?: string }
      return data.get_updates_buf ?? ''
    } catch {
      return ''
    }
  }
  save(buf: string): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    fs.writeFileSync(this.file, JSON.stringify({ get_updates_buf: buf }), 'utf-8')
  }
  clear(): void {
    try {
      if (fs.existsSync(this.file)) fs.unlinkSync(this.file)
    } catch {
      // best effort
    }
  }
}

/** Extract the text body from an item list (with quote context when present). */
export function extractText(itemList: readonly WeixinItem[] | undefined): string {
  if (!itemList?.length) return ''
  for (const item of itemList) {
    if (item.type === MessageItemType.TEXT && item.text_item?.text != null) {
      const text = String(item.text_item.text)
      const ref = item.ref_msg
      if (!ref) return text
      const parts: string[] = []
      if (ref.title) parts.push(ref.title)
      if (ref.message_item?.text_item?.text) parts.push(ref.message_item.text_item.text)
      if (!parts.length) return text
      return `[引用: ${parts.join(' | ')}]\n${text}`
    }
    if (item.type === MessageItemType.VOICE && item.voice_item?.text) {
      return item.voice_item.text
    }
  }
  return ''
}

/** Detect an image's real extension from magic bytes; falls back to "jpg". */
export function detectImageExtension(buffer: Buffer): string {
  if (!buffer || buffer.length < 12) return 'jpg'
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'png'
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg'
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return 'gif'
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
    && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return 'webp'
  return 'jpg'
}

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'json', 'js', 'ts', 'py', 'java', 'c', 'cpp', 'h', 'css', 'html',
  'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'sh', 'bash', 'rs', 'go', 'rb',
  'php', 'sql', 'csv', 'log', 'env',
])

function isTextFile(name: string): boolean {
  return TEXT_EXTENSIONS.has(name.split('.').pop()?.toLowerCase() ?? '')
}

export class WeixinAdapter implements ChannelAdapter {
  readonly id = 'weixin'
  readonly capabilities: ChannelCapabilities = {
    text: true,
    image: true,
    file: true,
    voice: false,
    typing: true,
    cards: false, // iLink text ceiling: numbered replies only
  }

  cachedToken: WeixinSessionToken | undefined
  private phase: ChannelStatus['phase'] = 'logged-out'
  private accountId: string | undefined
  private boundUserId: string | undefined
  private monitorRunning = false
  private lastError: string | undefined
  private readonly syncBuf: FileSyncBuf
  /** Per-chat latest context_token: the iLink push pass. */
  private readonly contextTokens = new Map<string, string>()

  constructor(private readonly options: WeixinAdapterOptions) {
    this.syncBuf = new FileSyncBuf(options.storageDir)
    void this.restoreToken()
  }

  private async restoreToken(): Promise<void> {
    const record = await this.options.credentials.readRecord(this.options.sessionKey)
    if (record?.kind === 'grant') {
      this.cachedToken = record.payload as WeixinSessionToken
      this.phase = 'logged-in'
      this.accountId = this.cachedToken.accountId
      this.boundUserId = this.cachedToken.userId
    }
  }

  status(): ChannelStatus {
    return {
      phase: this.phase,
      accountId: this.accountId,
      userId: this.boundUserId,
      monitorRunning: this.monitorRunning,
      lastError: this.lastError,
    }
  }

  start(signal: AbortSignal, onMessage: (message: InboundMessage) => void, onSessionInvalid: () => void): void {
    const token = readSessionToken(this)
    if (!token) return
    this.monitorRunning = true
    this.phase = 'logged-in'
    this.lastError = undefined
    void startMonitor({
      baseUrl: token.baseUrl || this.options.baseUrl,
      token: token.token,
      syncBuf: this.syncBuf,
      abortSignal: signal,
      log: this.options.log,
      onMessage: (raw) => {
        const update = raw as unknown as WeixinUpdate
        const sender = update.from_user_id
        if (!sender) return
        if (typeof update.context_token === 'string' && update.context_token) {
          this.contextTokens.set(sender, update.context_token)
        }
        void this.normalize(update, sender).then(
          (message) => onMessage(message),
          (error: unknown) => this.options.log(`inbound normalize failed: ${String(error)}`),
        )
      },
      onSessionInvalid: () => {
        this.phase = 'failed'
        this.lastError = 'session timeout (-14)'
        onSessionInvalid()
      },
      onSessionRecovered: () => {
        this.phase = 'logged-in'
        this.lastError = undefined
      },
    }).finally(() => {
      this.monitorRunning = false
    })
  }

  private async normalize(update: WeixinUpdate, sender: string): Promise<InboundMessage> {
    const parts: MessagePart[] = []
    const text = extractText(update.item_list)
    if (text) parts.push({ type: 'text', text })
    const mediaItem = (update.item_list ?? []).find((item) => {
      const media = item.image_item?.media ?? item.file_item?.media ?? item.video_item?.media
      return media?.encrypt_query_param !== undefined && media.aes_key !== undefined
    })
    if (mediaItem) {
      const media = (mediaItem.image_item ?? mediaItem.file_item ?? mediaItem.video_item)?.media
      if (media?.encrypt_query_param && media.aes_key) {
        const aesKey = parseAesKey({ aes_key: media.aes_key })
        if (aesKey) {
          try {
            const buffer = await downloadAndDecrypt(media.encrypt_query_param, aesKey, this.options.cdnBaseUrl)
            const tempDir = path.join(this.options.storageDir, 'tempfile')
            fs.mkdirSync(tempDir, { recursive: true })
            if (mediaItem.type === MessageItemType.IMAGE) {
              const ext = detectImageExtension(buffer)
              const filePath = this.saveToTemp(buffer, `image.${ext}`, tempDir)
              parts.push({ type: 'image', path: filePath, mime: `image/${ext}` })
              parts.push({ type: 'text', text: `[收到图片] 文件已保存到: ${filePath}` })
            } else if (mediaItem.type === MessageItemType.FILE) {
              const fileName = mediaItem.file_item?.file_name ?? 'file'
              const filePath = this.saveToTemp(buffer, fileName, tempDir)
              if (isTextFile(fileName)) {
                parts.push({ type: 'file', path: filePath, name: fileName })
                parts.push({ type: 'text', text: `[收到文件: ${fileName}]\n文件路径: ${filePath}\n\n文件内容:\n${buffer.toString('utf-8')}` })
              } else {
                parts.push({ type: 'file', path: filePath, name: fileName })
                parts.push({ type: 'text', text: `[收到文件: ${fileName}] 文件已保存到: ${filePath}\n你可以使用这个路径来读取或处理文件。` })
              }
            } else {
              const filePath = this.saveToTemp(buffer, 'video.mp4', tempDir)
              parts.push({ type: 'file', path: filePath, name: 'video.mp4' })
              parts.push({ type: 'text', text: `[收到视频] 文件已保存到: ${filePath}` })
            }
          } catch (error: unknown) {
            this.options.log(`Media download failed, skipping: ${String(error)}`)
            parts.push({ type: 'text', text: '[收到媒体 - 下载失败]' })
          }
        }
      }
    }
    if (parts.length === 0) parts.push({ type: 'text', text: '[空消息]' })
    return { sender, chatId: sender, parts }
  }

  private saveToTemp(buffer: Buffer, fileName: string, tempDir: string): string {
    const safeName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${fileName.replace(/[^\w.-]/g, '_')}`
    const filePath = path.join(tempDir, safeName)
    fs.writeFileSync(filePath, buffer)
    return filePath
  }

  async send(request: OutboundRequest): Promise<void> {
    const token = readSessionToken(this)
    if (!token) throw new Error('weixin: not logged in')
    const contextToken = this.contextTokens.get(request.chatId)
    for (const part of request.parts) {
      if (part.type === 'text') {
        for (const chunk of chunkText(part.text, this.options.textChunkLimit)) {
          await this.sendText(token, request.chatId, chunk, contextToken)
        }
      } else if (part.type === 'file' || part.type === 'image') {
        await this.sendMedia(token, request.chatId, part)
      }
    }
  }

  private async sendText(token: WeixinSessionToken, to: string, text: string, contextToken?: string): Promise<void> {
    const clientId = `dsh-reach-${crypto.randomUUID()}`
    const body = {
      msg: {
        from_user_id: '',
        to_user_id: to,
        client_id: clientId,
        message_type: MessageType.BOT,
        message_state: MessageState.FINISH,
        ...(contextToken ? { context_token: contextToken } : {}),
        item_list: [{ type: MessageItemType.TEXT, text_item: { text } }],
      },
    }
    const params: SendMessageParams = { baseUrl: token.baseUrl || this.options.baseUrl, token: token.token, body }
    await sendMessage(params)
  }

  private async sendMedia(
    token: WeixinSessionToken,
    to: string,
    part: Extract<MessagePart, { type: 'file' }> | Extract<MessagePart, { type: 'image' }>,
  ): Promise<void> {
    const buffer = fs.readFileSync(part.path)
    const isImage = part.type === 'image' || /\.(png|jpe?g|gif|webp|bmp)$/iu.test(part.path)
    const mediaType = isImage ? UploadMediaType.IMAGE : UploadMediaType.FILE
    const clientId = crypto.randomBytes(16).toString('hex')
    const rawSize = buffer.length
    const rawMd5 = crypto.createHash('md5').update(buffer).digest('hex')
    const aesKey = crypto.randomBytes(16)
    const aesKeyHex = aesKey.toString('hex')
    const encryptedSize = Math.ceil((rawSize + 1) / 16) * 16
    const { getUploadUrl } = await import('./protocol.ts')
    const uploadResp = await getUploadUrl({
      baseUrl: token.baseUrl || this.options.baseUrl,
      token: token.token,
      body: {
        filekey: clientId,
        media_type: mediaType,
        to_user_id: to,
        rawsize: rawSize,
        rawfilemd5: rawMd5,
        filesize: encryptedSize,
        no_need_thumb: true,
        aeskey: aesKeyHex,
      },
    })
    const uploadParam = uploadResp['upload_param']
    if (typeof uploadParam !== 'string' || !uploadParam) throw new Error('getUploadUrl: missing upload_param in response')
    const { uploadToCdn, encryptAesEcb } = await import('./media.ts')
    const encrypted = encryptAesEcb(buffer, aesKey)
    const uploadUrl = typeof uploadResp['upload_full_url'] === 'string'
      ? uploadResp['upload_full_url']
      : `${this.options.cdnBaseUrl}/upload?encrypted_query_param=${encodeURIComponent(uploadParam)}&filekey=${encodeURIComponent(clientId)}`
    const encryptQueryParam = await uploadToCdn({
      buffer: encrypted,
      aesKey,
      uploadParam,
      filekey: clientId,
      cdnBaseUrl: this.options.cdnBaseUrl,
      uploadUrl,
    })
    const aesKeyBase64 = Buffer.from(aesKeyHex).toString('base64')
    const cdnMedia = { encrypt_query_param: encryptQueryParam, aes_key: aesKeyBase64, encrypt_type: 1 }
    const itemList = isImage
      ? [{ type: MessageItemType.IMAGE, image_item: { media: cdnMedia, aeskey: cdnMedia.aes_key, url: cdnMedia.encrypt_query_param, mid_size: encryptedSize } }]
      : [{
          type: MessageItemType.FILE,
          file_item: { media: cdnMedia, file_name: part.type === 'file' ? part.name : 'image', len: String(rawSize) },
        }]
    await sendMessage({
      baseUrl: token.baseUrl || this.options.baseUrl,
      token: token.token,
      body: {
        msg: {
          from_user_id: '',
          to_user_id: to,
          client_id: clientId,
          message_type: MessageType.BOT,
          message_state: MessageState.FINISH,
          ...(this.contextTokens.get(to) ? { context_token: this.contextTokens.get(to) } : {}),
          item_list: itemList,
        },
      },
    })
  }

  async login(renderQr: (qr: string) => void, signal: AbortSignal): Promise<string> {
    this.phase = 'waiting-scan'
    this.lastError = undefined
    const qrResp = await getBotQrcode({ baseUrl: this.options.baseUrl, botType: this.options.botType })
    const qrcodeUrl = qrResp['qrcode_img_content']
    const qrcode = qrResp['qrcode']
    if (typeof qrcodeUrl !== 'string' || typeof qrcode !== 'string') throw new Error('getBotQrcode: missing qrcode fields')
    renderQr(qrcodeUrl)
    let currentQrcode = qrcode
    let refreshCount = 0
    const deadline = Date.now() + 5 * 60_000
    while (Date.now() < deadline && !signal.aborted) {
      const statusResp = await getQrcodeStatus({ baseUrl: this.options.baseUrl, qrcode: currentQrcode })
      const status = statusResp['status']
      if (status === 'scaned') this.phase = 'scanned'
      else if (status === 'expired') {
        refreshCount++
        if (refreshCount > 3) throw new Error('QR code expired multiple times, please retry')
        const newQr = await getBotQrcode({ baseUrl: this.options.baseUrl, botType: this.options.botType })
        const newQrcodeUrl = newQr['qrcode_img_content']
        const newQrcode = newQr['qrcode']
        if (typeof newQrcodeUrl !== 'string' || typeof newQrcode !== 'string') throw new Error('getBotQrcode: missing refreshed qrcode fields')
        currentQrcode = newQrcode
        renderQr(newQrcodeUrl)
      } else if (status === 'confirmed') {
        const token = statusResp['bot_token']
        const accountId = statusResp['ilink_bot_id']
        const userId = statusResp['ilink_user_id']
        if (typeof token !== 'string' || !token) throw new Error('login: missing bot_token')
        const session: WeixinSessionToken = {
          token,
          baseUrl: typeof statusResp['baseurl'] === 'string' && statusResp['baseurl'] ? statusResp['baseurl'] : this.options.baseUrl,
          accountId: typeof accountId === 'string' ? accountId : '',
          userId: typeof userId === 'string' ? userId : '',
          savedAt: new Date().toISOString(),
        }
        await this.options.credentials.modifyRecord(this.options.sessionKey, async () => ({ kind: 'grant', payload: session }))
        this.cachedToken = session
        this.accountId = session.accountId
        this.boundUserId = session.userId
        this.phase = 'logged-in'
        this.syncBuf.clear()
        return session.accountId
      }
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }
    throw new Error('Login timeout (5 minutes)')
  }

  async logout(): Promise<void> {
    await this.options.credentials.deleteRecord(this.options.sessionKey)
    this.cachedToken = undefined
    this.accountId = undefined
    this.boundUserId = undefined
    this.phase = 'logged-out'
    this.syncBuf.clear()
  }

  async typing(chatId: string): Promise<void> {
    const token = readSessionToken(this)
    if (!token) return
    await sendTyping({
      baseUrl: token.baseUrl || this.options.baseUrl,
      token: token.token,
      body: { ilink_user_id: chatId, typing_ticket: crypto.randomUUID(), status: 1 },
    })
  }
}

/** Resolve the plugin storage dir: config override, else $DSH_HOME/dsh-reach, else os tmp. */
export function resolveStorageDir(configured: string): string {
  if (configured) return configured
  const home = process.env['DSH_HOME']
  if (home) return path.join(home, 'dsh-reach')
  return path.join(os.tmpdir(), 'dsh-reach')
}
