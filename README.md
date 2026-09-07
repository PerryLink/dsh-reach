# dsh-reach

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![DSH plugin](https://img.shields.io/badge/dsh-plugin-✅-green)](https://github.com/topics/dsh-plugin)
[![Gitee](https://img.shields.io/badge/Gitee-mirror-c71d23?logo=gitee)](https://gitee.com/perrylink/dsh-reach)
[![CI](https://img.shields.io/github/actions/workflow/status/PerryLink/dsh-reach/ci.yml?branch=main&label=CI)](https://github.com/PerryLink/dsh-reach/actions)
[![Version](https://img.shields.io/github/v/tag/PerryLink/dsh-reach?label=version)](https://github.com/PerryLink/dsh-reach/releases)
[![npm version](https://img.shields.io/npm/v/dsh-reach)](https://www.npmjs.com/package/dsh-reach)
[![npm downloads](https://img.shields.io/npm/dm/dsh-reach)](https://www.npmjs.com/package/dsh-reach)

Multi-channel decision & remote-control bridge for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH): pushes any workspace's approval/question cards to IM channels (WeChat iLink, Telegram, Feishu — plus QQ/DingTalk/WeCom v2 drop-in foundations) and answers them from chat, with a session console, per-channel security, and an open push service.

> **Status: Phase 1–3 complete (WeChat + Telegram + Feishu channels, v0.1.2); v2 channel foundations (QQ/DingTalk/WeCom) on the open `reachChannels` registry.**
> The design plan, competitor research, official contract verification, and
> phased roadmap live in
> [`docs/design/03-rebuild-direction-and-plan.md`](docs/design/03-rebuild-direction-and-plan.md).
> Release (GitHub repo + npm publish) follows in a dedicated session.

## Compatibility

| Surface | Status |
|---|---|
| Harness | DeepSeek Harness **dsh-v0.1.3-alpha.1** (GitHub tag). npm dependency line: `@deepseek-ai/dsh` **0.1.2-rc.1** (peers `>=0.1.2-rc.1 <0.2.0`). Verified 2026-09-06 against the dsh-v0.1.3-alpha.1 master checkout (full gate chain + profile install smoke). |
| Node | `^22.19.0 \|\| >=24.0.0` |

## Features (Phase 1)

- **Cross-session decision push**: approval/question cards from ANY workspace
  are mirrored to WeChat (iLink/ClawBot) with stable `#token` ids and `P{n}`
  numbering; reply `1`/`2`, `P1=1 P2=2`, `P1=Q1=2`, or `/rp` `/rq` — answered
  through the native pending waterfall (first reply wins with the GUI).
- **Fail-closed security**: first sender becomes the owner; empty allowlists
  deny everyone; unknown senders are audited and never answered.
- **Session console**: `/status /silent /notify /tasks /enter /history /stop
  /next /help` plus native DSH command passthrough.
- **Proactive push**: the `reach_send` tool with an outbound file fence; rate
  budget + FIFO re-queue; silent mode; background completion notices.
- **Settings tab**: Settings → Plugins → IM Bridge (status, switches,
  re-scan/logout).
- **Open channel registry**: third-party plugins register a channel via
  `ctx.get('reachChannels').registerChannel({ id, adapter, priority,
  ownsChatId, startMonitor })`; routing, outbound, and monitor lifecycle are
  all bridge-owned (QQ/DingTalk/WeCom ride this same path).

## Install

```bash
npx @deepseek-ai/dsh plugin --profile web add dsh-reach
dsh1024 plugin --profile web add dsh-reach
```

Restart DSH after installation (bundle patches apply at startup).

## Configuration

The profile row accepts these keys (Schemastery-validated; invalid values fail
the load loudly):

| Key | Default | Description |
|---|---|---|
| `crossSessionNotify` | `true` | Push decision cards from ANY workspace/session (master switch) |
| `notifyTaskEvents` | `false` | Background task finished/errored notifications |
| `cardTimeoutSec` | `1800` | Decision-card soft timeout in seconds (`0` = wait forever) |
| `approvalOnTimeout` | `delegate` | Timed-out card policy: `delegate` (GUI chain) / `reject` / `wait` |
| `textChunkLimit` | `4000` | Long reply chunk limit per message, in characters |
| `silent` | `false` | Only final replies, no per-step streaming |
| `cwd` | `''` | Default working directory for new IM sessions ('' = host cwd) |
| `baseUrl` / `cdnBaseUrl` / `botType` | iLink defaults | WeChat gateway, media CDN, bot type |
| `allowFrom` | `[]` | Sender allowlist (empty = fail-closed; first sender = owner) |
| `queueMode` | `queue` | Busy delivery: `queue` or `steer` |
| `maxQueue` / `sendBudget` / `windowSec` | `50` / `10` / `60` | Queue cap, per-window send budget, window seconds |
| `denyUnauthorized` | `false` | Silently ignore (true) or notice (false) unknown senders |

## Development

```bash
pnpm install
pnpm run typecheck && pnpm run typecheck:ci && pnpm test
pnpm run build && pnpm run verify:self-contained && pnpm run verify:artifacts
pnpm run check:readmes && pnpm pack
```

### Install from the DSH Desktop Market

All PerryLink plugins are browsable in the built-in DSH Desktop Market: **Market → Sources → add source → paste** `https://perrylink-dsh-catalog.perrylink.workers.dev/catalog-source.json` **→ select it**. Installation still goes through the Market's npm-identity verification and your confirmation.

## PerryLink DSH Plugin Family

This project is one of the [37 DeepSeek Harness plugins](https://github.com/PerryLink) maintained by [PerryLink](https://github.com/PerryLink). If this one helps you, the others likely will too:

| Plugin | One-liner |
|---|---|
| **[dsh-auto-review](https://github.com/PerryLink/dsh-auto-review)** | Second-model auto-review on the approval chain, fail-closed by default | |
| **[dsh-background-agents](https://github.com/PerryLink/dsh-background-agents)** | Durable background child agents with a Web UI sidebar, messaging and interrupt | |
| **[dsh-budget](https://github.com/PerryLink/dsh-budget)** | Cost governance for DeepSeek Harness: budgets, carbon, and latency in one panel. | |
| **[dsh-checkpoint-rewind](https://github.com/PerryLink/dsh-checkpoint-rewind)** | Claude Code /rewind-equivalent: snapshots, session forks, one-shot restore | |
| **[dsh-claude-move](https://github.com/PerryLink/dsh-claude-move)** | Migrate Claude Code sessions, memory, skills and CLAUDE.md into DSH | |
| **[dsh-click](https://github.com/PerryLink/dsh-click)** | Cross-platform native desktop control for DeepSeek Harness — Windows first. | |
| **[dsh-composer-history](https://github.com/PerryLink/dsh-composer-history)** | Terminal-style input history for the web composer: arrows, Ctrl+R search | |
| **[dsh-data-quality](https://github.com/PerryLink/dsh-data-quality)** | Dataset quality checks and citation cross-checks (the optional numeric bridge consumed here) | |
| **[dsh-defend](https://github.com/PerryLink/dsh-defend)** | Prompt-injection, jailbreak, and secret-leak defense for DeepSeek Harness. | |
| **[dsh-doublecheck](https://github.com/PerryLink/dsh-doublecheck)** | Engineering-discipline guard: requirements grill, test gates, adversary review | |
| **[dsh-draw](https://github.com/PerryLink/dsh-draw)** | Unified static-image generation routing for DeepSeek Harness. | |
| **[dsh-fast](https://github.com/PerryLink/dsh-fast)** | Read-only performance diagnostics for DeepSeek Harness. | |
| **[dsh-fund-research](https://github.com/PerryLink/dsh-fund-research)** | Deterministic research reports for Chinese public mutual funds | |
| **[dsh-github](https://github.com/PerryLink/dsh-github)** | GitHub PR/issues integration for DSH, every write gated by approval | |
| **[dsh-industry-research](https://github.com/PerryLink/dsh-industry-research)** | Industry research orchestration that seals its deliverables through this plugin's `ctx.researchReport.assemble` | |
| **[dsh-library](https://github.com/PerryLink/dsh-library)** | Local document knowledge base for DeepSeek Harness. | |
| **[dsh-local-ai](https://github.com/PerryLink/dsh-local-ai)** | Local-model (Ollama) integration for DeepSeek Harness. | |
| **[dsh-lsp-actions](https://github.com/PerryLink/dsh-lsp-actions)** | LSP diagnostics, formatting, completion, code actions and rename over language servers | |
| **[dsh-mask](https://github.com/PerryLink/dsh-mask)** | PII masking middleware: anonymize at the model boundary, restore at the display layer | |
| **[dsh-mcp-panel](https://github.com/PerryLink/dsh-mcp-panel)** | Read-only MCP runtime panel: /mcp command + Settings tab with status, tools and errors | |
| **[dsh-memento](https://github.com/PerryLink/dsh-memento)** | Approval-gated cross-session memory: ctx.memory seam + SQLite + memory tool | |
| **[dsh-observe](https://github.com/PerryLink/dsh-observe)** | OpenTelemetry and Langfuse observability exporter for DeepSeek Harness. | |
| **[dsh-output-styles](https://github.com/PerryLink/dsh-output-styles)** | Claude Code outputStyles-equivalent runtime style switching | |
| **[dsh-permission-rules](https://github.com/PerryLink/dsh-permission-rules)** | Claude Code-style declarative allow/deny/ask permission rules with audit | |
| **[dsh-personal-directive](https://github.com/PerryLink/dsh-personal-directive)** | Personal directive injector with top-bar toggle (framework edition) |
| **[dsh-plugin-guide](https://github.com/PerryLink/dsh-plugin-guide)** | Plugin-development knowledge base as an on-demand agent skill | |
| **[dsh-research-report](https://github.com/PerryLink/dsh-research-report)** | Verifiable research-report engine: content-addressed evidence ledger and sealed versions | |
| **[dsh-score](https://github.com/PerryLink/dsh-score)** | Multi-dimensional quality scoring for DeepSeek Harness plugins. | |
| **[dsh-session-pin](https://github.com/PerryLink/dsh-session-pin)** | Pin sessions in the Web sidebar with durable ordering | |
| **[dsh-session-sync](https://github.com/PerryLink/dsh-session-sync)** | Cross-device session sync for DeepSeek Harness — a dedicated git mirror of your session store. | |
| **[dsh-skill-pack-security](https://github.com/PerryLink/dsh-skill-pack-security)** | Security-audit skill pack: secret scan, dependency and supply-chain review | |
| **[dsh-talk](https://github.com/PerryLink/dsh-talk)** | Voice-first session loop for DeepSeek Harness: talk to it, hear it answer. | |
| **[dsh-test-drive](https://github.com/PerryLink/dsh-test-drive)** | Isolated install-and-smoke test drives for DeepSeek Harness plugins. | |
| **[dsh-translate](https://github.com/PerryLink/dsh-translate)** | Vendor parameter translation and deterministic JSON repair for DeepSeek Harness. | |
| **[dsh-ticktick](https://github.com/PerryLink/dsh-ticktick)** | TickTick/Dida365 task bridge: session-header panel + 11 tools |
| **[dsh-wechat](https://github.com/PerryLink/dsh-wechat)** | WeChat ↔ DSH bridge (Tencent iLink bot): text/image/file/voice, approvals in chat |

### Install from the DSH Desktop Market

All PerryLink plugins are browsable in the built-in DSH Desktop Market: **Market → Sources → add source → paste** `https://perrylink-dsh-catalog.perrylink.workers.dev/catalog-source.json` **→ select it**. Installation still goes through the Market's npm-identity verification and your confirmation.


## License

Apache-2.0. Third-party notices in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
