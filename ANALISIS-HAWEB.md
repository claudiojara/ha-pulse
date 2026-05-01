# Análisis profundo — Proyecto HAWeb

> Documento de partida para construir desde cero `ha-pulse` tomando como referencia
> `/Users/claudiojara/dev/homeassistant/HAWeb`. Generado con exploración profunda
> (Opus 4.7, 1M context) sobre frontend, backend, integración con Home Assistant, agente
> conversacional, datos, tests, y patrones de desarrollo.

---

## 1. Resumen ejecutivo

### ¿Qué es HAWeb?

Aplicación web externa que se integra con una instancia local de **Home Assistant**
(`http://192.168.100.190:8123`) para:

1. **Mostrar el estado** de entidades en tiempo real (luces, switches, sensores, cámaras, media players)
2. **Controlar dispositivos** desde el dashboard (toggle, brillo, color, climate)
3. **Operar HA con lenguaje natural** mediante un chat con Claude API + tool_use
4. **Ofrecer múltiples templates de UI** (Nova oscuro, Glass glassmorphism claro)

La arquitectura es la canónica recomendada por la guía oficial de HA:

```
[Astro Frontend] ←Socket.IO→ [Node.js Backend] ←WebSocket→ [Home Assistant]
                                  ↓
                         [Claude API + ha-mcp]
```

El **token nunca sale del backend**, una sola conexión persistente a HA, broadcast a todos
los clientes via Socket.IO.

### Estado real

- **Funcional como PoC**, pero no listo para producción.
- Dos templates en distinto grado de madurez (Nova más maduro, Glass más limpio pero incompleto).
- Hay deuda técnica considerable: cero TypeScript, tests parciales, datos estáticos vs vivos
  conviven inconsistentemente, monolitos JS construyendo DOM imperativo, CSS duplicados.
- El chat con Claude funciona con streaming + tool_use, pero el contexto crece sin límite.

### Recomendación general para el nuevo proyecto

Rescatar **patrones e ideas**, no código. Rearmar el frontend con TypeScript estricto, una
sola convención visual, y un sistema de estado real. Mantener la idea backend (proxy fino +
chat handler + DB de catálogo), pero arreglar listeners, throttling y CORS desde el día uno.

---

## 2. Stack y dependencias reales

### Backend (`backend/`)

- **Node.js + CommonJS** (`"type": "commonjs"`)
- `express@4.21.2` + `socket.io@4.8.1` + `ws@8.18.0`
- `home-assistant-js-websocket@9.6.0` — librería oficial; maneja reconexión y re-suscripción
- `@anthropic-ai/sdk@0.79.0` — cliente Claude
- `@modelcontextprotocol/sdk@1.27.1` — MCP client (proxy a `ha-mcp` via stdio)
- `better-sqlite3@12.8.0` — DB local en WAL mode
- `dotenv@16.4.5`, `cors@2.8.6`

Scripts: `npm start` (`node src/index.js`), `npm run dev` (`node --watch src/index.js`).

### Frontend (`frontend/`)

- **Astro 5.0.0** + **Svelte 5.54.0** + **Tailwind 3.4.19**
- `socket.io-client@4.8.3`
- `"type": "module"` (mientras backend es commonjs — inconsistencia, pero típica)

Scripts:

```json
"fetch-ha":  "bash ../scripts/fetch-ha-data.sh",
"dev":       "astro dev --port 4321 --host",
"dev:fresh": "npm run fetch-ha && astro dev --port 4321 --host",
"build":     "npm run fetch-ha && astro build"
```

### Raíz

- `vitest` + `@playwright/test` — los tests viven en `tests/` y `tests/e2e/`, no en frontend ni backend.
- `package.json` raíz orquesta `npm run dev` corriendo backend y frontend en paralelo después
  de `source ~/scripts/ha-dev.sh`.

---

## 3. Backend en detalle

### 3.1 `haClient.js` (~50 líneas)

Crítico, mínimo, hace su trabajo.

```js
globalThis.WebSocket = require("ws");          // monkey-patch global
const auth = createLongLivedTokenAuth(HA_URL, HA_TOKEN);
connection = await createConnection({ auth, setupRetry: -1 });
connection.subscribeEvents(cb, "state_changed");
```

**Bien:** `setupRetry: -1` deja que la librería oficial maneje reconexión y re-suscripción
automáticamente — exactamente el patrón que recomienda la guía.

