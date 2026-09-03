/**
 * `dsh-reach` — multi-channel decision & remote-control bridge for
 * DeepSeek Harness (Phase 0 scaffold).
 *
 * Phase 1 fills this entry with the real bridge: the deferred-answerer
 * listeners on `approval/request` / `user-questions/request` (card mirror +
 * IM reply resolves the waterfall), the `commands.execute()` passthrough,
 * the channel adapters (weixin iLink first), the outbound ordered queue, and
 * the per-channel security (owner + allowlist fail-closed + audit).
 *
 * Function plugin — no default export (the Loader unwraps
 * `exports.default ?? exports`).
 *
 * @module dsh-reach
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-settings'
import { Config, resolveConfig } from './config.ts'

export const name = 'reach'

/** Hard services: the settings seam (config namespace) and the tool registry. */
export const inject = ['settings', 'tools']

export { Config, resolveConfig, type Config as ReachConfig, type ResolvedConfig } from './config.ts'

/**
 * Mount the plugin: the `reach` settings namespace, the `/reach` slash
 * command (optional `commands` composition), and the `reach_ping` tool
 * placeholder. Every registration is an effect on this fiber, so
 * unload/hot-reload removes all of them together.
 *
 * @param ctx - context carrying settings + tools.
 * @param config - raw loader config; defaults applied through {@link resolveConfig}.
 */
export function apply(ctx: Context, config: Config): void {
  const resolved = resolveConfig(config)

  // Settings namespace: the settings page (Phase 1 client half) and the
  // runtime read/write path share this schema with the profile row.
  ctx.settings.register('reach', Config, {
    applies: 'live',
  })

  // Slash command: the commands registry is optional in minimal compositions.
  const commands = ctx.get('commands')
  if (commands !== undefined) {
    ctx.effect(() => commands.register({
      name: 'reach',
      description: 'Show the reach bridge status.',
      handler: () => ({
        kind: 'success',
        text: `dsh-reach bridge mounted. crossSessionNotify=${String(resolved.crossSessionNotify)} notifyTaskEvents=${String(resolved.notifyTaskEvents)} cardTimeoutSec=${String(resolved.cardTimeoutSec)}`,
      }),
    }), 'dsh-reach: /reach command')
  } else {
    ctx.logger.warn('dsh-reach: ctx.commands is not mounted; slash commands are unavailable')
  }

  // Placeholder tool proving the defineTool contract; replaced by the real
  // channel tool set (reach_send etc.) in Phase 1.
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'reach_ping',
    description: 'Ping the dsh-reach bridge and echo the given text.',
    parameters: {
      text: { type: 'string', required: true, description: 'Text to echo.' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `reach bridge alive: ${args.text}`
    },
  })), 'dsh-reach: reach_ping tool')
}
