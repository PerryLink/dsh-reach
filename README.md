# dsh-reach

Multi-channel decision & remote-control bridge for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH): pushes any workspace's approval/question cards to IM channels (WeChat iLink first) and answers them from chat, with a session console, per-channel security, and an open push service.

> **Status: Phase 1–3 complete (WeChat + Telegram + Feishu channels, v0.1.0).**
> The design plan, competitor research, official contract verification, and
> phased roadmap live in
> [`docs/design/03-rebuild-direction-and-plan.md`](docs/design/03-rebuild-direction-and-plan.md).
> Release (GitHub repo + npm publish) follows in a dedicated session.

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

## License

Apache-2.0. Third-party notices in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
