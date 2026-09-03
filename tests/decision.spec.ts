import { describe, expect, it } from 'vitest'
import { chunkText } from '../src/channel.ts'
import { parseDecisionReply, shortToken } from '../src/decision.ts'

describe('channel chunking', () => {
  it('splits long text on newlines', () => {
    const chunks = chunkText('a'.repeat(10) + '\n' + 'b'.repeat(10), 12)
    expect(chunks.length).toBe(2)
    expect(chunks[0]).toContain('(1/2)')
  })
  it('returns the whole text when short', () => {
    expect(chunkText('short', 100)).toEqual(['short'])
  })
})

describe('decision parsing', () => {
  it('derives stable short tokens', () => {
    expect(shortToken('12345678-90ab-cdef-1234-567890abcdef')).toBe('#123456')
  })
  it('parses numbered approval replies', () => {
    expect(parseDecisionReply('P1=1')).toEqual({ kind: 'by-number', number: 1, question: false, value: '1' })
  })
  it('parses numbered question replies', () => {
    expect(parseDecisionReply('P2=Q1=2')).toEqual({ kind: 'by-number', number: 2, question: true, value: '2' })
  })
  it('parses token replies', () => {
    expect(parseDecisionReply('#ab12cd=2')).toEqual({ kind: 'by-token', token: '#ab12cd', value: '2' })
  })
  it('parses bare replies', () => {
    expect(parseDecisionReply('1')).toEqual({ kind: 'bare', value: '1' })
  })
  it('parses rp/rq', () => {
    expect(parseDecisionReply('/rp')).toEqual({ kind: 'rp' })
    expect(parseDecisionReply('/rq')).toEqual({ kind: 'rq' })
  })
  it('returns undefined for plain chat text', () => {
    expect(parseDecisionReply('帮我看看这个任务')).toBeUndefined()
  })
})
