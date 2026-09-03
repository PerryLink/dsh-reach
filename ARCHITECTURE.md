# dsh-reach — Architecture

> Design authority: `docs/design/03-rebuild-direction-and-plan.md` (this file is
> the thin map; the plan carries the competitor research, the official contract
> verification table, and the phased roadmap).

## What it is

Any workspace/session's decision cards (approval / user-question) pushed to IM
channels, answerable from chat; a session console; and an open push service.
WeChat iLink is the first channel; Feishu (interactive button cards) and
Telegram (text cards) are the adapter-contract validators; QQ / DingTalk /
WeCom are v2 drop-in foundations on the same contract, registered through the
open `reachChannels` channel registry.

## Shape (Phase 1+)

```
channel-core ── MessagePart normalization · ChannelAdapter capabilities
    ▲
    │ (adapters never touch harness services; payloads → structured parts)
channel registry ── reachChannels service: priority routing, monitor
    │               attach/detach, third-party registerChannel()
bridge (host half) ── chat↔session routing · deferred-answerer waterfall
    │   listeners (approval/request, user-questions/request) · stable card
    │   numbering · narrowed decision capture · per-user ordered outbound
    │   queue · audit · outbound file fence · open push service · cron
adapters/{weixin, feishu, telegram, qq, dingtalk, wecom} · client
    (settings page + pairing)
```

## Loose coupling: load/unload & degradation matrix

The plugin declares **zero hard dependencies** (`inject: []`); every feature
gates on `ctx.get(...)` and degrades when its service is absent, so the
bundle loads in ANY composition (web, headless, minimal) and unloads
completely (every registration is an effect; `bridge.dispose()` settles
pending decisions).

| Feature | Service | Degradation when absent | Unload behavior |
|---|---|---|---|
| Runtime state persistence | `settings` | in-memory, session-scoped | effect-owned namespace registration removed |
| Config namespace `reach` | `settings` | skipped | same |
| `reach_send` tool | `tools` | skipped | `tools.register` disposer |
| Slash commands | `commands` | skipped (log warn) | per-command disposers |
| Channel tokens | `credentials` | row-config tokens only (`telegramToken`); no token store | adapters read per operation, nothing to remove |
| Channel monitors | (none) | bridge-owned per registered channel; no-op until a token/grant exists; `-14` → session-invalid surfacing | `startMonitor` disposers (AbortController + `credentials/record-updated` listener) collected and called by `bridge.dispose()` |
| Channel registry `reachChannels` | (none) | always provided; third-party `registerChannel()` returns its own disposer | `ctx.provide` disposer; bridge detaches all monitors on dispose |
| Push API route | `webServer` | skipped | route disposer |
| Push service `reachPush` | (none) | always provided | `ctx.provide` disposer |
| Channel prompt section | `systemPrompt` | skipped | registered through the plugin fiber |
| Pending decision cards | (none) | — | `bridge.dispose()` resolves `'unavailable'` (approval) / empty answer (question) so the answerer chain keeps flowing |
| Busy digest timer | (none) | off when `digestSec = 0` | `clearInterval` in effect cleanup |

Verified by `tests/lifecycle.spec.ts` (full composition mount/unmount,
no-service minimal composition, settings-less memory-state degradation) and
the `dispose()` regression in `tests/bridge.spec.ts`.

## Channel registry (v2 extension point)

Third-party plugins drop a channel into the bridge through the `reachChannels`
cordis service without touching bridge internals:

```ts
const reach = ctx.get('reachChannels') as {
  registerChannel(entry: ChannelRegistration): () => void
}
const dispose = reach.registerChannel({
  id: 'mychat',
  adapter,                       // implements ChannelAdapter
  priority: 3,                   // higher wins; weixin catch-all sits at 0
  ownsChatId: (chatId) => chatId.startsWith('mc:'),
  startMonitor: (handleInbound) => {
    const controller = new AbortController()
    adapter.start(controller.signal, handleInbound, onInvalid)
    return () => controller.abort()
  },
})
```

- Routing = predicate scan in priority order over channel-normalized chat ids
  (each adapter prefixes its ids: `qq:`, `dt:`, `wc:`, `oc_`, numeric =
  Telegram, everything else = Weixin catch-all). The bridge's
  `adapterFor(chatId)` and every outbound send go through the registry.
- Monitors are bridge-owned: `startMonitor` runs once per attachment (also
  for channels registered after construction) and its disposer runs on
  unregister or `bridge.dispose()` — no stranded listeners, no leaks.
- Built-in channels register through the exact same path (`src/index.ts`),
  so all six adapters get identical treatment; `bridge.channelStatuses()`
  feeds the settings-page multi-channel view.

## Official seams (verified against the checkout, 2026-09-03)

| Concern | Mechanism |
|---|---|
| Decision answering | `approval/request` / `user-questions/request` Cordis waterfalls (Agent-scoped, outcome vocabulary `allowed-once/rejected/cancelled/unavailable`, native `approval/asked`+`approval/decided` audit) |
| Commands | `ctx.commands.register` (own) + `ctx.commands.execute` (native passthrough, logs `command/run`/`command/done`) |
| Config | plugin row (Schemastery) + `ctx.settings.register('reach', schema)` namespace (secret slots redacted on wire) |
| Credentials | `ctx.credentials` branded keys `credentialKey('dsh-reach', <id>)` |
| Inbound messages | `agent.followup(createUserMessage({source:{kind:'plugin',plugin:'dsh-reach'}}))` (idle) / `agent.inject` (busy) |
| Outbound events | `session/event` (`turn/end`, `assistant/message`, ...), `agent/error` |
| Tools | `defineTool` (`reach_send` etc.) |
| Channel prompt | `ctx.systemPrompt.context({name, order, text})` |
| Status projection | `ctx.sessionProjections` registration |
| HTTP routes | `ctx.webServer.register` (QR/status/push endpoints) |
| Packaging | `dsh.bundle.patch → ./cordis.patch.yml`, profile composer |

## Rules

- WeChat text ceiling: P{n} numbered cards are the only decision form on
  iLink; button cards exist only on Feishu (QQ/DingTalk/WeCom are text-card
  drop-in foundations until interactive cards land there).
- Chat ids are channel-normalized with an owned prefix per channel; a
  channel only routes ids its predicate owns (catch-all = Weixin, always
  last in priority).
- Stable card tokens derive from the request identity; the delivered set is
  persisted through `ctx.storage`.
- Delegate on timeout = `next()`; fail-closed = `'rejected'`; abort =
  `'cancelled'`; policy `never` ⇒ no cards.
