# dsh-reach

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![DSH plugin](https://img.shields.io/badge/dsh--plugin-✅-green)](https://github.com/topics/dsh-plugin)
[![dsh-doctor](https://raw.githubusercontent.com/PerryLink/dsh-plugin-doctor/main/badges/PerryLink__dsh-reach.svg)](https://github.com/PerryLink/dsh-plugin-doctor#verified-徽章)
[![Gitee](https://img.shields.io/badge/Gitee-mirror-c71d23?logo=gitee)](https://gitee.com/perrylink/dsh-reach)
[![CI](https://img.shields.io/github/actions/workflow/status/PerryLink/dsh-reach/ci.yml?branch=main&label=CI)](https://github.com/PerryLink/dsh-reach/actions)
[![Version](https://img.shields.io/github/v/tag/PerryLink/dsh-reach?label=version)](https://github.com/PerryLink/dsh-reach/releases)
[![npm version](https://img.shields.io/npm/v/dsh-reach)](https://www.npmjs.com/package/dsh-reach)
[![npm downloads](https://img.shields.io/npm/dm/dsh-reach)](https://www.npmjs.com/package/dsh-reach)

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的多渠道决策与远程控制桥：把任意工作区的审批/提问卡推送到 IM 通道（微信 iLink、Telegram、飞书——另含 QQ/钉钉/企微 v2 drop-in 基座），并可在聊天中直接答复；附带会话控制台、每通道安全策略与开放推送服务。

> **状态：Phase 1–3 完成（微信 + Telegram + 飞书通道，v0.1.7）；v2 通道基座（QQ/钉钉/企微）基于开放 `reachChannels` 注册表落地。**
> 设计计划、竞品调研、官方契约核实与分阶段路线见
> [`docs/design/03-rebuild-direction-and-plan.md`](docs/design/03-rebuild-direction-and-plan.md)。

## 兼容性

| 方面 | 状态 |
|---|---|
| Harness | DeepSeek Harness **dsh-v0.1.5-rc.2**（GitHub tag）。npm 依赖线钉在 `@deepseek-ai/dsh` **0.1.5-rc.2**（peers `>=0.1.2-rc.1 <0.2.0 || >=0.1.5-alpha.1 <0.2.0`）。已于 2026-09-11 对照 dsh-v0.1.5-rc.2 master checkout 核验（完整门禁链 + profile 安装冒烟）。 |
| Node | `^22.19.0 \|\| >=24.0.0` |

## Features (Phase 1)

- **跨会话决策推送**：任意工作区的审批/提问卡镜像到微信（iLink/ClawBot），带稳定 `#token` 卡号与 `P{n}` 编号；回复 `1/2`、`P1=1 P2=2`、`P1=Q1=2` 或 `/rp` `/rq`——经原生 pending 瀑布应答（与 GUI 谁先回复谁生效）。
- **安全默认 fail-closed**：首位发送者成为 owner；白名单为空拒绝所有人；陌生发送者只审计不回复。
- **会话控制台**：`/status /silent /notify /tasks /enter /history /stop /next /help` + DSH 原生命令透传。
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

这是 [PerryLink](https://github.com/PerryLink) 维护的 [37 个 DeepSeek Harness 插件](https://github.com/PerryLink) 之一。如果它能帮到你，其他的也会：

| Plugin | One-liner |
|---|---|
| **[dsh-auto-review](https://github.com/PerryLink/dsh-auto-review)** | 审批链上的第二模型自动审查，默认失败关闭 | |
| **[dsh-background-agents](https://github.com/PerryLink/dsh-background-agents)** | 带 Web UI 侧栏、消息与中断的持久后台子代理 | |
| **[dsh-budget](https://github.com/PerryLink/dsh-budget)** | DeepSeek Harness 的成本治理：预算、碳排与延迟一屏呈现。 | |
| **[dsh-checkpoint-rewind](https://github.com/PerryLink/dsh-checkpoint-rewind)** | Claude Code /rewind 等价：快照、会话 fork、一次性恢复 | |
| **[dsh-claude-move](https://github.com/PerryLink/dsh-claude-move)** | 把 Claude Code 会话、记忆、技能与 CLAUDE.md 迁入 DSH | |
| **[dsh-click](https://github.com/PerryLink/dsh-click)** | 跨平台原生桌面控制（DeepSeek Harness），Windows 优先。 | |
| **[dsh-composer-history](https://github.com/PerryLink/dsh-composer-history)** | Web 输入框的终端式历史：方向键、Ctrl+R 搜索 | |
| **[dsh-data-quality](https://github.com/PerryLink/dsh-data-quality)** | 数据集质量检查与引文核查（本插件可选消费的数字核查桥） | |
| **[dsh-defend](https://github.com/PerryLink/dsh-defend)** | DeepSeek Harness 的提示注入、越狱与密钥泄露防护。 | |
| **[dsh-doublecheck](https://github.com/PerryLink/dsh-doublecheck)** | 工程纪律守卫：需求质询、测试门禁、对手评审 | |
| **[dsh-draw](https://github.com/PerryLink/dsh-draw)** | DeepSeek Harness 的统一静态图像生成路由。 | |
| **[dsh-fast](https://github.com/PerryLink/dsh-fast)** | DeepSeek Harness 只读性能诊断。 | |
| **[dsh-fund-research](https://github.com/PerryLink/dsh-fund-research)** | 面向中国公募基金的确定性研究报告 | |
| **[dsh-github](https://github.com/PerryLink/dsh-github)** | 面向 DSH 的 GitHub PR/issues 集成，每次写入经审批门控 | |
| **[dsh-industry-research](https://github.com/PerryLink/dsh-industry-research)** | 行业研究编排，经本插件的 `ctx.researchReport.assemble` 封存交付物 | |
| **[dsh-library](https://github.com/PerryLink/dsh-library)** | DeepSeek Harness 的本地文档知识库。 | |
| **[dsh-local-ai](https://github.com/PerryLink/dsh-local-ai)** | DeepSeek Harness 的本地模型（Ollama）接入。 | |
| **[dsh-lsp-actions](https://github.com/PerryLink/dsh-lsp-actions)** | 通过语言服务器的 LSP 诊断、格式化、补全、代码操作与重命名 | |
| **[dsh-mask](https://github.com/PerryLink/dsh-mask)** | PII 脱敏中间件：模型边界匿名化、展示层还原 | |
| **[dsh-mcp-panel](https://github.com/PerryLink/dsh-mcp-panel)** | 只读 MCP 运行时面板：/mcp 命令 + 带状态、工具与错误的 Settings 标签页 | |
| **[dsh-memento](https://github.com/PerryLink/dsh-memento)** | 审批门控的跨会话记忆：ctx.memory 接缝 + SQLite + 记忆工具 | |
| **[dsh-observe](https://github.com/PerryLink/dsh-observe)** | DeepSeek Harness 的 OpenTelemetry 与 Langfuse 可观测导出器。 | |
| **[dsh-output-styles](https://github.com/PerryLink/dsh-output-styles)** | Claude Code outputStyles 等价的运行时风格切换 | |
| **[dsh-permission-rules](https://github.com/PerryLink/dsh-permission-rules)** | Claude Code 风格声明式 allow/deny/ask 权限规则，带审计 | |
| **[dsh-personal-directive](https://github.com/PerryLink/dsh-personal-directive)** | 个人指令注入器:顶栏开关(框架版) |
| **[dsh-plugin-guide](https://github.com/PerryLink/dsh-plugin-guide)** | 作为按需代理技能的插件开发知识库 | |
| **[dsh-research-report](https://github.com/PerryLink/dsh-research-report)** | 可验证研究报告引擎：内容寻址证据账本与封存版本 | |
| **[dsh-score](https://github.com/PerryLink/dsh-score)** | DeepSeek Harness 插件的多维质量评分。 | |
| **[dsh-session-pin](https://github.com/PerryLink/dsh-session-pin)** | 在 Web 侧栏置顶会话，带持久排序 | |
| **[dsh-session-sync](https://github.com/PerryLink/dsh-session-sync)** | DeepSeek Harness 的跨设备会话同步——会话存储的专用 git 镜像。 | |
| **[dsh-skill-pack-security](https://github.com/PerryLink/dsh-skill-pack-security)** | 安全审计技能包：密钥扫描、依赖与供应链审查 | |
| **[dsh-talk](https://github.com/PerryLink/dsh-talk)** | DeepSeek Harness 的语音优先会话闭环：对它说，听它答。 | |
| **[dsh-test-drive](https://github.com/PerryLink/dsh-test-drive)** | DeepSeek Harness 插件的隔离试装冒烟。 | |
| **[dsh-translate](https://github.com/PerryLink/dsh-translate)** | DeepSeek Harness 的厂商参数翻译与确定性 JSON 修复。 | |
| **[dsh-ticktick](https://github.com/PerryLink/dsh-ticktick)** | TickTick/滴答清单任务桥接:会话头面板 + 11 个工具 |
| **[dsh-wechat](https://github.com/PerryLink/dsh-wechat)** | 微信 ↔ DSH 桥接(Tencent iLink 机器人):文本/图片/文件/语音,聊天内审批卡片 |


## License

Apache-2.0。第三方声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
