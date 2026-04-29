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

## Fase 6 — Pulido y deploy

1. Tests E2E completos de los flujos principales.
2. Performance: virtualización de listas si tenés >200 entidades (`@tanstack/react-virtual`).
3. Build + Docker compose para deploy local.
4. README de producción con troubleshooting.

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
