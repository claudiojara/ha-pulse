# Roadmap — dashboard-web

> Plan de fases para construir el dashboard. Cada fase es un commit (o varios), pequeña, verificable end-to-end. **No avanzar a la siguiente fase sin antes verificar la actual contra HA real.**

## Estado actual

**Fase 0 — Skeleton** ✅ completada (commit `54403fd`).

Lo que ya funciona:

- Monorepo pnpm con `apps/api`, `apps/web`, `packages/shared`.
- Backend Fastify + Socket.IO conectado a HA real, broadcast de `state_changed` con throttle por `entity_id`.
- Frontend React 19 + Vite con TanStack Router/Query + Zustand + shadcn/ui.
- Página única `/` mostrando todas las luces con toggle (optimistic + reconcile).
- Tipos compartidos en `@dashboard-web/shared`.

Verificación: backend respondió `/api/health` con `"ha":"connected"`, frontend cargó y socket conectó.

---

## Cómo retomar (cold start)

```bash
cd /Users/claudiojara/Workspace/personal/home-assistant/dashboard-web

# 1. Cargar tokens desde Keychain (HA_URL, HA_TOKEN, ANTHROPIC_API_KEY)
source ~/scripts/ha-dev.sh

# 2. Si es primera vez en este equipo
pnpm install

# 3. Generar .env del backend desde el token del Keychain (solo si no existe)
[ ! -f apps/api/.env ] && cp apps/api/.env.example apps/api/.env && \
  sd '^HA_TOKEN=.*$' "HA_TOKEN=$HA_TOKEN" apps/api/.env

# 4. Levantar todo
pnpm dev
```

Abrí `http://localhost:5173`. Si ves tus luces y los toggles responden, todo OK.

**Si algo falla:**

- `pnpm dev:api` y mirá los logs de Fastify. Buscá `[HA] conectado`.
- Healthcheck: `curl http://localhost:3001/api/health` debe devolver `"ha":"connected"`.
- Si HA no conecta: verificar `HA_URL` (¿está prendido el HA?), `HA_TOKEN` (no expiró), red local.

---

## Fase 1 — Áreas y navegación entre habitaciones

**Objetivo:** sidebar con todas las áreas de tu HA. Click en una habitación cambia la ruta y muestra solo sus entidades. La navegación NO debe cerrar el socket ni perder estado.

### Tareas

1. **Backend:** exponer áreas via WebSocket. Suscribir al `area_registry_updated` de HA y enviar snapshot inicial al cliente.
   - Nuevo evento Socket.IO: `initial_areas` y `areas_updated`.
   - Endpoint REST `/api/areas` (fallback / debug).
2. **Tipos compartidos:** agregar `Area` y eventos `ServerToClientEvents` extendidos en `packages/shared`.
3. **Store frontend:** `useAreasStore` (Zustand) con `areas: Record<AreaId, Area>`.
4. **Routing:** rutas de TanStack Router:
   - `/` — overview con todas las habitaciones.
   - `/room/$areaId` — detalle de una habitación.
5. **Componentes:**
   - `Sidebar` con lista de áreas, marca la activa.
   - `RoomView` que filtra entidades por `entity.attributes.area_id` (o el helper que aplique).
6. **Verificar:**
   - Cambiar de habitación con teclado (botones del sidebar).
   - El socket NO se cierra (mismo `socketId` antes y después).
   - Toggle de una luz en `/room/cocina` se ve también en `/` (si la luz aparece ahí).
   - Header sticky con contador "luces encendidas: N" reactivo cross-route.

### Criterios de "done"

- [ ] Sidebar con tus áreas reales.
- [ ] Click cambia URL y filtra contenido.
- [ ] Counter de luces encendidas en header reactivo.
- [ ] Socket único persistente entre rutas (verificar en logs del backend).
- [ ] Tests E2E con Playwright: navegar entre habitaciones, toggle, verificar contador.

---

## Fase 2 — Cards por dominio

**Objetivo:** dejar de mostrar todo como toggle. Cada dominio tiene su card especializada.

### Tareas