**Mal:**
- `stateChangedCallbacks.push(cb)` no soporta unregister. Si el módulo se importa varias veces
  o se hace hot-reload, los callbacks se duplican.
- Sin `connection.addEventListener('disconnected', ...)` para notificar a clientes que HA cayó.
- `globalThis.WebSocket = require("ws")` es necesario porque `home-assistant-js-websocket` usa
  WebSocket del entorno. Funciona, pero es feo y hay que recordarlo en cualquier reescritura.

**Lección registrada en `tasks/lessons.md`:** `subscribeEvents` NO es export del paquete, es
método de la instancia `Connection`. Importante.

### 3.2 `index.js` (~200 líneas) — servidor principal

**Endpoints REST:**
- `GET  /api/health`
- `GET  /api/states?domain=light` — snapshot filtrado
- `POST /api/service` — proxy a `callService`
- `POST /api/chat` — fallback REST (sin streaming)
- `GET  /api/camera/:id/snapshot` — proxy con anti-cache
- `GET  /api/camera/:id/stream` — MJPEG con backpressure
- `GET  /api/mcp/status`
- `/api/db/*` montado desde `routes/db.js`

**Socket.IO:**
- `connection` → emite `initial_states`
- `chat:message` → corre el handler con streaming (`chat:chunk`, `chat:tool`, `chat:done`, `chat:error`)
- `state_changed` → **`io.emit(...)` global, sin throttle, sin filtrado por cliente**

**Mal:**
- `cors: { origin: "*" }` — en producción es un agujero.
- HA emite `state_changed` cientos de veces/min (sensores, cámaras, batería). Con N clientes
  conectados → N × cientos por minuto en cada socket. Sin throttle ni dedup ni filtrado por
  rooms/dominio.
- `uncaughtException` y `unhandledRejection` se loguean pero no reinician el proceso. En PM2/systemd
  sería mejor crashear y dejar que el supervisor levante.

### 3.3 `chatHandler.js` (~130 líneas) — agente con Claude

Hace muchas cosas bien:

- Auto-switch de modelo: **Sonnet 4.6** (complejo) vs **Haiku 4.5** (simple) según regex sobre el
  mensaje del usuario (palabras clave: automatización, escena, diagnóstico, etc.).
- Streaming con `stream.on('text', cb)` que emite cada chunk al cliente.
- Loop agentic con `MAX_ITERATIONS = 5` hardcoded.
- Tool use en paralelo cuando Claude pide múltiples herramientas.
- Set dinámico de tools: en modo simple sólo ~11 core, en complejo todas las del MCP (~50).
- System prompt advierte sobre tools destructivas y pide que NO verifique con `get_state` después
  de un `call_service` (control de costos).

**Mal / a mejorar:**
- **Context window sin límite.** Mantiene `messages[]` completo entre turnos. A los 100 mensajes
  el costo se dispara. Falta sliding window o compactación.
- **Sin prompt caching.** Claude soporta caching de system prompt + tools (50%+ ahorro). Acá no se
  usa. Es la primera optimización a hacer.
- Auto-switch por regex es frágil; con caching de prompt común sería mejor mandar siempre Sonnet
  o usar un router más serio.
- Sin queue ni rate-limit por cliente: 5 hops × N requests simultáneos puede saturar la API.

### 3.4 `mcpClient.js` (~130 líneas)

Cliente MCP que arranca `uvx ha-mcp` como subproceso vía stdio.

- Cachea la lista de tools al conectar.
- Reintentos con backoff exponencial (2s → 30s).
- Timeout de 120s por tool (configurable con `MCP_TOOL_TIMEOUT_MS`).
- Set hardcoded de "tools destructivas" (restart, backup_restore...) que se mencionan en el system
  prompt — pero **no se bloquean**, el modelo decide.

**Smell:** todo el chat depende de que `uvx ha-mcp` esté disponible y funcione. Si MCP cae, el
chat sigue corriendo en "modo degradado" (sin tools), lo cual confunde al usuario porque parece
que Claude no sabe nada del HA. Falta señalización al frontend.

### 3.5 DB local — `db/` + `routes/db.js`

**Schema (`schema.sql`, 115 líneas):**

