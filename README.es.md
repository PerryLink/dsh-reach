# dsh-reach

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![DSH plugin](https://img.shields.io/badge/dsh-plugin-✅-green)](https://github.com/topics/dsh-plugin)
[![Gitee](https://img.shields.io/badge/Gitee-mirror-c71d23?logo=gitee)](https://gitee.com/perrylink/dsh-reach)
[![CI](https://img.shields.io/github/actions/workflow/status/PerryLink/dsh-reach/ci.yml?branch=main&label=CI)](https://github.com/PerryLink/dsh-reach/actions)
[![Version](https://img.shields.io/github/v/tag/PerryLink/dsh-reach?label=version)](https://github.com/PerryLink/dsh-reach/releases)
[![npm version](https://img.shields.io/npm/v/dsh-reach)](https://www.npmjs.com/package/dsh-reach)
[![npm downloads](https://img.shields.io/npm/dm/dsh-reach)](https://www.npmjs.com/package/dsh-reach)

Puente multicanal de decisiones y control remoto para [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH): envía las tarjetas de aprobación/pregunta de cualquier espacio de trabajo a canales IM (WeChat iLink, Telegram, Feishu — más las bases v2 de QQ/DingTalk/WeCom) y permite responderlas desde el chat, con consola de sesión, seguridad por canal y un servicio abierto de notificaciones.

> **Estado: Fases 1–3 completas (canales WeChat + Telegram + Feishu, v0.1.2); bases de canales v2 (QQ/DingTalk/WeCom) sobre el registro abierto `reachChannels`.**
> El plan de diseño, la investigación de la competencia, la verificación de
> contratos oficiales y la hoja de ruta están en
> [`docs/design/03-rebuild-direction-and-plan.md`](docs/design/03-rebuild-direction-and-plan.md).

## Install

```bash
npx @deepseek-ai/dsh plugin --profile web add dsh-reach
dsh1024 plugin --profile web add dsh-reach
```

Reinicia DSH tras la instalación (los parches del bundle se aplican al arrancar).

## Compatibilidad

| Superficie | Estado |
|---|---|
| Harness | DeepSeek Harness **dsh-v0.1.3-alpha.1** (tag de GitHub). Línea npm fijada en `@deepseek-ai/dsh` **0.1.2-rc.1** (peers `>=0.1.2-rc.1 <0.2.0`). Verificado el 2026-09-06 contra el checkout master dsh-v0.1.3-alpha.1 (cadena completa de gates + smoke de instalación de perfil). |
| Node | `^22.19.0 \|\| >=24.0.0` |

## Features (Phase 1)

- Tarjetas de decisión de cualquier espacio de trabajo enviadas a WeChat con numeración estable; respuesta con `1`/`2`, `P1=1 P2=2` o `/rp` `/rq`.
- Seguridad fail-closed: el primer remitente es el propietario; listas vacías niegan a todos.
- Consola de sesión (`/status /silent /notify /tasks /enter /history /stop /next /help`) y pestaña de ajustes.

## Configuration

| Clave | Valor por defecto | Descripción |
|---|---|---|
| `crossSessionNotify` | `true` | Envía tarjetas de decisión desde CUALQUIER espacio de trabajo/sesión |
| `notifyTaskEvents` | `false` | Notificaciones de tareas en segundo plano terminadas/fallidas |
| `cardTimeoutSec` | `1800` | Tiempo de espera suave de las tarjetas en segundos (`0` = indefinido) |
| `textChunkLimit` | `4000` | Límite de caracteres por fragmento de respuesta larga |
| `silent` | `false` | Solo respuestas finales, sin streaming por pasos |
| `cwd` | `''` | Directorio de trabajo por defecto para sesiones IM nuevas |

## Development

```bash
pnpm install
pnpm run typecheck && pnpm run typecheck:ci && pnpm test
pnpm run build && pnpm run verify:self-contained && pnpm run verify:artifacts
pnpm run check:readmes && pnpm pack
```

### Instalar desde el mercado de DSH Desktop

Todos los plugins de PerryLink pueden explorarse en el mercado integrado de DSH Desktop: **Market → Sources → add source → pegar** `https://perrylink-dsh-catalog.perrylink.workers.dev/catalog-source.json` **→ seleccionarlo**. La instalación sigue pasando por la verificación de identidad npm del mercado y tu confirmación.

## License

Apache-2.0. Avisos de terceros en [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
