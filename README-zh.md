# dsh-reach

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![DSH plugin](https://img.shields.io/badge/dsh--plugin-✅-green)](https://github.com/topics/dsh-plugin)
[![dsh-doctor](https://raw.githubusercontent.com/PerryLink/dsh-plugin-doctor/main/badges/PerryLink__dsh-reach.svg)](https://github.com/PerryLink/dsh-plugin-doctor#verified-徽章)
[![DSH Market](https://raw.githubusercontent.com/2BingLing/dsh-market/master/assets/readme/badge-listed-zh.svg)](https://dsh.market/)
[![Gitee](https://img.shields.io/badge/Gitee-mirror-c71d23?logo=gitee)](https://gitee.com/perrylink/dsh-reach)
[![CI](https://img.shields.io/github/actions/workflow/status/PerryLink/dsh-reach/ci.yml?branch=main&label=CI)](https://github.com/PerryLink/dsh-reach/actions)
[![Version](https://img.shields.io/github/v/tag/PerryLink/dsh-reach?label=version)](https://github.com/PerryLink/dsh-reach/releases)
[![npm version](https://img.shields.io/npm/v/dsh-reach)](https://www.npmjs.com/package/dsh-reach)
[![npm downloads](https://img.shields.io/npm/dm/dsh-reach)](https://www.npmjs.com/package/dsh-reach)
[![dshfind](https://dshfind.com/api/badge/PerryLink/dsh-reach?metric=downloads&lang=zh)](https://dshfind.com/zh/plugins/PerryLink/dsh-reach?ref=badge)

[English](README.md) | **简体中文** | [Español](README-es.md) | [Português](README-pt.md) | [हिन्दी](README-hi.md)

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的多渠道决策与远程控制桥：把任意工作区的审批/提问卡推送到 IM 通道（微信 iLink、Telegram、飞书——另含 QQ/钉钉/企微 v2 drop-in 基座），并可在聊天中直接答复；附带会话控制台、每通道安全策略与开放推送服务。

> **状态：Phase 1–3 完成（微信 + Telegram + 飞书通道，v0.1.12）；v2 通道基座（QQ/钉钉/企微）基于开放 `reachChannels` 注册表落地。**
> 设计计划、竞品调研、官方契约核实与分阶段路线见
> [`docs/design/03-rebuild-direction-and-plan.md`](docs/design/03-rebuild-direction-and-plan.md)。

## 兼容性

| 方面 | 状态 |
|---|---|
| Harness | DeepSeek Harness **dsh-v0.1.7-rc.1**（GitHub tag）。peer 区间 `>=0.1.2-rc.1 <0.2.0 \|\| >=0.1.5-alpha.1 <0.2.0 \|\| >=0.1.6-0 <0.2.0 \|\| >=0.1.7-0 <0.2.0`；dev/test 钉号**刻意留在已发布的 `0.1.7-rc.1` 线**——那正是 `typecheck:ci` 尺子所量的面（`typecheck` 尺子则经 `tsconfig.json` 的 `paths` 量 checkout 面）。已于 2026-09-24 跑完整门禁链核验；裸装 + scratch profile + keyless 冒烟由 Compat 工作流在每个 PR 上执行。 |
| Node | `^22.19.0 \|\| >=24.0.0` |

## Features (Phase 1)

- **跨会话决策推送**：任意工作区的审批/提问卡镜像到微信（iLink/ClawBot），带稳定 `#token` 卡号与 `P{n}` 编号；回复 `1/2`、`P1=1 P2=2`、`P1=Q1=2` 或 `/rp` `/rq`——经原生 pending 瀑布应答（与 GUI 谁先回复谁生效）。
- **安全默认 fail-closed**：首位发送者成为 owner；白名单为空拒绝所有人；陌生发送者只审计不回复。
- **会话控制台**：`/reach /help /status /silent /notify /tasks /enter /workspace /session /preset /model /perm /history /stop /next` + DSH 原生命令透传。
- **主动推送**：`reach_send` 工具（出站文件围栏）、限流预算 + FIFO 补发、静默模式、后台完成通知。
- **设置页**：设置 → 插件 → IM 桥接（状态、开关、重新扫码/退出登录）。
- **开放通道注册表**：第三方插件通过 `ctx.get('reachChannels').registerChannel({ id, adapter, priority, ownsChatId, startMonitor })` 挂载通道；路由、出站与监视器生命周期全部由桥接层托管（QQ/钉钉/企微走同一路径）。

## Install

```bash
npx @deepseek-ai/dsh plugin --profile web add dsh-reach
dsh1024 plugin --profile web add dsh-reach
```

安装后需重启 DSH（bundle 补丁在启动时生效）。

## Configuration

profile 行支持以下键（Schemastery 校验，非法值加载期响亮失败）：

| 键 | 默认值 | 说明 |
|---|---|---|
| `crossSessionNotify` | `true` | 推送任意工作区/会话的决策卡（总闸） |
| `notifyTaskEvents` | `false` | 后台任务完成/报错通知 |
| `cardTimeoutSec` | `1800` | 决策卡软超时（秒；`0` = 永久等待） |
| `approvalOnTimeout` | `delegate` | 超时策略：`delegate`（交回 GUI）/ `reject` / `wait` |
| `textChunkLimit` | `4000` | 长回复单条消息分段上限（字符） |
| `silent` | `false` | 静默模式：只发最终回复 |
| `cwd` | `''` | 新 IM 会话默认工作目录（'' = 宿主 cwd） |
| `baseUrl` / `cdnBaseUrl` / `botType` | iLink 默认 | 微信网关 / 媒体 CDN / bot 类型 |
| `allowFrom` | `[]` | 发送者白名单（空 = 全部拒绝；首位发送者 = owner） |
| `queueMode` | `queue` | 繁忙投递：`queue` 排队 / `steer` 插话 |
| `maxQueue` / `sendBudget` / `windowSec` | `50` / `10` / `60` | 排队上限、窗口发送预算、窗口秒数 |
| `denyUnauthorized` | `false` | 未授权发送者：静默忽略（true）或友好提示（false） |
| `authCode` | `''` | Shared secret the IM side must present before a message is accepted |
| `digestSec` | `300` | Digest window in seconds (`0` disables the digest) |
| `pushToken` | `''` | Token for the open push service (`reach_send` HTTP surface) |
| `telegramToken` | `''` | Telegram bot token for the Telegram channel |

## Development

```bash
pnpm install
pnpm run typecheck && pnpm run typecheck:ci && pnpm test
pnpm run build && pnpm run verify:self-contained && pnpm run verify:artifacts
pnpm run check:readmes && pnpm pack
```

### 从 DSH Desktop 市场安装

所有 PerryLink 插件均可在 DSH Desktop 内置市场中浏览：**市场 → 来源 → 添加来源 → 粘贴** `https://perrylink-dsh-catalog.perrylink.workers.dev/catalog-source.json` **→ 选中**。安装仍需通过市场的 npm 身份校验与你的确认。

## PerryLink DSH Plugin Family

This project is one of the **45 DeepSeek Harness plugins** maintained by [PerryLink](https://github.com/PerryLink). If this one helps you, the others likely will too:

| Plugin | One-liner |
|---|---|
| **[dsh-auto-review](https://github.com/PerryLink/dsh-auto-review)** | Second-model auto-review on the approval chain, fail-closed by default | |
| **[dsh-autotier](https://github.com/PerryLink/dsh-autotier)** | Automatic strong/cheap model-tier routing with deterministic risk guards and a `/tier` command | |
| **[dsh-background-agents](https://github.com/PerryLink/dsh-background-agents)** | Durable background child agents with a Web UI sidebar, messaging and interrupt | |
| **[dsh-budget](https://github.com/PerryLink/dsh-budget)** | Cost governance for DeepSeek Harness: budgets, carbon, and latency in one panel. | |
| **[dsh-catalog](https://github.com/PerryLink/dsh-catalog)** | DSH Desktop Market standard catalog source for the PerryLink family | |
| **[dsh-cert-mcp](https://github.com/PerryLink/dsh-cert-mcp)** | Read-only MCP server exposing the certification registry: grades, snapshots and five-dimension evidence | |
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
| **[dsh-laya](https://github.com/PerryLink/dsh-laya)** | Laya typed decisions (`noul`/`choice`/`score`) as a first-class Cordis service and model-visible tools | |
| **[dsh-library](https://github.com/PerryLink/dsh-library)** | Local document knowledge base for DeepSeek Harness. | |
| **[dsh-local-ai](https://github.com/PerryLink/dsh-local-ai)** | Local-model (Ollama) integration for DeepSeek Harness. | |
| **[dsh-lsp-actions](https://github.com/PerryLink/dsh-lsp-actions)** | LSP diagnostics, formatting, completion, code actions and rename over language servers | |
| **[dsh-mask](https://github.com/PerryLink/dsh-mask)** | PII masking middleware: anonymize at the model boundary, restore at the display layer | |
| **[dsh-mcp-panel](https://github.com/PerryLink/dsh-mcp-panel)** | Read-only MCP runtime panel: /mcp command + Settings tab with status, tools and errors | |
| **[dsh-memento](https://github.com/PerryLink/dsh-memento)** | Approval-gated cross-session memory: ctx.memory seam + SQLite + memory tool | |
| **[dsh-observe](https://github.com/PerryLink/dsh-observe)** | OpenTelemetry and Langfuse observability exporter for DeepSeek Harness. | |
| **[dsh-output-styles](https://github.com/PerryLink/dsh-output-styles)** | Claude Code outputStyles-equivalent runtime style switching | |
| **[dsh-permission-rules](https://github.com/PerryLink/dsh-permission-rules)** | Claude Code-style declarative allow/deny/ask permission rules with audit | |
| **[dsh-plugin-certification](https://github.com/PerryLink/dsh-plugin-certification)** | Community certification registry with repro-checkable grades and badges | |
| **[dsh-plugin-doctor](https://github.com/PerryLink/dsh-plugin-doctor)** | Zero-dependency static + sandbox smoke detector for DSH plugins | |
| **[dsh-plugin-guide](https://github.com/PerryLink/dsh-plugin-guide)** | Plugin-development knowledge base as an on-demand agent skill | |
| **[dsh-plugin-kit](https://github.com/PerryLink/dsh-plugin-kit)** | Shared zero-runtime-dependency toolkit for the PerryLink DSH plugins | |
| **[dsh-plugin-upgrade](https://github.com/PerryLink/dsh-plugin-upgrade)** | One-package, one-corridor-index plugin upgrade skill: routes a repository to the matching closed corridor card | |
| **[dsh-plugin-upgrade-015](https://github.com/PerryLink/dsh-plugin-upgrade-015)** | Merged `0.1.3-alpha.1` → `0.1.5-rc.1` upgrade corridor card plus a zero-dependency seam scanner | |
| **[dsh-reach](https://github.com/PerryLink/dsh-reach)** | Multi-channel approval/question bridge: WeChat/Telegram/Feishu, session console | |
| **[dsh-research-report](https://github.com/PerryLink/dsh-research-report)** | Verifiable research-report engine: content-addressed evidence ledger and sealed versions | |
| **[dsh-score](https://github.com/PerryLink/dsh-score)** | Multi-dimensional quality scoring for DeepSeek Harness plugins. | |
| **[dsh-session-pin](https://github.com/PerryLink/dsh-session-pin)** | Pin sessions in the Web sidebar with durable ordering | |
| **[dsh-session-sync](https://github.com/PerryLink/dsh-session-sync)** | Cross-device session sync for DeepSeek Harness — a dedicated git mirror of your session store. | |
| **[dsh-skill-pack-security](https://github.com/PerryLink/dsh-skill-pack-security)** | Security-audit skill pack: secret scan, dependency and supply-chain review | |
| **[dsh-talk](https://github.com/PerryLink/dsh-talk)** | Voice-first session loop for DeepSeek Harness: talk to it, hear it answer. | |
| **[dsh-team-rooms](https://github.com/PerryLink/dsh-team-rooms)** | Cross-session team rooms: shared message bus, task board and timeline | |
| **[dsh-test-drive](https://github.com/PerryLink/dsh-test-drive)** | Isolated install-and-smoke test drives for DeepSeek Harness plugins. | |
| **[dsh-ticktick](https://github.com/PerryLink/dsh-ticktick)** | TickTick/Dida365 task bridge: session-header panel + 11 tools | |
| **[dsh-translate](https://github.com/PerryLink/dsh-translate)** | Vendor parameter translation and deterministic JSON repair for DeepSeek Harness. | |


## License

Apache-2.0。第三方声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