```
domains            (domain_id, label, color, entity_count)
areas              (area_id, name, size, bg_class, display_order, icon_key)
entities           (entity_id, domain FK, area_id FK, state, attributes JSON)
devices            + device_domains (M:N)
templates          (catálogo de UI templates: Nova, etc.)
dashboards         (configuraciones persistidas)
components         (catálogo de componentes UI: LightCard, MediaControls...)
fetch_log          (auditoría de syncs)
```

WAL mode con `better-sqlite3`, archivo en `backend/data/haweb.db`. Migración on-init agrega
columnas UI si faltan. Seed lee `frontend/public/data/ha-data.json` y hace upsert con transacciones.

**Bien:** transacciones, idempotencia, COALESCE para preservar metadata UI en re-syncs.

**Mal:**
- Hay **doble fuente de verdad**: la DB tiene snapshot estático, los estados vivos vienen del
  WebSocket. Se desincronizan rápido. El frontend debería confiar en el live state — y la DB
  servir sólo como catálogo (qué áreas, qué dominios, qué dispositivos), no como estado.
- Catálogo de componentes (`catalog-seed.js`) hardcoded; agregar uno requiere edit + re-seed.
- `er-diagram.html` en `docs/` puede estar desincronizado del schema real.

**Endpoints `/api/db/*`:**

- `/areas`, `/entities`, `/domains`, `/components`, `/stats` — lecturas estándar.
- `/rooms` — agrupa entidades por rol (lights, temp, humidity, presence, camera, media_player).
  **Esto es lo que consume Nova y Glass** para construir la lista de habitaciones del sidebar.
- `/media-players` — lista global.
- `POST /seed` — recarga desde JSON.
- `POST /dashboards` — guarda configuración con transacción atómica.

### 3.6 Scripts de soporte

`scripts/fetch-ha-data.sh` (~206 líneas, único script real):

1. Lee `HA_TOKEN` del Keychain (`security find-generic-password -a "ha" -s "HA_TOKEN" -w`).
2. Llama REST `/api/states` y `/api/template` (con Jinja2 para `areas()`, `area_entities()`,
   `area_devices()`).
3. Procesamiento paralelo en Python embebido (5 áreas concurrentes).
4. Genera `frontend/public/data/ha-data.json` con 10 secciones (lights, media_players, sensors,
   binary_sensors, automations, scripts, scenes, areas, devices, stats).

**Bien:** uso correcto de Jinja templates server-side, paralelización, salida ordenada.
**Mal:** mezcla de bash + Python embebido, frágil de mantener. Reescribirlo en Node con la misma
conexión WebSocket que ya usa el backend sería más simple.

---

## 4. Frontend en detalle

### 4.1 Páginas (`src/pages/`)

| Página | Tamaño | Propósito |
|---|---|---|
| `index.astro` | 14KB | Dashboard principal con DashboardSelector y dashboards configurables |
| `nova.astro` | 6.5KB | Template Nova (oscuro) — multi-view con sidebar |
| `glass.astro` | 3.7KB | Template Glass (claro, glassmorphism) — multi-view |
| `glass-catalog.astro` | 20KB | Showcase de todos los componentes Glass |
| `ha-map.astro` | 43KB | Visualizador 3D + lista de entidades con buscador |
| `mcp-reference.astro` | 75KB | Referencia copy-paste de tools MCP |

**Problema obvio:** las dos páginas más grandes son monolitos. `mcp-reference.astro` (1414 líneas)
parece ser doc estático que no debería ser una página Astro — es contenido más apto para Markdown.
`ha-map.astro` mezcla canvas, búsqueda, filtrado y render en un solo archivo.

### 4.2 Sistema de dashboards configurables

`src/dashboards/dashboardConfig.js` + `default.js` + `nova.js`.

Persistencia: `localStorage['haweb_dashboard_config']` con shape:

```js
{ activeDashboard: 'default'|'nova', dashboards: { default: {...}, nova: {...} } }
```

Cada dashboard implementa una interfaz:

```js
{ id, name, description, buildCard(state), getStyles(), onActivate(), onDeactivate() }
```

`index.astro` hace JS imperativo: itera estados, llama `buildCard(state)`, inyecta DOM,
escucha `state_changed`, actualiza cards una a una.

**Bien:** el patrón de "dashboard como módulo con interfaz fija" es extensible y portable.

**Mal:**
- Los `buildCard` construyen DOM con `document.createElement` y strings HTML. Imposible de testear,
  mantener o tipar. **Esto debería ser componentes Svelte/Astro nativos.**