1. `LightCard` con brillo (slider), color (color picker), color temp.
2. `SwitchCard` (lo que ya tenés básicamente).
3. `SensorCard` con valor + unidad + ícono según `device_class`.
4. `BinarySensorCard` con estado on/off + label semántico (motion/door/window).
5. `ClimateCard` con set point, modo (heat/cool/auto/off), temp actual.
6. `MediaPlayerCard` con play/pause/next/prev + volumen + título/artista + carátula.
7. `CameraCard` con snapshot (refresh cada N seg) + click para stream.

### Decisiones a tomar antes de codear

- ¿Slider de shadcn (Radix) o uno custom con animación?
- ¿Color picker custom o librería (`@uiw/react-color`)?
- Cámaras: ¿stream MJPEG (proxy via backend como HAWeb) o snapshot polling?

### Criterios de "done"

- [ ] Cada dominio tiene su card.
- [ ] Tests unit de cada card con Vitest + Testing Library.
- [ ] Storybook (opcional pero recomendado) o página `/catalog` con todas las cards.

> **Nota:** Fase 0-3 NO se conecta a HA via [ha-mcp](https://github.com/homeassistant-ai/ha-mcp). El dashboard usa `home-assistant-js-websocket` directo porque necesita stream reactivo de `state_changed` (request-response de MCP no encaja). ha-mcp se evalúa solo en Fase 4.

---

## Fase 3 — Persistencia de UI

**Objetivo:** que el usuario pueda configurar layout, ocultar entidades, agrupar, y que persista.

### Tareas

1. **DB SQLite** en `apps/api/src/db/`:
   - Schema simplificado vs HAWeb: solo lo que es UI (no estado de entidades).
   - Tablas: `users` (single-user por ahora con id=1), `room_layouts`, `hidden_entities`, `entity_overrides` (custom name, icon).
   - Migrations con SQL files versionados.
2. **Endpoints REST `/api/preferences/*`** + Socket.IO sync para tiempo real.
3. **Frontend:** modo edición del layout (drag & drop con `@dnd-kit/core`).
4. **Theme:** dark/light toggle persistente.

### Criterios de "done"

- [ ] Modo edición funcional.
- [ ] Cambios persisten entre recargas.
- [ ] Tests de integración con DB en memoria.

---

## Fase 4 — Chat con Claude

**Objetivo:** chat conversacional que controle HA con tool_use. Más eficiente que el de HAWeb.

### Decisión a tomar antes de codear: tools propias vs ha-mcp

[ha-mcp](https://github.com/homeassistant-ai/ha-mcp) es un MCP server (Python, FastMCP) que expone 86+ tools sobre HA: search, control, automations, dashboards, traces, history. Mantenido por el ecosistema HA, releases mensuales. Tradeoffs:

| | Opción A — Tools custom | Opción B — ha-mcp externo | Opción C — Híbrido |
|---|---|---|---|
| **Stack** | Solo Node | Node + Python | Node + Python |
| **Tools** | 5-6 que escribís vos | 86 listas | 86 + las DB-aware tuyas |
| **Latencia** | mínima (un hop) | +1 hop | mixta |
| **Capacidades extra** | — | automations, traces, dashboards, skills built-in | igual que B |
| **Tools DB-aware** (preferences Fase 3) | first-class | no encaja | first-class |
| **Mantenimiento** | todo tuyo | upstream maneja HA, vos solo wiring | upstream + tuyo |

Si elegís B o C: ¿add-on de HA OS o proceso local Python? ¿Anthropic SDK consume MCP nativo o vos hacés el bridge?

Decisión: arrancar con A (tools custom mínimas) para no meter Python ahora. Migrar a C si necesitás features de ha-mcp (automations, traces). Reevaluar al final de Fase 4.

### Tareas

1. **Backend `chatHandler`:**
   - Anthropic SDK con **prompt caching** desde el primer request (system + tools cacheados).
   - **Sliding window** del historial: últimos N turnos o M tokens.
   - Tools: `get_state`, `call_service`, `search_entities`, `get_history`, `list_areas`.
   - Auto-switch Sonnet/Haiku como HAWeb pero refactorizado limpio.
   - Streaming via Socket.IO.
2. **Frontend `ChatPanel`:**
   - Componente Svelte ❌ no, **componente React** tipado.
   - UI estructurada para `tool_use`: cards expandibles con args/result en JSON pretty.
   - Indicador de modelo activo + TTFC.
   - Persiste historial en DB (Fase 3).
3. **Voz (opcional):**
   - Input con Whisper API (`/api/transcribe`).
   - Output con TTS (decidir provider: ElevenLabs, OpenAI TTS, browser native).

### Criterios de "done"

- [ ] Chat funciona end-to-end con HA real.
- [ ] Prompt caching activo (verificar `cache_read_input_tokens > 0` en respuestas).
- [ ] Tool calls con UI legible.
- [ ] Tests del loop agentic con mocks.

---

## Fase 5 — Cámaras y media

**Objetivo:** cámaras y media players con UX pulida.

### Tareas

1. Proxy `/api/camera/:id/snapshot` con caché HTTP (Last-Modified + ETag).
2. Stream MJPEG con limit de conexiones concurrentes.
3. MediaPlayerCard con artwork grande, controles, queue.
4. Optimistic updates en media (igual que luces).

---

## Fase 6 — Deploy como add-on de Home Assistant OS

**Objetivo:** publicar el dashboard como add-on instalable desde Home Assistant Supervisor. Cualquier usuario con HAOS / HA Supervised debería poder agregar el repositorio del catálogo en su HA via "Add custom repository" e instalarlo en dos clicks, sin tocar tokens, sin networking custom, sin reverse proxy.

### Decisiones arquitectónicas (tomadas antes de codear)

- **Dos repos separados**:
  - `dashboard-web` (este) — código + imagen Docker publicada a `ghcr.io/<user>/dashboard-web:<version>`.
  - `dashboard-web-addon` (nuevo) — catálogo público con `repository.yaml` + `dashboard-web/config.yaml` que apunta por versión a la imagen de ghcr.io. Es lo que el usuario agrega en HA Supervisor.
- **Mismo proceso, mismo puerto**: el backend Fastify sirve el frontend buildeado (`@fastify/static` + SPA fallback). Razón: ingress de HA expone UN solo puerto del add-on. En `pnpm dev` Vite sigue corriendo aparte con HMR.
- **Multi-arch desde día 1**: `amd64` (HAOS en Proxmox actual) + `aarch64` (futuro Raspberry Pi 4/5). `docker buildx` en GitHub Actions. Si después se quiere Pi Zero 2, se agrega `armv7`.
- **Modo dual en backend**: si existe `SUPERVISOR_TOKEN` en env → modo *supervised* → cliente HA hacia `http://supervisor/core` con ese token. Si no → modo *standalone* → lee `HA_URL`/`HA_TOKEN` como hoy. Esto mantiene `pnpm dev` y `docker compose` funcionales.
- **Imagen base**: `node:22-bookworm-slim` (glibc). NO alpine — `better-sqlite3` con musl da problemas de prebuilt.

### Sub-fases

#### 6.a — Backend sirve frontend + Dockerfile standalone

1. Agregar `@fastify/static` a `apps/api`. Servir el build del frontend en `/` con SPA fallback (devolver `index.html` para rutas que no son `/api/*` ni assets).
2. Nueva variable `WEB_DIST_PATH` en `config.ts` (default `../web/dist` resuelto desde el cwd del proceso). En el contenedor se override a path absoluto.
3. `Dockerfile` raíz multi-stage:
   - `deps` — instala dependencies con `pnpm install --frozen-lockfile`.
   - `build-web` — buildea frontend (`pnpm --filter @dashboard-web/web build`).
   - `build-api` — buildea backend (`pnpm --filter @dashboard-web/api build`).
   - `runner` — `node:22-bookworm-slim`, copia builds + `node_modules` (solo prod), expone `:3001`, `CMD` = `node apps/api/dist/server.js`.
4. `.dockerignore` raíz: excluir `node_modules`, `.git`, `*.md`, `tests/`, etc.
5. `docker-compose.yml` raíz: servicio único, env vars, volume `./data:/app/data`, `ports: 3001:3001`.

**Verificar:** `docker compose up`, abrir `http://localhost:3001`, ver dashboard, togglear una luz, ver eventos en logs.

#### 6.b — Modo dual: standalone + supervised

1. En `apps/api/src/config.ts`: si `SUPERVISOR_TOKEN` está definido → `ha.url = 'http://supervisor/core'`, `ha.token = SUPERVISOR_TOKEN`. Si no → `HA_URL` y `HA_TOKEN` requeridas como hoy.
2. Log de arranque distingue modo: `[config] modo supervised` vs `[config] modo standalone`.
3. Test unit del switch.
4. Verificar que `pnpm dev` sigue funcionando exactamente igual en modo standalone con `.env`.

**Verificar:** levantar el contenedor con `SUPERVISOR_TOKEN=dummy` seteado, ver el log de modo supervised. Sin el token, modo standalone.

#### 6.c — Crear repo del catálogo + instalación local

1. Crear repo `dashboard-web-addon` en GitHub (vacío al inicio).
2. Estructura inicial:
   ```
   dashboard-web-addon/
   ├── repository.yaml            # name, url, maintainer del catálogo
   ├── README.md                  # qué es, cómo agregar a HA
   └── dashboard-web/             # slug del add-on
       ├── config.yaml            # version, options, ports, image: ghcr.io/...
       ├── Dockerfile             # FROM ghcr.io/<user>/dashboard-web:<version>
       ├── icon.png               # 256x256
       ├── logo.png               # 250x100
       └── README.md              # docs del add-on
   ```
3. Versión inicial `0.1.0`. Como la imagen de ghcr.io aún no se publicó (eso es 6.f), durante 6.c-6.e usamos el modo "build local" del Supervisor: el `Dockerfile` del add-on hace `COPY` desde el contexto local en vez de `FROM ghcr.io/...`.
4. **Instalación local** en el HAOS de Proxmox:
   - Acceder a la VM via Samba (HAOS expone `\\homeassistant.local\addons` con el add-on `Samba share` instalado).
   - Copiar la carpeta `dashboard-web/` del repo del catálogo a `/addons/dashboard-web/` del HAOS.
   - En la UI de HA: Settings → Add-ons → ⋮ → Check for updates → debería aparecer en "Local add-ons".
   - Instalar, arrancar, ver logs.

**Verificar:** add-on aparece en "Local add-ons", instala, arranca. Logs muestran "[HA] conectado" via Supervisor. Puerto del add-on responde HTTP.

#### 6.d — Ingress

1. En `config.yaml` del add-on: `ingress: true`, `ingress_port: 3001`, `panel_icon: mdi:view-dashboard`, `panel_title: Dashboard`.
2. Frontend: convertir paths absolutos (`/api/...`, sockets) a paths relativos al document base. Si HA inyecta `X-Ingress-Path`, leerlo en una request inicial.
3. Backend: respetar `X-Ingress-Path` para construir URLs si las hay (ideal: frontend usa solo paths relativos y no hace falta).
4. Asegurar que CORS no bloquea — en modo supervised, el frontend se sirve desde el mismo origen ingress.

**Verificar:** click en el sidebar de HA → dashboard se carga adentro de HA en un iframe, sin pedir token, sin CORS rotos. Toggle de luces sigue funcionando. Socket.IO conecta.

#### 6.e — Opciones del add-on + persistencia /data

1. Mover el SQLite default a `/data/prefs.db` cuando hay `SUPERVISOR_TOKEN` (en modo standalone sigue siendo `./data/prefs.db`).
2. Agregar bloque `options` y `schema` al `config.yaml` del add-on con campos:
   - `anthropic_api_key` (password)
   - `anthropic_model` (str con `match` para validar slug)
   - `log_level` (list: debug | info | warn | error)
3. Backend lee `/data/options.json` (Supervisor lo escribe al arrancar) y lo mergea con el resto de config — env vars siguen como override para dev.
4. Cambios de opciones requieren restart del add-on (estándar HA).

**Verificar:** cambiar `log_level` en la UI del add-on → restart → ver logs en el nuevo nivel. Persistencia SQLite vive en `/data/prefs.db`. Snapshot de HA incluye el SQLite.

#### 6.f — Publicación pública: CI multi-arch + sync de versiones

1. GitHub Actions en `dashboard-web`:
   - Trigger: tag `v*` (ej. `v0.1.0`).
   - Login a `ghcr.io` con `GITHUB_TOKEN`.
   - `docker buildx` multi-arch (amd64 + aarch64).
   - Push a `ghcr.io/<user>/dashboard-web:<tag>` + `:latest`.
   - Hacer pública la imagen (default es privada en `ghcr.io`).
2. En `dashboard-web-addon`: cambiar el `Dockerfile` del add-on a `FROM ghcr.io/<user>/dashboard-web:<version>`. Bumpear `version:` del `config.yaml` cuando hay nueva imagen — opciones:
   - PR manual (más simple).
   - Workflow con `repository_dispatch` desde el repo de código.
3. README del catálogo con instrucciones para el end-user:
   - Settings → Add-ons → Store → ⋮ → Repositories → pegar URL del catálogo → Add.
   - Buscar "Dashboard", instalar, configurar opciones, arrancar.

**Verificar:** desde un HAOS limpio (otra VM o reset del actual), agregar la URL del catálogo, instalar el add-on, configurarlo, ver que funciona end-to-end como si fueras un usuario nuevo.

### Criterios de "done" de Fase 6

- [ ] `docker compose up` corre el dashboard standalone en cualquier máquina con Docker.
- [ ] Modo dual funciona: standalone con `.env` y supervised con `SUPERVISOR_TOKEN`.
- [ ] Add-on aparece en HA, instala, arranca, conecta a HA via Supervisor (sin token manual).
- [ ] Ingress funciona: dashboard se abre desde el sidebar de HA sin auth extra.
- [ ] Opciones del add-on se reflejan en runtime (al menos modelo de Claude y log level).
- [ ] Imagen multi-arch (amd64 + aarch64) publicada en `ghcr.io` con tags por versión y `:latest`.
- [ ] Repo `dashboard-web-addon` instalable via "Add custom repository" en cualquier HAOS.
- [ ] README de instalación end-user en el repo del catálogo.

---

## Fase 7 — Polish (post-deploy)

Difiriéndose hasta tener Fase 6 cerrada:

1. Tests E2E completos de los flujos principales con Playwright.
2. Performance: virtualización de listas si hay >200 entidades (`@tanstack/react-virtual`).
3. README de producción con troubleshooting (modo standalone con docker compose + modo add-on).

---

## Qué NO está en el roadmap (decisiones explícitas)

- **MQTT directo:** no. HA ya unifica todos los protocolos. Si tenés ESP32, integralo via HA primero.
- **Multi-tenant:** no. Single-user.
- **Mobile app nativa:** no. Si querés mobile, la web responsive alcanza. React Native sería otro proyecto.
- **SSR:** no. Es una SPA local, no hay nada que indexar.
- **Multi-template visual:** no. Un solo template, hecho bien (lección de HAWeb).

---

## Referencias

- [ANALISIS-HAWEB.md](./ANALISIS-HAWEB.md) — análisis del proyecto anterior, patrones a copiar y problemas a evitar.
- [README.md](./README.md) — setup, scripts, decisiones de arquitectura.

---

## Cómo continuar con Claude Code en este proyecto

Cuando abrás Claude en este directorio:

1. Decile **"leé `ROADMAP.md` y arranquemos Fase 1"** (o la que toque).
2. Si querés recuperar contexto histórico: `mem_search "dashboard-web"` (la memoria está saved con topic_key `dashboard-web/phase-0`).
3. Para verificar que retomás bien, corré `pnpm dev` y abrí `localhost:5173` antes de tocar código nuevo.

**Regla de oro:** cada fase termina con commit + verificación contra HA real. No avancés con cosas rotas.
