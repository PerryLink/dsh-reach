/**
 * `dsh-reach`, browser half: mounts the `reach` Remote contribution and
 * registers the settings tab (`settings.plugins.tab`, id `reach`). All data
 * arrives through the `remote.reach` namespace.
 *
 * @module dsh-reach/client
 */

import type { Context } from '@deepseek-ai/cordis'
// Type-only: declares the client `remote` service (with `$mount`) on the
// cordis Context — the published assembly package that owns the merge.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the 'settings.plugins.tab' SlotMap declaration in.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { ReachConfigInput, ReachConfigResult, ReachStatus } from '../wire.ts'
import { REACH_REMOTE } from './remote.ts'
import { en, zh, type ReachLocaleKey } from './locales.ts'
import { installReachStyles } from './styles.ts'
import type { ReachSettingsTabInjected } from './ReachSettingsTab.tsx'
import { ReachSettingsTab } from './ReachSettingsTab.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.reach': ReachLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.reach'

/** Plugin name: matches the package name, the graph row id, and the bundle id. */
export const name = 'dsh-reach'

/** Services the browser half reads; `remote.reach` appears once the contribution mounts. */
export const inject = ['slots', 'locale', 'remote']

/**
 * Minimal structural contract of the slot registry this client uses. Declared
 * locally because the registry's owning package differs across host lines;
 * the runtime contract is structural.
 */
interface SlotsFace {
  inject(slot: string, factory: () => unknown): unknown
  register(options: Record<string, unknown>, component: unknown): unknown
}

/**
 * Browser plugin body: dictionaries, the scoped stylesheet, the Remote
 * contribution mount, and the settings tab.
 *
 * @param ctx - client root context.
 */
export async function apply(ctx: Context): Promise<void> {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-reach: dictionaries')
  ctx.effect(() => installReachStyles(), 'dsh-reach: stylesheet')

  // $mount registers the 'remote.reach' namespace service and owns its removal.
  await ctx.remote.$mount(REACH_REMOTE)

  const slots = ctx.get('slots') as SlotsFace
  ctx.inject(['remote.reach'], (scope) => {
    const reach = scope.remote.reach
    const t = scope.locale.bind(NS)
    const unwrap = <T>(result: RemoteResult<T>): T => {
      if (!result.ok) {
        throw new Error(`reach call failed: ${result.error.code}: ${result.error.message}`)
      }
      return result.value
    }
    const api: ReachSettingsTabInjected = {
      status: async () => unwrap<ReachStatus>(await reach.status()),
      applyConfig: async (input: ReachConfigInput) => {
        const result = unwrap<ReachConfigResult>(await reach.config(input))
        return result.reason !== undefined ? { ok: result.ok, reason: result.reason } : { ok: result.ok }
      },
      relogin: async () => {
        const result = unwrap<ReachConfigResult>(await reach.relogin())
        return result.reason !== undefined ? { ok: result.ok, reason: result.reason } : { ok: result.ok }
      },
      logout: async () => {
        const result = unwrap<ReachConfigResult>(await reach.logout())
        return result.reason !== undefined ? { ok: result.ok, reason: result.reason } : { ok: result.ok }
      },
    }

    slots.inject('settings.plugins.tab', () => slots.register({
      name: 'settings.plugins.tab',
      id: 'reach',
      order: 50,
      label: () => t('tab'),
      locale: NS,
      inject: (): ReachSettingsTabInjected => api,
    }, ReachSettingsTab))
  })
}
