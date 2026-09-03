/**
 * The open push surface: a Cordis service (`ctx.reachPush.notify`) plus a
 * loopback HTTP endpoint (`POST /reach/api/push`, optional bearer token).
 * Other plugins can consume `reach/sent` for delivery observation — the
 * "通知中台" pattern from dsh-notifier/chicheng-push, scoped to this bridge.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Bridge } from './bridge.ts'
import type { ReachPushService } from './types.ts'

export interface PushOptions {
  readonly bridge: Bridge
  readonly pushToken: string
}

/** Build the push service instance. */
export function createReachPush(ctx: Context, options: PushOptions): ReachPushService {
  const service: ReachPushService = {
    async notify(user, text) {
      const target = user ?? options.bridge.firstUser()
      if (!target) return { ok: false, reason: 'no authorized IM user' }
      if (!options.bridge.isAuthorized(target)) return { ok: false, reason: `sender not authorized: ${target}` }
      if (text.trim().length === 0) return { ok: false, reason: 'empty text' }
      try {
        await options.bridge.sendText(target, text)
        ctx.emit('reach/sent', { user: target, text, ok: true })
        return { ok: true }
      } catch (error: unknown) {
        ctx.emit('reach/sent', { user: target, text, ok: false, reason: String(error) })
        return { ok: false, reason: String(error) }
      }
    },
  }
  return service
}

/** Register the loopback HTTP push endpoint; returns the route disposer. */
export function registerPushRoute(ctx: Context, service: ReachPushService, pushToken: string): () => void {
  const webServer = ctx.get('webServer')
  if (!webServer) return () => {}
  return webServer.register({
    kind: 'exact',
    path: '/reach/api/push',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      const address = req.socket.remoteAddress
      if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, reason: 'loopback only' }))
        return
      }
      if (pushToken && req.headers['authorization'] !== `Bearer ${pushToken}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, reason: 'unauthorized' }))
        return
      }
      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, reason: 'POST only' }))
        return
      }
      let body = ''
      for await (const chunk of req) body += String(chunk)
      let parsed: { text?: string; user?: string }
      try {
        parsed = JSON.parse(body) as { text?: string; user?: string }
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, reason: 'invalid JSON' }))
        return
      }
      if (typeof parsed.text !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, reason: 'missing text' }))
        return
      }
      const result = await service.notify(parsed.user, parsed.text)
      res.writeHead(result.ok ? 200 : 502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
    },
  })
}
