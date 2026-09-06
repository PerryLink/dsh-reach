# dsh-reach

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![DSH plugin](https://img.shields.io/badge/dsh-plugin-✅-green)](https://github.com/topics/dsh-plugin)
[![Gitee](https://img.shields.io/badge/Gitee-mirror-c71d23?logo=gitee)](https://gitee.com/perrylink/dsh-reach)
[![CI](https://img.shields.io/github/actions/workflow/status/PerryLink/dsh-reach/ci.yml?branch=main&label=CI)](https://github.com/PerryLink/dsh-reach/actions)
[![Version](https://img.shields.io/github/v/tag/PerryLink/dsh-reach?label=version)](https://github.com/PerryLink/dsh-reach/releases)
[![npm version](https://img.shields.io/npm/v/dsh-reach)](https://www.npmjs.com/package/dsh-reach)
[![npm downloads](https://img.shields.io/npm/dm/dsh-reach)](https://www.npmjs.com/package/dsh-reach)

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的多渠道决策与远程控制桥：把任意工作区的审批/提问卡推送到 IM 通道（微信 iLink、Telegram、飞书——另含 QQ/钉钉/企微 v2 drop-in 基座），并可在聊天中直接答复；附带会话控制台、每通道安全策略与开放推送服务。

> **状态：Phase 1–3 完成（微信 + Telegram + 飞书通道，v0.1.2）；v2 通道基座（QQ/钉钉/企微）基于开放 `reachChannels` 注册表落地。**
> 设计计划、竞品调研、官方契约核实与分阶段路线见
> [`docs/design/03-rebuild-direction-and-plan.md`](docs/design/03-rebuild-direction-and-plan.md)。

## 兼容性

| 方面 | 状态 |
|---|---|
| Harness | DeepSeek Harness **dsh-v0.1.3-alpha.1**（GitHub tag）。npm 依赖线钉在 `@deepseek-ai/dsh` **0.1.2-rc.1**（peers `>=0.1.2-rc.1 <0.2.0`）。已于 2026-09-06 对照 dsh-v0.1.3-alpha.1 master checkout 核验（完整门禁链 + profile 安装冒烟）。 |
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

## License

Apache-2.0。第三方声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