- `nova.js` (242 líneas) hace **todo** ahí: estilos en `getStyles()` como string CSS, sidebar,
  cards, eventos. Cero composición.
- `DashboardSelector.astro` es un `<details>` HTML con lógica en inline script. Sin reactividad.

### 4.3 Template Nova (dark)

Estructura:

```
src/components/nova/
  ├── layout/      NovaShell, NovaHeader, NovaSidebar, PresenceBar
  ├── cards/       RoomCard, RoomTile, MediaCard, SensorCard, CameraFeed, ...
  ├── views/       ViewRoomDetail, View3DOverview, ViewMultiRoomGrid, ViewImmersive
  ├── primitives/  Toggle, DotBar, BatBar, ExpandBtn, LiveBadge
  └── svelte/      ~12 componentes Svelte 5 reactivos
```

Datos: build-time obtiene rooms desde `/api/db/rooms` (BE), inyecta en `window.NOVA_ROOMS`.
Actualizaciones en vivo via `entityStore` (Svelte store + Socket.IO).

Estilos: `public/styles/nova-tokens.css` (variables) + `nova-base.css` (resets, grid).
Mezcla scoped `<style>` en Astro + Tailwind en Svelte + CSS inline en `nova.js`. Tres convenciones
para lo mismo.

**Lección registrada (`tasks/lessons.md` 2026-03-19):** scoped `<style>` no aplica a HTML inyectado
por JS. Hay que usar `<style is:global>`. Ya pasó una vez, cuidado al portar.

### 4.4 Template Glass (claro, glassmorphism)

Estructura:

```
src/components/glass/
  ├── layout/      GlassShell, GlassSidebar, GlassRoomTabs, GlassUserStrip
  ├── cards/       ~15 cards: LightCard, ClimateCard, MediaCard, WeatherCard...
  ├── pills/       GlassSwitchPill, GlassSensorPill, GlassBinarySensorPill
  ├── primitives/  GlassToggle, GlassRingGauge
  ├── svelte/      GlassLightInteractive.svelte (único, "estrella")
  └── views/       ViewGlassHome, ViewGlassMultiRoom, ViewGlassRoomDetail
```

Datos: build-time filtra `ha-data.json`, inyecta `window.GLASS_ROOMS`. **No usa el BE en build —
inconsistente con Nova.**

Multi-view: `glass-controller.js` cambia entre `#view-glass-home`, `#view-glass-grid`,
`#view-glass-room-{id}` con teclado y URL hash.
`glass-interactions.js` (~350 líneas) maneja drag en rings, sliders, llamadas a `callHAService`.

`GlassLightInteractive.svelte` es el componente más sofisticado del proyecto: SVG arc gauge con
gradiente animado, bulb con glow dinámico, sliders Hue + ColorTemp, suscripción a `entityStore`.

**Bug latente** señalado por el subagente, vale verificar al portar:

```js
$effect(() => entities.subscribe(map => { entity = map[entityId]; }));
// Falta cleanup: const unsub = entities.subscribe(...); return () => unsub();
```

Si el componente se monta y desmonta muchas veces (cambio de cuarto), las suscripciones se
acumulan.

### 4.5 ChatWidget (`src/components/ChatWidget.astro`, ~290 líneas)

Botón flotante + panel modal. Streaming via Socket.IO (`chat:chunk`, `chat:tool`, `chat:done`).

Selector de modelo en UI: **Haiku / Auto / Sonnet**. La heurística "Auto" predice qué modelo
usaría el backend (regex), muestra "TTFC" (time-to-first-chunk) y total.

**Bien:** UX clara, streaming visible, chips de modelo.

**Mal:**
- Toda la lógica está inline en el `.astro`. Sin tipos, sin tests.
- `chat:tool` solo muestra el nombre. No hay UI estructurada para argumentos / resultados.
  Ideal sería expander con JSON pretty.
- Historial sólo en memoria — al recargar se pierde todo.

### 4.6 Estado del cliente — `src/stores/entityStore.js`

```js
import { writable } from 'svelte/store';
import { io } from 'socket.io-client';

const BACKEND_URL = 'http://localhost:3001';   // hardcoded
const socket = io(BACKEND_URL);                // se conecta al IMPORTAR

export const entities  = writable({});
export const connected = writable(false);
export const optimisticMedia = writable({});

socket.on('initial_states', ...);
socket.on('state_changed',  ...);

export async function callService(domain, service, entityId, data = {}) { ... }
```

