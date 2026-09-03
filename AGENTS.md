# AGENTS.md

Standalone DeepSeek Harness plugin repository (`dsh-reach`). Development follows the dsh-plugin-guide skill and the official plugin contract; this file records repo-local decisions. The design authority for the rebuild is `docs/design/03-rebuild-direction-and-plan.md` (competitor research + official contract verification + community experience).

## Layout

- `src/index.ts` — function-plugin contract (`name`/`inject`/`Config`/`apply`; NO default export). Injects `settings` + `tools` + `credentials`; mounts the `reach` + `reach-runtime` settings namespaces, the weixin channel adapter + monitor, the decision bridge (deferred-answerer waterfall listeners on `approval/request` / `user-questions/request` with `next()` delegate / `rejected` fail-closed / keep-waiting policies), the `reach` Remote service (status/config/relogin/logout, registered through the hand-written TYPERT manifest — no runtime decorators), the bridge-owned slash commands (official `ctx.commands` registry + `execute()` passthrough), the `reach_send` tool, and the channel-source prompt section.
- `src/adapters/weixin/` — the iLink transport (protocol/auth flow/monitor with PR #161 `-14` recovery/media AES). Ported from pan17/dsh-wechat 0.7.2 (MIT); adapters touch no harness service.
- `src/bridge.ts` — routing, decision capture (stable `#token` ids + `P{n}` numbering, narrowed capture, multi-card bare-reply guard, `/rp` `/rq`), per-user ordered outbound queue with window budget + FIFO re-queue, silent/notify gates, busy queue/steer.
- `src/config.ts` — Schemastery schema + explicit `resolveConfig`. Current-API notes: Schemastery 3.18 has no `.nullable()`/`.optional()`; absent object keys pass through `undefined`; leaf defaults only; bound checks throw in `resolveConfig` (fail loud).
- `src/service.ts` / `src/wire.ts` / `src/typert.host.ts` / `src/client/` — the `reach` Remote namespace (zod v4 codecs shared by both faces), the host TYPERT manifest, and the settings tab (`settings.plugins.tab`, en/zh dictionaries, scoped stylesheet).
- `scripts/prepare.mjs` — single build entry (tsc declarations → `lib/types`, tsdown → `lib/index.js` + `lib/typert.host.js` + `lib/client.js`); `typescript` + `tsdown` + `zod` are regular `dependencies` because the git channel's `prepare` builds with production deps alone.
- `tests/` — vitest over the decorator-free modules (bridge behavior regression for the 19-patch semantics, decision parsing, config bounds, wire codecs, chunking); the built-artifact entry contract is asserted by `verify:artifacts.mjs` (oxc/vite do not lower legacy decorators, so service/index are exercised through the built bundle).

## Hard rules applied here

- **Waterfall discipline.** The decision-answerer listeners hold the waterfall promise only while a card is pending; timeout/delegate paths always resolve through `next()` (delegate), `'rejected'` (fail-closed), or the request's own `signal` (`'cancelled'`). Never swallow a request without a documented outcome.
- **Model-visible ⟺ logged.** IM inbound goes through `agent.followup`/`agent.inject` with `source: {kind:'plugin', plugin:'dsh-reach'}` (durable `user/message`); decision replies ride the native `approval/decided` audit pair. No custom downstream session-event types.
- **Security defaults fail closed.** Sender allowlists empty = deny all; first QR scan = owner; strangers are logged, never answered (optional `notifyRejected`). Tokens live in `ctx.credentials` (`credentialKey('dsh-reach', ...)`) and never cross the browser line; settings schemas declare secret slots.
- **Fail loud.** `resolveConfig` re-validates bounds; invalid row config fails the profile load.
- **Effect-owning lifecycles.** Every registration (namespace, command, tool, listeners, timers, pollers, routes) rides the plugin fiber; teardown order lives in single disposers where order matters.
- **No hardcoded tunables.** Every knob is a validated `Config` field documented in `cordis.patch.yml` and the five READMEs.
- **scoped-cordis single identity.** Only `@deepseek-ai/cordis` (peer + dev, aligned to the host); mixing unscoped `cordis` splits declaration merging. tsdown keeps `@deepseek-ai/*` external.
- **`dsh-plugin-dev check` deviation (documented).** The `manifest-peers` rule demands exact `/client`-subpath peerDependencies; npm/pnpm reject subpath specifiers as package names, so the root peers (`dsh-api-remotes`, `dsh-client-locale`, `dsh-client-ui-settings`) carry the contract (dsh-talk precedent). The remaining 12 checks pass with 0 warnings; the one deviation is intentional and installability is authoritative.

## Checks

`pnpm run typecheck && pnpm run typecheck:ci && pnpm test && pnpm run lint && pnpm run build && pnpm run verify:self-contained && pnpm run verify:artifacts && pnpm run check:readmes && pnpm pack`. The plain `typecheck` resolves the local checkout through tsconfig `paths`; `typecheck:ci` resolves the npm-published faces — keep both green. CI 标配: Scorecard, compat (bare-import + scratch-profile mount + keyless smoke + uninstall), release gate (changelog names the tag version).

## Docs

- Five-language READMEs (`README.md` is the source of truth) — keep all five in sync (`pnpm run check:readmes`).
- GitHub topics: `dsh`, `dsh-plugin`, `deepseek-harness`, `deepseek`, `cordis`, `wechat`, `ilink`, `im`, `bridge`, `approval`, `notify`, `remote-control` (mirror `package.json` keywords).
- License is Apache-2.0. `THIRD_PARTY_NOTICES.md` documents build-time dependencies; the weixin adapter's upstream credits (pan17/dsh-wechat MIT, @tencent-weixin/openclaw-weixin MIT) are added when the port lands in Phase 1.
