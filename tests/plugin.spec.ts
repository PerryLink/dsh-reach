import { describe, expect, it } from 'vitest'
import * as plugin from '../src/index.ts'
import { Config, resolveConfig } from '../src/config.ts'

describe('dsh-reach entry face', () => {
  it('exports the function-plugin contract without a default export', () => {
    expect('default' in plugin).toBe(false)
    expect(plugin.name).toBe('reach')
    expect(Array.isArray(plugin.inject)).toBe(true)
    expect(typeof plugin.apply).toBe('function')
    expect(plugin.Config).toBe(Config)
  })

  it('declares the settings and tools hard services', () => {
    expect(plugin.inject).toEqual(['settings', 'tools'])
  })
})

describe('dsh-reach config resolution', () => {
  it('fills leaf defaults for an empty raw config', () => {
    const resolved = resolveConfig({})
    expect(resolved.crossSessionNotify).toBe(true)
    expect(resolved.notifyTaskEvents).toBe(false)
    expect(resolved.cardTimeoutSec).toBe(1800)
    expect(resolved.textChunkLimit).toBe(4000)
    expect(resolved.silent).toBe(false)
    expect(resolved.cwd).toBe('')
  })

  it('preserves explicit values', () => {
    const resolved = resolveConfig({
      crossSessionNotify: false,
      notifyTaskEvents: true,
      cardTimeoutSec: 600,
      textChunkLimit: 2000,
      silent: true,
      cwd: 'D:\\projects',
    })
    expect(resolved.crossSessionNotify).toBe(false)
    expect(resolved.notifyTaskEvents).toBe(true)
    expect(resolved.cardTimeoutSec).toBe(600)
    expect(resolved.textChunkLimit).toBe(2000)
    expect(resolved.silent).toBe(true)
    expect(resolved.cwd).toBe('D:\\projects')
  })

  it('fails loud on a negative cardTimeoutSec', () => {
    expect(() => resolveConfig({ cardTimeoutSec: -1 })).toThrow(/cardTimeoutSec/)
  })

  it('fails loud on an out-of-range textChunkLimit', () => {
    expect(() => resolveConfig({ textChunkLimit: 0 })).toThrow(/textChunkLimit/)
    expect(() => resolveConfig({ textChunkLimit: 100001 })).toThrow(/textChunkLimit/)
  })
})
