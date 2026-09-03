# dsh-reach

Puente multicanal de decisiones y control remoto para [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH): envía las tarjetas de aprobación/pregunta de cualquier espacio de trabajo a canales IM (primero WeChat iLink) y permite responderlas desde el chat, con consola de sesión, seguridad por canal y un servicio abierto de notificaciones.

> **Estado: andamiaje de la Fase 0 (v0.1.1).** El plan de diseño, la
> investigación de la competencia, la verificación de contratos oficiales y la
> hoja de ruta están en
> [`docs/design/03-rebuild-direction-and-plan.md`](docs/design/03-rebuild-direction-and-plan.md).
> El canal de WeChat y el puente de decisiones llegan en la Fase 1.

## Install

```bash
npx @deepseek-ai/dsh plugin --profile web add dsh-reach
dsh1024 plugin --profile web add dsh-reach
```

Reinicia DSH tras la instalación (los parches del bundle se aplican al arrancar).

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

## License

Apache-2.0. Avisos de terceros en [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
