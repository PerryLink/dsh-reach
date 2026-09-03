/**
 * The `reach_send` model tool: proactive push of text/files to an authorized
 * IM user through the bridge's ordered outbound queue. File parts are fenced:
 * only the session workspace and the configured storage dir are readable.
 */

import { readFileSync } from 'node:fs'
import { resolve, relative, isAbsolute } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Bridge } from './bridge.ts'

export interface ReachSendOptions {
  readonly bridge: Bridge
  readonly allowedRoots: readonly string[]
}

/** Build the `reach_send` tool definition; returns the ToolDefinition value. */
export function reachSendTool(options: ReachSendOptions): ReturnType<typeof defineTool> {
  return defineTool({
    name: 'reach_send',
    description: 'Push a text message (and optionally a workspace file) to the authorized IM user through the dsh-reach bridge.',
    parameters: {
      text: { type: 'string', required: true, description: 'Message text to send.' },
      filePath: { type: 'string', description: 'Optional absolute path of a workspace file to attach.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          queued: { type: 'boolean', required: true },
          reason: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.queued ? `已通过 IM 通道发送：${value.reason}` : `发送失败：${value.reason}` }],
    },
    async execute(args) {
      const filePath = args.filePath
      if (filePath !== undefined) {
        if (!isAbsolute(filePath)) return { queued: false, reason: 'filePath must be absolute' }
        const inside = options.allowedRoots.some((root) => {
          const rel = relative(root, resolve(filePath))
          return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
        })
        if (!inside) return { queued: false, reason: 'filePath outside the allowed workspace roots' }
        try {
          readFileSync(filePath)
        } catch (error: unknown) {
          return { queued: false, reason: `unreadable file: ${String(error)}` }
        }
      }
      const user = options.bridge.firstUser()
      if (!user) return { queued: false, reason: 'no authorized IM user (owner not paired yet)' }
      const lines = [args.text]
      if (filePath !== undefined) lines.push(`[文件] ${filePath}`)
      void options.bridge.sendText(user, lines.join('\n'))
      return { queued: true, reason: 'message queued to the IM channel' }
    },
  })
}
