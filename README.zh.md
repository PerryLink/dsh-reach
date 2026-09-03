# dsh-reach

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的多渠道决策与远程控制桥：把任意工作区的审批/提问卡推送到 IM 通道（微信 iLink 首发），并可在聊天中直接答复；附带会话控制台、每通道安全策略与开放推送服务。

> **状态：Phase 0 骨架（v0.1.0）。** 设计计划、竞品调研、官方契约核实与分阶段路线见
> [`docs/design/03-rebuild-direction-and-plan.md`](docs/design/03-rebuild-direction-and-plan.md)。
> 微信通道移植与决策桥在 Phase 1 落地。

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
| `textChunkLimit` | `4000` | 长回复单条消息分段上限（字符） |
| `silent` | `false` | 静默模式：只发最终回复 |
| `cwd` | `''` | 新 IM 会话默认工作目录（'' = 宿主 cwd） |

## Development

```bash
pnpm install
pnpm run typecheck && pnpm run typecheck:ci && pnpm test
pnpm run build && pnpm run verify:self-contained && pnpm run verify:artifacts
pnpm run check:readmes && pnpm pack
```

## License

Apache-2.0。第三方声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
