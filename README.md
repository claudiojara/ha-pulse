# dashboard-web

Dashboard web reactivo para Home Assistant. SPA en React + Vite con backend Fastify, conectados por Socket.IO. Chat con Claude API integrado.

> **Lectura previa obligada:** [ANALISIS-HAWEB.md](./ANALISIS-HAWEB.md) — análisis profundo del proyecto anterior con patrones, decisiones y errores a evitar.

## Stack

### Frontend (`apps/web`)

- React 19 + Vite 6
- TypeScript estricto
- TanStack Router (file-based, type-safe)
- TanStack Query (server state)
- Zustand (UI state global)
- shadcn/ui + Tailwind CSS 3.4
- socket.io-client

### Backend (`apps/api`)

- Node 22 + Fastify (ESM)
- Socket.IO server
- `home-assistant-js-websocket` (conexión persistente con HA)
- `@anthropic-ai/sdk` (chat con Claude — Fase 4)
- `better-sqlite3` (catálogo de UI — Fase 3)

### Tipos compartidos

- `packages/shared` — interfaces Entity, Area, Domain, ServiceCallPayload, etc.

## Requisitos

- Node 22+
- pnpm 10+
- Home Assistant accesible (por default `http://192.168.100.190:8123`)
- Long-Lived Access Token de HA en macOS Keychain:
  ```bash
  security add-generic-password -a "ha" -s "HA_TOKEN" -w "<tu_token>"
  ```

## Setup

```bash
# 1. Cargar variables de entorno (HA_URL, HA_TOKEN, ANTHROPIC_API_KEY)
source ~/scripts/ha-dev.sh

# 2. Instalar dependencias
pnpm install

# 3. Levantar todo (api + web en paralelo)
pnpm dev
```

- API: `http://localhost:3001`
- Web: `http://localhost:5173`

## Scripts

| Comando | Descripción |
|---|---|
| `pnpm dev` | Levanta api + web en paralelo |
| `pnpm dev:api` | Solo backend |
| `pnpm dev:web` | Solo frontend |
| `pnpm build` | Build de producción |
| `pnpm test` | Vitest en todos los workspaces |
| `pnpm test:e2e` | Playwright E2E |
| `pnpm lint` | Biome check |
| `pnpm lint:fix` | Biome check con auto-fix |
| `pnpm typecheck` | TypeScript en todos los workspaces |

## Estructura

```
dashboard-web/
├── apps/
│   ├── api/          # Fastify + Socket.IO + HA client
│   └── web/          # React + Vite + shadcn
├── packages/
│   └── shared/       # Tipos TS compartidos
├── tests/            # E2E con Playwright
├── ANALISIS-HAWEB.md # Análisis del proyecto anterior
└── README.md
```

## Decisiones de arquitectura (resumen)

- **SPA pura** (no MPA, no SSR). Un solo árbol React, navegación con TanStack Router, socket persistente entre rutas.
- **Backend separado** (no full-stack Next.js). Socket.IO bidireccional sin custom server tricks.
- **Token nunca llega al frontend.** Vive en `apps/api` y se carga desde Keychain.
- **DB local solo como catálogo de UI** (áreas, dominios, layout). Estado real de entidades viene del WebSocket.
- **Dispose pattern** en todos los listeners desde el día uno.
- **Throttle de `state_changed`** por entity_id antes de broadcast.
- **CORS con allowlist** por env, no `*`.
- **Prompt caching** desde el primer request a Claude.

Detalle completo en [ANALISIS-HAWEB.md](./ANALISIS-HAWEB.md).

## Estado actual

**Fase 0 — Skeleton.** Hello World funcional: lista de luces de tu HA con toggle real.

Próximas fases:

1. Catálogo de áreas + sidebar de habitaciones (Fase 1)
2. Cards por dominio (climate, media, sensor, camera) (Fase 2)
3. DB SQLite con catálogo de UI (Fase 3)
4. Chat con Claude API + tool_use (Fase 4)
