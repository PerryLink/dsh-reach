import { describe, expect, it } from 'vitest'
import { reachStatusSchema } from '../src/wire.ts'

describe('wire codecs', () => {
  it('parses a status payload', () => {
    const parsed = reachStatusSchema.parse({
      phase: 'logged-in',
      monitorRunning: true,
      pendingCards: 1,
      outboundQueue: 0,
      silent: false,
      crossSessionNotify: true,
      notifyTaskEvents: false,
      queueMode: 'queue',
      channels: [
        { id: 'weixin', phase: 'logged-in', accountId: 'bot', monitorRunning: true },
        { id: 'qq', phase: 'unconfigured', monitorRunning: false },
      ],
    })
    expect(parsed.phase).toBe('logged-in')
    expect(parsed.channels).toHaveLength(2)
    expect(parsed.channels[0]?.id).toBe('weixin')
  })

  it('rejects status payloads without the channels list', () => {
    expect(() => reachStatusSchema.parse({ phase: 'logged-in', monitorRunning: true, pendingCards: 0, outboundQueue: 0, silent: false, crossSessionNotify: true, notifyTaskEvents: false, queueMode: 'queue' }))
      .toThrow(/channels/u)
  })
})