**Bien:** simplicidad, optimistic updates en `optimisticMedia`, una sola fuente de verdad.

**Mal:**
- URL hardcoded. En build de producción apunta a localhost. Hay que pasarla por env (`PUBLIC_BACKEND_URL`).
- Conexión al **import**, no al uso. Si una página no necesita socket, igual abre uno.
- `callService(..., data = {})` hace `body: JSON.stringify({ domain, service, target: {entity_id}, ...data })`.
  Si `data` tiene una key `domain` o `service`, se sobreescribe la firma. Bug latente.

### 4.7 Estilos

- `public/styles/nova-tokens.css` + `nova-base.css`
- `public/styles/glass-tokens.css` + `glass-base.css`

Convención mixta:
- Tailwind escanea `'./src/**/*.{astro,html,js,ts}'` — **no incluye `.svelte`**. Si una clase
  Tailwind sólo aparece en `.svelte`, no se genera.
- Scoped `<style>` en Astro.
- CSS inline en JS (`nova.js`).
- Variables CSS para tokens (lo mejor del set).

Sin BEM, sin CSS modules. Nombres ad-hoc (`.lc`, `.gli-card`, `.g-main`) → riesgo de colisión.

### 4.8 Tests

- `tests/chatbot.test.js` (5.8KB) — Vitest sobre el handler de chat.
- `tests/e2e/` — Playwright. Los commits mencionan "E2E Playwright para multi-view navigation 17 tests".
- `frontend/test-results/` está vacío (ese es el output de la última corrida, no la fuente).

Cobertura: chat (parcial) + flujos multi-view de Glass. **Cero tests de Nova, cero tests de
backend, cero unit tests de stores.**

---

## 5. Integración con Home Assistant — patrones a copiar

De la documentación interna y el código real, los patrones que **están bien resueltos** y vale
la pena replicar tal cual:

1. **Una sola conexión WebSocket en el backend.** El frontend nunca habla directo con HA. El
   token nunca sale del backend. Esto es lo que recomienda la guía oficial.
2. **REST sólo para snapshot inicial y `call_service`.** No usar REST para tiempo real (no
   soporta eventos). No usar `POST /api/states/<id>` para controlar dispositivos — sólo
   actualiza la representación interna, no manda comando físico. Siempre `POST /api/services/<domain>/<service>`.
3. **IP directa**, no `homeassistant.local`. Ahorra ~10ms de mDNS por request.
4. **`home-assistant-js-websocket` con `setupRetry: -1`** maneja reconexión y re-suscripción
   sola. No reinventar la rueda.
5. **Tokens en Keychain de macOS**, no en `.env` versionado. Cargar con `~/scripts/ha-dev.sh`.
   La regla del proyecto es: **nunca leer tokens inline**, siempre `source`.
6. **MCP `ha-mcp`** durante desarrollo da 82+ tools listas para que Claude opere HA en el IDE.
   En producción se mapean tools a llamadas REST/WebSocket directas (no se necesita MCP).

---

## 6. Problemas, riesgos y deuda técnica

### Críticos

1. **Sin throttle en broadcast de `state_changed`.** Saturación con N clientes y muchos sensores.
   Mínimo: debounce por `entity_id` y filtrado por dominio relevante.
2. **CORS abierto (`origin: "*"`).** Configurar allowlist desde el inicio.
3. **Context window del chat sin límite.** Costos crecen O(n) por mensaje. Implementar sliding
   window o compactación.
4. **Sin prompt caching en Claude API.** El system prompt + tools (~5000 tokens) se manda en
   cada request. Cachearlo es la primera optimización (50%+ ahorro).
5. **Listeners sin unregister en `haClient`.** Memory leak si el módulo se importa varias veces
   o hay hot-reload.
6. **`entityStore` con URL hardcoded.** No funciona en build de producción.

### Medianos

7. **Doble fuente de verdad (DB vs live state).** La DB debería ser sólo catálogo. El estado
   real viene del WebSocket.
8. **Datos estáticos `ha-data.json` vs vivos del BE conviven sin coherencia.** Glass usa el JSON,
   Nova el BE.
9. **Cero TypeScript.** 60 componentes Astro sin tipos de props.
10. **Tailwind no escanea `.svelte`.** Clases pueden no generarse.
11. **JS imperativo en dashboards.** `nova.js` y `default.js` construyen DOM con strings → imposible
    de testear.
