# dsh-reach

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![DSH plugin](https://img.shields.io/badge/dsh-plugin-✅-green)](https://github.com/topics/dsh-plugin)
[![Gitee](https://img.shields.io/badge/Gitee-mirror-c71d23?logo=gitee)](https://gitee.com/perrylink/dsh-reach)
[![CI](https://img.shields.io/github/actions/workflow/status/PerryLink/dsh-reach/ci.yml?branch=main&label=CI)](https://github.com/PerryLink/dsh-reach/actions)
[![Version](https://img.shields.io/github/v/tag/PerryLink/dsh-reach?label=version)](https://github.com/PerryLink/dsh-reach/releases)
[![npm version](https://img.shields.io/npm/v/dsh-reach)](https://www.npmjs.com/package/dsh-reach)
[![npm downloads](https://img.shields.io/npm/dm/dsh-reach)](https://www.npmjs.com/package/dsh-reach)

Ponte multicanal de decisões e controle remoto para o [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH): envia os cartões de aprovação/pergunta de qualquer espaço de trabalho para canais IM (WeChat iLink, Telegram, Feishu — além das bases v2 de QQ/DingTalk/WeCom) e permite respondê-los pelo chat, com console de sessão, segurança por canal e um serviço aberto de notificações.

> **Status: Fases 1–3 concluídas (canais WeChat + Telegram + Feishu, v0.1.2); bases de canais v2 (QQ/DingTalk/WeCom) sobre o registro aberto `reachChannels`.**
> O plano de design, a pesquisa de concorrentes, a verificação dos contratos
> oficiais e o roteiro por fases estão em
> [`docs/design/03-rebuild-direction-and-plan.md`](docs/design/03-rebuild-direction-and-plan.md).

## Install

```bash
npx @deepseek-ai/dsh plugin --profile web add dsh-reach
dsh1024 plugin --profile web add dsh-reach
```

Reinicie o DSH após a instalação (os patches do bundle são aplicados na inicialização).

## Features (Phase 1)

- Cartões de decisão de qualquer espaço de trabalho espelhados no WeChat com numeração estável; responda com `1`/`2`, `P1=1 P2=2` ou `/rp` `/rq`.
- Segurança fail-closed: o primeiro remetente é o owner; listas vazias negam todos.
- Console de sessão (`/status /silent /notify /tasks /enter /history /stop /next /help`) e aba de configurações.

## Configuration

| Chave | Padrão | Descrição |
|---|---|---|
| `crossSessionNotify` | `true` | Envia cartões de decisão de QUALQUER espaço de trabalho/sessão |
| `notifyTaskEvents` | `false` | Notificações de tarefas em segundo plano concluídas/erros |
| `cardTimeoutSec` | `1800` | Tempo limite suave dos cartões em segundos (`0` = aguardar sempre) |
| `textChunkLimit` | `4000` | Limite de caracteres por trecho de resposta longa |
| `silent` | `false` | Apenas respostas finais, sem streaming por etapa |
| `cwd` | `''` | Diretório de trabalho padrão para novas sessões IM |

## Development

```bash
pnpm install
pnpm run typecheck && pnpm run typecheck:ci && pnpm test
pnpm run build && pnpm run verify:self-contained && pnpm run verify:artifacts
pnpm run check:readmes && pnpm pack
```

## License

Apache-2.0. Avisos de terceiros em [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
