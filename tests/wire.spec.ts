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
    })
    expect(parsed.phase).toBe('logged-in')
  })
})