12. **Páginas monolito.** `mcp-reference.astro` (75KB) y `ha-map.astro` (43KB) deberían partirse.
13. **CSS duplicado entre Nova/Glass + inline en JS.** Tres convenciones para lo mismo.
14. **Memory leak potencial en `GlassLightInteractive.svelte`** — `$effect` con `.subscribe()`
    sin cleanup.

### Menores

15. Tests cubren chat parcial + Glass multi-view. Nada para Nova ni para stores.
16. `mcp-reference.astro` parece doc estática que no merece ser página.
17. `globalThis.WebSocket = require("ws")` — feo pero necesario.
18. `er-diagram.html` puede estar desincronizado del schema.
19. Catálogo de componentes hardcoded en `catalog-seed.js` (no API para agregar).
20. Camera proxy sin reconexión automática ni control de concurrencia.

---

## 7. Cosas a medio camino

- **Tests E2E mencionados en commits** que pueden no corresponderse 1:1 con lo que hay en `tests/e2e/`.
  Verificar que corren antes de tomarlos como referencia.
- **Templates Nova vs Glass:** uno usa BE en build, el otro JSON estático. Sin decisión final.
- **DB como catálogo vs como estado:** sin línea clara. Schema soporta ambas, código las mezcla.
- **Componentes huérfanos:** algunos cards de Glass (ej. `GlassEnergyCard`) pueden no estar
  importados en ninguna vista. Faltó audit.
- **MCP en producción:** funciona en dev, pero en prod nadie verificó si arranca limpio en
  contenedor sin macOS Keychain.
- **PostgreSQL planeado, nunca migrado.** El comentario "migrar en Fase 2" sigue ahí.
- **Documentación inexistente.** Cero JSDoc, cero README en `frontend/` ni `backend/`.
  El "patrón de cómo agregar nueva vista/componente" no está escrito en ningún lado.

---

## 8. Recomendaciones para `ha-pulse` (proyecto nuevo)

### Stack propuesto

- **Frontend:** Astro 5 + Svelte 5 + Tailwind 4 + **TypeScript estricto**
- **Backend:** Node.js **ESM** + Fastify (más rápido y schemas nativos) o seguir con Express
- **DB:** SQLite con `better-sqlite3` para catálogo. Estado en memoria + WebSocket. PostgreSQL
  sólo si hay multiusuario real.
- **Tests:** Vitest (unit + integración) + Playwright (E2E) **desde día uno**.
- **Lint:** Biome (rápido, un solo binario, formatea + linta).

### Reglas duras

1. **Una sola convención CSS.** Tokens (variables) + Tailwind. Cero CSS inline en JS, cero
   estilos generados desde un módulo de dashboard.
2. **TypeScript estricto.** `interface Props` en todos los `.astro`. Stores tipadas.
3. **Tailwind config incluye `.svelte`** desde el primer commit.
4. **`PUBLIC_BACKEND_URL` por env**, no hardcoded.
5. **Listeners con unregister.** `onStateChanged` retorna un dispose function:
   ```ts
   const dispose = onStateChanged(cb); // ... dispose();
   ```
6. **Throttle/debounce en broadcast** por `entity_id`. 60Hz máximo.
7. **Prompt caching desde el inicio** en Claude API (system + tools cacheados).
8. **CORS con allowlist explícita** en `.env` (`ALLOWED_ORIGINS=...`).
9. **Sliding window de chat** (últimos N turnos o tokens).
10. **DB sólo como catálogo de UI/áreas/dominios.** Estado vivo siempre del WebSocket.
11. **Componentes Astro/Svelte para todo render.** Cero `document.createElement` para construir
    UI primaria.

### Estructura propuesta

