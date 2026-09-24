# Changelog

All notable changes to this project are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project adheres to [Semantic Versioning](https://semver.org/).


## [Unreleased]

### Changed

- The host pins move to `0.1.7-rc.1`: every `@deepseek-ai/dsh-*` dev/test pin moves from `0.1.7-alpha.2`, and `dshWorkshop.compatibility.dshVersions` records `0.1.7-rc.1` (appended — the timeline stays append-only). Re-verified against that host line. The declared peer ranges and `engines.dsh` are deliberately **unchanged**: `0.1.7-rc.1` already satisfies their `>=0.1.7-0 <0.2.0` clause, and the family keeps peer ranges wider than the verified line rather than narrowing them to it.

## [0.1.11] - 2026-09-23

### Fixed

- The two inbound-message injections no longer fail to type-check on the `0.1.7` line: the host removed the shared `{ kind: 'plugin', plugin }` message-source catch-all from BOTH layers that used to accept it — the type layer (`MessageSourceMap`) and the persistence layer, which refuses a physical row whose source kind is `'plugin'`, so a cast cannot smuggle one past admission. The bridge now declares this producer's **own** message-source kind in `src/bridge.ts` through a `declare module '@deepseek-ai/dsh-llm'` augmentation — the same producer-owned pattern the host's own producers use — and uses it at both write sites, the busy-path `agent.inject` and the idle-path `agent.followup`. Both stay durable `user/message` rows, so model-visible ⟺ logged is unchanged.

### Changed

- Move the `@deepseek-ai/dsh-*` dev/test pins to `0.1.7-alpha.2` and re-verify both rulers against that line: `typecheck` resolves the local harness checkout through `tsconfig.json` `paths`, `typecheck:ci` the published `0.1.7-alpha.2` faces.
- Every declared host range — `engines.dsh` and the 26 `peerDependencies` bands — gains the `|| >=0.1.7-0 <0.2.0` arm, so the bands now admit the `0.1.7` prerelease line. Under semver's prerelease rule a range whose only prerelease comparators sit on earlier version tuples cannot admit a later alpha, so the previous three-clause form excluded the very host this release targets. No existing arm was removed or narrowed.
- `dshWorkshop.compatibility.dshVersions` gains `0.1.7-alpha.2`, and all five READMEs name the verified line.
- The compat workflow now installs the `0.1.7-alpha.2` host instead of `0.1.6-alpha.2`, so the scheduled end-to-end run exercises the line this package declares.

## [0.1.10] - 2026-09-19

### Added

- `pnpm run check:lockfile` (`scripts/check-lockfile-drift.mjs`) fails fast when `package.json` and `pnpm-lock.yaml` disagree; the probe is read-only and the documented checks chain runs it alongside the other gates.

### Changed

- The release workflow now publishes through **npm trusted publishing** (OIDC) instead of the long-lived `NPM_TOKEN` secret: `setup-node` no longer sets `registry-url` (its empty `_authToken` line made the registry answer 404 on PUT), npm is upgraded to >= 11.5.1 before publishing, and the "NPM_TOKEN is not set -> skip" guard is gone so a missing publisher cannot turn a release into a silent no-op.
## [0.1.9] - 2026-09-18

### Changed

- Carry both Typert strict-codec faces on the wire descriptors: the published `schema` field (0.1.5-rc.2 line) and the `create` factory the 0.1.6-alpha.1 checkout materializes lazily on first use. Both typecheck rulers stay green.
- Widen the 26 `@deepseek-ai/dsh-*` peer ranges with the 0.1.6 tuple clause (`|| >=0.1.6-0 <0.2.0`), so a host on the `0.1.6-alpha.*` line no longer reports an unsatisfied peer. The dev/test pins stay on the published `0.1.5-rc.2` line on purpose: that is the face the `typecheck:ci` ruler measures, while the plain `typecheck` ruler measures the checkout through the `tsconfig.json` `paths`. The five READMEs now quote the three-clause range.
- Declare `dsh.manifestVersion: 1` and `engines.dsh` (the same three-clause range as the peers), so the ecosystem index and the future enforcement face see a manifest contract instead of a bundle-only block.

### Fixed

- A refused write to the `reach-runtime` settings namespace was discarded (`void runtimeScope.replace(...)`), so silent mode, session mappings and audit entries could stop persisting with no signal at all. The rejection is now reported on the plugin logger (`dsh-reach: runtime settings write failed: …`).
- The `reach` and `reach-runtime` namespaces were registered before the channel adapters were constructed. A constructor throw therefore stranded two registered namespaces on a fiber whose mount never completed. Both registrations now happen after the last adapter is built, which a regression test pins with an injected constructor failure (plus a control case proving the normal path still registers both).
- Reading the runtime namespace crashed (`Cannot read properties of undefined (reading 'length')`) when a scope reported "no section yet": the `?? {}` fallback handed `toState` an object without the array fields. The fallback is now a well-formed empty namespace value.

## [0.1.8] - 2026-09-12

### Changed

- Rename the four translated READMEs to `README-<lang>.md`. npm selects the package-page readme as the first markdown file matching its `{README,README.*}` glob (`@npmcli/package-json`, publish path), and that glob order puts `README.<lang>.md` ahead of `README.md` — so npm was serving the Simplified-Chinese file for this package too (measured on 15/15 sampled packages of the family). The new names sit outside the glob, so the English source is served again. No content changed apart from the language-switcher link each translation holds to its siblings, and the repo readme gate still passes. Takes effect with the next release; an already-published version cannot gain a corrected readme retroactively.
- Pin the `@deepseek-ai/dsh-*` dev/test dependencies to the published `0.1.5-rc.2` line and record `0.1.5-rc.2` in `dshWorkshop.compatibility.dshVersions`; the monthly Compat workflow now runs against `0.1.5-rc.2`. The peer range `>=0.1.2-rc.1 <0.2.0 || >=0.1.5-alpha.1 <0.2.0` is unchanged, so no supported host line is dropped.

### Fixed

- The release workflow claimed provenance but never passed the flag: it runs `npm publish --access public`, and npm only attests a token-based publish when `--provenance` is given explicitly. The publish step is now `npm publish --access public --provenance`, matching `dsh-github` and `dsh-plugin-guide`. Takes effect from the next release; an already-published version cannot gain attestations retroactively.

### Docs

- Repair the CHANGELOG structure: a second `## [Unreleased]` heading sat between `[0.1.4]` and `[0.1.1]`, two version sections were out of order, and the top `[Unreleased]` entry ran straight into the next heading. The orphaned entries describe `be59114` (the open `reachChannels` registry plus the QQ/DingTalk/WeCom v2 foundations), which is an ancestor of `v0.1.2` and not of `v0.1.1`, so they now live under `[0.1.2]` where they shipped. Every other entry is unchanged and only moved; the two oldest headings now use the same `- <date>` form as the rest.

## [0.1.7] - 2026-09-10

### Fixed

- Four `@deepseek-ai/*` packages were marked optional peers while `lib/index.js` imports them statically: `dsh-credentials`, `dsh-llm`, `dsh-session` and `dsh-typert-protocol`. A static top-level import is resolved at load, so a bare install (which does not install optional peers) failed with `ERR_MODULE_NOT_FOUND: Cannot find package '@deepseek-ai/dsh-credentials'`. They are now required peers, matching `dsh-draw` and `dsh-github`, which value-import `dsh-credentials` the same way. Verified by packing the tarball into an empty project: `import('dsh-reach')` now resolves (was `ERR_MODULE_NOT_FOUND`).

- The Compat **bare-import** job could never reach its assertion: the scratch project had no `pnpm-workspace.yaml`, so `pnpm add` exited 1 with `ERR_PNPM_IGNORED_BUILDS` (the peer tree pulls in `protobufjs`, which has an install script). Its message goes to stdout, which the step redirects to `/dev/null`, so `set -e` killed the step silently. The scratch project now declares the same `allowBuilds` allowlist the sibling repos use.

## [0.1.6] - 2026-09-10

### Changed

- Pin the `@deepseek-ai/dsh-*` dev/test dependencies to the published `0.1.5-rc.1` line and record `0.1.5-rc.1` in `dshWorkshop.compatibility.dshVersions`; the monthly Compat workflow now runs against `0.1.5-rc.1`. The peer range `>=0.1.2-rc.1 <0.2.0 || >=0.1.5-alpha.1 <0.2.0` is unchanged, so no supported host line is dropped.

### Docs

- Refresh the five-language README compatibility baseline to `dsh-v0.1.5-rc.1` (verified 2026-09-10).

## [0.1.5] - 2026-09-09

### Changed

- Align the `@deepseek-ai/dsh-*` peer ranges to `>=0.1.2-rc.1 <0.2.0 || >=0.1.5-alpha.1 <0.2.0` and pin the dev/test dependencies to the published `0.1.5-alpha.1` line: adaptation to DeepSeek Harness `dsh-v0.1.5-alpha.1` (session format V3, `ctx.agent` removal, `Inbox` type-only interface); runtime behavior is unchanged for every supported host line.
- Record `0.1.5-alpha.1` in `dshWorkshop.compatibility.dshVersions`.

### Docs

- Refresh the five-language README compatibility baseline to `dsh-v0.1.5-alpha.1` (verified 2026-09-09).

## [0.1.4] - 2026-09-07

### Docs

- Fix the DSH plugin badge URL: shields.io rejects the four-segment static badge form with "404 badge not found"; the label now uses the documented double-dash form (`dsh--plugin`), rendering identically; no behavior change.

## [0.1.3] - 2026-09-07

### Fixed

- dshWorkshop manifest: declare the valid `restart-profile` lifecycle activation for omdsh hub intake.
- Align the `@deepseek-ai/dsh-*` peer ranges to `>=0.1.2-rc.1 <0.2.0`: the older `>=0.1.0-rc.8 <0.2.0` band resolved to only the `0.1.0-rc.8` prerelease under registry-driven resolution and broke fresh tarball installs; no behavior change.

### Docs

- Refresh the five-language README support-version wording (GitHub tag `dsh-v0.1.3-alpha.1` leads, npm `0.1.2-rc.1` stays the dependency-pin line) and add the DSH Desktop Market install note; no behavior change.

## [0.1.2] - 2026-09-04

### Added

- **Open channel registry (`reachChannels`)**: the v2 extension point —
  `ctx.get('reachChannels').registerChannel({ id, adapter, priority,
  ownsChatId, startMonitor })` drops a third-party channel into the bridge;
  routing (priority predicate scan over channel-normalized chat ids),
  outbound sends, and monitor lifecycle (attach on register, dispose on
  unregister/`bridge.dispose()`) are all bridge-owned. `bridge.channelStatuses()`
  feeds the settings-page multi-channel view. Verified by
  `tests/registry.spec.ts` + registry routing/monitor tests in
  `tests/bridge.spec.ts`.
- **v2 channel foundations (QQ / DingTalk / WeCom)**: drop-in adapters on the
  `ChannelAdapter` contract, each with a transport seam + fake-transport
  tests. QQ = REST + websocket OpenAPI client on Node built-ins (token +
  gateway + heartbeat + reconnect, `qq:`/`qq:g:`/`qq:c:` chat ids, CQ-tag
  stripping); DingTalk = group-robot webhook outbound with HMAC-SHA256
  signing + conversation-callback normalization (`dt:` ids); WeCom =
  group-robot webhook outbound + AES-256-CBC callback decrypt (echostr +
  message frames), XML parsing, and template-card button-click
  normalization (`wc:` ids). Credentials ride the `dsh-reach/qq-app`,
  `dsh-reach/dingtalk-webhook`, and `dsh-reach/wecom-webhook` grant records.
  Real-device verification is pending (documented). Built-in channels now
  register through the same registry path.

### Changed

- Align the devDependency pins to the published dsh `0.1.2-rc.1` line (26 `@deepseek-ai/dsh-*` packages), the `dshWorkshop` compatibility list, and the compat workflow's CLI/base/headless installs; the five-language README status lines move to v0.1.2. No behavior change (the seam re-check on the 0.1.3-alpha.1 checkout found no consumer-facing break; `Session.append` keeps its surface-only third parameter).

## [0.1.1] - 2026-09-03

### Added

- **Loose coupling & unload safety**: zero hard service dependencies
  (`inject: []`) — every feature gates on `ctx.get` and degrades (settings
  → in-memory state; tools/commands/webServer/systemPrompt → surface
  skipped; credentials → row-config tokens only); `bridge.dispose()` settles
  every pending decision on unload (approval → `'unavailable'`, question →
  empty answer) so unloading never strands the answerer chain; the
  `credentials/record-updated` monitor listener is now disposed with its
  effect. Verified by `tests/lifecycle.spec.ts` (full/minimal/no-settings
  compositions) + a `dispose()` regression test; the degradation matrix is
  documented in `ARCHITECTURE.md`.
- **Phase 3 (part 2) — Feishu adapter**: the Feishu/Lark channel adapter
  (transport seam + SDK-backed WS long connection, app credentials from the
  `dsh-reach/feishu-app` grant record, @-mention gating for groups,
  interactive decision cards with button values mapped to `P{n}=` replies,
  `oc_` chat-id routing); fake-transport tests. Real-device verification is
  pending (documented).
- **Phase 4 (local closure)**: the contract-drift gate
  (`check:contract-drift` — asserts the 10 host seams `dsh-reach` depends on
  still export their required faces against the published peers) and the
  credential-leak gate (`check:credential-leak` — scans the shipped surface
  for API-key/Telegram-token/Bearer/bot_token literals); both wired into the
  check chain and CI.
- **Phase 3 (part 1) — multi-channel validation**: the Telegram channel
  adapter (fetch-based Bot API long polling, zero SDK dependencies, token
  from the `dsh-reach/telegram-token` credential or the `telegramToken` row
  config, deleteWebhook + offset tracking, 401/409 session-invalid surfacing,
  typing actions); Bridge multi-adapter routing (`adapters` list +
  `adapterFor(chatId)`, numeric chat ids route to Telegram, everything else
  to weixin); a fake Bot API server test suite.
- **Phase 2 — decision & command enhancements**: decision auth code
  (`authCode`, replies must carry `:<code>`); rule-based natural-language
  decisions (全部拒绝 / 全部批准 / 批准第N张 / 同意 …; the LLM fallback stays a
  TODO); `/workspace list|switch` (per-chat cwd override applied to new
  sessions), `/session list|new|status` (live agents), `/preset
  list|switch`, `/model status`, `/perm status|switch`; the open push surface
  (`ctx.reachPush.notify()` + `POST /reach/api/push` loopback endpoint with
  optional bearer token + the `reach/sent` event); busy-task progress digest
  (`digestSec`, off = 0).
- Tests: 42 vitest cases (auth code, natural-language decisions, workspace
  override persistence, session reset, busy digest, push authorization +
  `reach/sent` emission).

## [0.1.0] - 2026-09-03

### Added

- **Phase 1 — WeChat single-channel MVP**: the `weixin` iLink channel adapter
  (protocol/auth/monitor/media ported from pan17/dsh-wechat 0.7.2, MIT, with
  the openclaw-weixin PR #161 `-14` recovery contract); the decision bridge
  (deferred-answerer listeners on `approval/request` / `user-questions/request`,
  stable `#token` card ids + `P{n}` numbering, narrowed decision capture,
  multi-card bare-reply guard, `/rp` `/rq`, timeout policies
  `delegate`/`reject`/`wait`, delivered-set persistence); per-user fail-closed
  security (owner bootstrap pairing + allowlist + bounded audit tail); the
  `reach` Remote service (status/config/relogin/logout) with the hand-written
  TYPERT manifest; the settings tab (settings.plugins.tab, en/zh); bridge-owned
  slash commands through the official `ctx.commands` registry; the `reach_send`
  tool with an outbound file fence; outbound ordered queue with per-window
  budget and FIFO re-queue; silent mode; `notifyTaskEvents` gate; the
  channel-source prompt section.
- Config: Schemastery schema with fail-loud `resolveConfig` (channel, security,
  budget, and policy knobs); runtime state persisted through the
  `reach-runtime` settings namespace; bot session token stored as a
  credentials grant record (`dsh-reach/weixin-session`).
- Tests: 32 vitest cases (config bounds, decision parsing, card mirroring,
  token/numbered replies, multi-card guard, `/rp`, timeout policies,
  narrowed capture, authorization, silent relay, turn/end gate, budget/FIFO
  re-queue) plus the built-artifact entry-contract check.

