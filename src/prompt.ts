/**
 * Channel-source prompt injection: sessions driven from IM get a short
 * context line; GUI-driven sessions never see it. Model-visible input stays
 * reconstructable because the source rides the durable `user/message`
 * `source: { kind: 'dsh-reach' }` marker (model-visible ⟺ logged). The
 * producer-owned `kind` is declared by module augmentation in `bridge.ts`;
 * the host's `MessageSourceMap` has no catch-all `plugin` kind.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'

/** Register the channel-context system-prompt section. */
export function registerChannelPrompt(ctx: Context, isImSession: (agent: Agent) => boolean): void {
  ctx.inject(['systemPrompt'], (scope: Context) => {
    scope.systemPrompt.context({
      name: 'reach:channel',
      order: scope.systemPrompt.getContextOrder('APPROVAL_POLICY'),
      text: (context) => {
        const agent = context.agent
        if (agent === undefined || !isImSession(agent)) return ''
        return 'The user is chatting through an IM bridge (dsh-reach). Keep replies concise; the channel renders plain text only.'
      },
    })
  })
}