```
ha-pulse/
├── apps/
│   ├── frontend/   # Astro + Svelte + TS
│   └── backend/    # Node ESM + Fastify
├── packages/
│   ├── shared/     # tipos compartidos (entity, area, room)
│   └── ha-client/  # wrapper sobre home-assistant-js-websocket con dispose APIs
├── scripts/
│   └── fetch-ha-data.ts   # Reescrito de bash+python a TS
├── docs/
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

### Plan de migración por fases

**Fase 0 — Skeleton (1 día)**
- Monorepo (pnpm workspaces o turborepo). TypeScript estricto. Biome. Vitest + Playwright vacíos.
- `packages/shared/` con tipos `Entity`, `Area`, `Room`, `Domain`.
- Scripts raíz: `dev`, `test`, `lint`, `typecheck`.

**Fase 1 — Backend mínimo (2-3 días)**
- `packages/ha-client` con wrapper de `home-assistant-js-websocket` que retorna dispose functions.
- Backend Fastify: `/api/health`, `/api/states`, `/api/service`, Socket.IO con `state_changed`
  throttled. CORS con allowlist. Cero DB todavía.
- Tests unit del wrapper + integración con HA real (skippeable si no hay token).

**Fase 2 — Frontend mínimo (2 días)**
- Una sola página, un solo template (lo más limpio de Glass o Nova). Lista de luces y switches.
  Toggle funcional.
- `entityStore` tipado, URL por env, tests.

**Fase 3 — Catálogo + áreas (2 días)**
- DB SQLite con schema simplificado (sólo catálogo: domains, areas, devices, components).
- Endpoint `/api/db/rooms` agrupando entidades por rol.
- Sidebar/grid de habitaciones en el frontend.

**Fase 4 — Chat con Claude (3 días)**
- `chatHandler` con prompt caching, sliding window, MAX_ITERATIONS configurable, streaming via
  Socket.IO.
- ChatWidget como componente Svelte tipado, con UI estructurada para `tool_use` (expander con JSON).
- Tests unit del loop agentic.

**Fase 5 — Cámaras + media (2 días)**
- Proxy `/api/camera/:id/snapshot` con caché.
- MediaCard con optimistic updates.

**Fase 6 — Tests + docs (continuo)**
- E2E críticos: toggle de luz, llamada al chat, switch de habitación.
- README en cada app/package. JSDoc en stores y wrapper.

### Qué rescatar literalmente

- **Schema de DB** (simplificado). Está bien diseñado, sólo sacar las columnas UI que mezclan
  responsabilidades.
- **Patrón de seed idempotente** con transactions y COALESCE.
- **System prompt del chat** (después de revisarlo) — ya tiene instrucciones afinadas (no
  verifiques con `get_state`, etc.).
- **`fetch-ha-data.sh`** reescrito en TS usando la misma conexión WebSocket del backend.
- **CSS variables tokens** (nova-tokens.css y glass-tokens.css). Se pueden unificar.
- **Detección de complejidad para auto-switch de modelo** — útil pero implementar como router
  más serio.

### Qué NO portar

- `dashboards/nova.js` y `default.js` (constructores DOM imperativos).
- `mcp-reference.astro` (75KB de doc estática como página).
- `glass-catalog.astro` como página de prod (sí como Storybook interno).
- Tres convenciones de CSS conviviendo.
- `globalThis.WebSocket = require("ws")` si se va a ESM puro (existen alternativas).

---

## 9. Lecciones registradas que valen oro

De `tasks/lessons.md`:

1. **`subscribeEvents` no es export del paquete** — es método de `Connection`. Verificar siempre
   con `Object.keys(require('home-assistant-js-websocket'))` antes de importar.
2. **`source script.sh && npm start` no hereda env vars** en cadenas con `&&`. Pasarlas explícitas
   o asignarlas inline.
3. **Astro interpreta `{{ }}` como JS.** Para Jinja2 escapar con `{"{{ tu_template }}"}`.
4. **`<style>` scoped no aplica a HTML inyectado por JS.** Usar `<style is:global>` cuando hay
   `innerHTML`/`createElement`.
5. **Verificar HTTP status con `curl` antes de cerrar tarea.** Más de una vez se cerró un issue
   con la página dando 500.

---

## 10. Conclusión

HAWeb funciona como PoC y tiene **decisiones de arquitectura sólidas** (proxy backend, una conexión
WS, token server-side, MCP en dev). El problema no es la arquitectura — es la implementación:
falta tipado, faltan tests, falta una sola convención visual, el chat no tiene caching, los
listeners no se limpian.

Para `ha-pulse` la jugada es:

- **Arquitectura: igual.** Funciona y es la canónica.
- **Implementación: empezar de cero** con TypeScript, Biome, Vitest+Playwright, una sola
  convención, prompt caching, dispose functions desde el día uno.
- **Rescatar:** schema de DB, seed pattern, system prompt del chat, tokens del Keychain, regla
  de IP directa, regla de no usar `POST /api/states/<id>`.

El laburo no es portar — es **rearmar con la misma idea pero hecho como gente seria**. Y desde
el primer commit, no después.
