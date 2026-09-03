import { describe, expect, it } from 'vitest'
import { Config, resolveConfig } from '../src/config.ts'

// The full entry face (name/inject/apply/no-default) is asserted by
// `scripts/verify-artifacts.mjs` against the BUILT lib/index.js; unit tests
// cover the decorator-free modules only (the oxc transform does not lower
// legacy decorators, so service.ts is exercised through the built artifact).

describe('dsh-reach config resolution', () => {
  it('fills leaf defaults for an empty raw config', () => {
    const resolved = resolveConfig({})
    expect(resolved.crossSessionNotify).toBe(true)
    expect(resolved.notifyTaskEvents).toBe(false)
    expect(resolved.cardTimeoutSec).toBe(1800)
    expect(resolved.approvalOnTimeout).toBe('delegate')
    expect(resolved.textChunkLimit).toBe(4000)
    expect(resolved.silent).toBe(false)
    expect(resolved.cwd).toBe('')
    expect(resolved.baseUrl).toBe('https://ilinkai.weixin.qq.com')
    expect(resolved.cdnBaseUrl).toBe('https://novac2c.cdn.weixin.qq.com/c2c')
    expect(resolved.botType).toBe('3')
    expect(resolved.allowFrom).toEqual([])
    expect(resolved.queueMode).toBe('queue')
    expect(resolved.maxQueue).toBe(50)
    expect(resolved.sendBudget).toBe(10)
    expect(resolved.windowSec).toBe(60)
    expect(resolved.denyUnauthorized).toBe(false)
  })

  it('preserves explicit values', () => {
    const resolved = resolveConfig({
      crossSessionNotify: false,
      notifyTaskEvents: true,
      cardTimeoutSec: 600,
      approvalOnTimeout: 'reject',
      textChunkLimit: 2000,
      silent: true,
      cwd: 'D:\\projects',
      allowFrom: ['a@im.wechat'],
      queueMode: 'steer',
      sendBudget: 5,
    })
    expect(resolved.crossSessionNotify).toBe(false)
    expect(resolved.notifyTaskEvents).toBe(true)
    expect(resolved.cardTimeoutSec).toBe(600)
    expect(resolved.approvalOnTimeout).toBe('reject')
    expect(resolved.textChunkLimit).toBe(2000)
    expect(resolved.silent).toBe(true)
    expect(resolved.cwd).toBe('D:\\projects')
    expect(resolved.allowFrom).toEqual(['a@im.wechat'])
    expect(resolved.queueMode).toBe('steer')
    expect(resolved.sendBudget).toBe(5)
  })

  it('fails loud on out-of-range values', () => {
    expect(() => resolveConfig({ cardTimeoutSec: -1 })).toThrow(/cardTimeoutSec/)
    expect(() => resolveConfig({ textChunkLimit: 0 })).toThrow(/textChunkLimit/)
    expect(() => resolveConfig({ maxQueue: 0 })).toThrow(/maxQueue/)
    expect(() => resolveConfig({ sendBudget: 0 })).toThrow(/sendBudget/)
    expect(() => resolveConfig({ windowSec: 0 })).toThrow(/windowSec/)
    expect(() => resolveConfig({ approvalOnTimeout: 'explode' as never })).toThrow(/approvalOnTimeout/)
    expect(() => resolveConfig({ queueMode: 'teleport' as never })).toThrow(/queueMode/)
  })

  it('exposes the schema for the settings namespace', () => {
    expect(typeof Config).toBe('function')
    expect(Config).toBeTruthy()
  })
})
