# dsh-reach

Ponte multicanal de decisões e controle remoto para o [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH): envia os cartões de aprovação/pergunta de qualquer espaço de trabalho para canais IM (começando pelo WeChat iLink) e permite respondê-los pelo chat, com console de sessão, segurança por canal e um serviço aberto de notificações.

> **Status: estrutura da Fase 0 (v0.1.0).** O plano de design, a pesquisa de
> concorrentes, a verificação dos contratos oficiais e o roteiro por fases estão
> em [`docs/design/03-rebuild-direction-and-plan.md`](docs/design/03-rebuild-direction-and-plan.md).
> O canal WeChat e a ponte de decisões chegam na Fase 1.

## Install

```bash
npx @deepseek-ai/dsh plugin --profile web add dsh-reach
dsh1024 plugin --profile web add dsh-reach
```

Reinicie o DSH após a instalação (os patches do bundle são aplicados na inicialização).

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
