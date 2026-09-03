# dsh-reach

Multi-channel decision & remote-control bridge for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH): pushes any workspace's approval/question cards to IM channels (WeChat iLink first) and answers them from chat, with a session console, per-channel security, and an open push service.

> **Status: Phase 0 scaffold (v0.1.0).** The design plan, competitor research,
> official contract verification, and phased roadmap live in
> [`docs/design/03-rebuild-direction-and-plan.md`](docs/design/03-rebuild-direction-and-plan.md).
> The WeChat channel port and the decision bridge land in Phase 1.

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
| `textChunkLimit` | `4000` | Long reply chunk limit per message, in characters |
| `silent` | `false` | Only final replies, no per-step streaming |
| `cwd` | `''` | Default working directory for new IM sessions ('' = host cwd) |

## Development

```bash
pnpm install
pnpm run typecheck && pnpm run typecheck:ci && pnpm test
pnpm run build && pnpm run verify:self-contained && pnpm run verify:artifacts
pnpm run check:readmes && pnpm pack
```

## License

Apache-2.0. Third-party notices in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
