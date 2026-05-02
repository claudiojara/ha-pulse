# Sistema de templates de cards y dashboards — Arquitectura

> Documento vivo. Define la arquitectura del sistema de templates de cards de
> ha-pulse y los siguientes pasos. La planificación táctica de cada sprint
> vive en `~/.claude/plans/agile-kindling-thimble.md` mientras se ejecuta.

## Contexto

ha-pulse necesita un **sistema de templates intercambiables**. Cada template es
un "skin completo" con sus propios componentes de card por dominio HA (light,
switch, sensor, climate, …). El usuario elige UN template activo y todo el
app re-renderiza con esos componentes.

Templates inicialmente planeados:

- **base** — el actual (cards minimalistas en `apps/web/src/components/cards/`)
- **glass** — nuevo (glassmorphism inspirado en `HAWeb`)

La feature surge de la frustración con Lovelace de HA: ahí los themes son solo
variables CSS y no podés cambiar estructura/animaciones/layout interno de las
cards. Vos estás encerrado en lo que HA decidió. ha-pulse rompe eso porque
puede tener cards completamente distintas por template — no solo colores.

## Arquitectura — 3 capas

```
┌───────────────────────────────────────────────────┐
│  CAPA 1 — LÓGICA (compartida)                     │
│  Hooks headless por dominio:                      │
│    useLight(id), useSwitch(id), useSensor(id), …  │
│  Devuelven { entity, toggle, setBrightness, … }   │
│  NUNCA dependen del template.                     │
├───────────────────────────────────────────────────┤
│  CAPA 2 — TEMPLATES (varios, swappables)          │
│  Cada template es un REGISTRY de componentes:     │
│    BaseTemplate  = { light: BaseLightCard, … }    │
│    GlassTemplate = { light: GlassLightCard, … }   │
│  Pueden ser TOTALMENTE distintos en estructura,   │
│  animaciones y layout interno.                    │
├───────────────────────────────────────────────────┤
│  CAPA 3 — LAYOUT (app-wide, template-agnóstico)   │
│  Dashboards → Views → Cards posicionadas.         │
│  El grid vive acá, NO en los templates.           │
└───────────────────────────────────────────────────┘
```

### Reglas

1. **Lógica una sola vez**: cuando agregás un dominio nuevo (ej. `fan`), escribís `useFan(id)` UNA vez. Cada template implementa su `FanCard` consumiendo ese hook.
2. **Templates libres en visual**: pueden tener animaciones, micro-layouts, controles distintos. La única atadura es el contrato del hook.
3. **Layout es del usuario, no del template**: cambiar de template NO debe romper el dashboard que armó el usuario. Posiciones (`{x,y,w,h}`) son app-wide.
4. **Templates pueden sugerir tamaños default**: una glass card puede pedir `2x2` cuando se arrastra desde el catálogo, pero una vez ubicada el usuario manda.
5. **Siempre hay un template activo**: persistido en `user_prefs.active_template_id`. Default `'base'`. Nunca null.

### Render de una card

Factory `<EntityCard entityId={id} />`:
1. Resuelve `entity` desde el store de Zustand.
2. Lee `entity.entity_id` → extrae dominio (`'light.living_main'` → `'light'`).
3. Lee `activeTemplateId` desde preferences.
4. Busca componente en `templates[activeTemplateId][domain]`.
5. Renderiza ese componente pasándole `entityId`. El componente usa internamente el hook correspondiente.

```tsx
function GlassLightCard({ entityId, config }) {
  const { entity, toggle, setBrightness } = useLight(entityId); // capa 1
  return <div className="glass-card">…</div>;                   // capa 2 visual
}
```

### Modelo Lovelace-like (capa 3)

Adoptamos el vocabulario de HA porque los usuarios lo conocen:

```
Dashboard "Casa"
├── View "Living"             (tab/página)
│   ├── Section "Luces"       (agrupador opcional)
│   │   ├── Card light  (entityId, position {x,y,w,h}, config)
│   │   └── Card light  …
│   └── Section "Clima"
└── View "Dormitorio"
```

Pero las cards son NUESTRAS — la estructura organizacional es Lovelace, la
implementación es nuestra y aprovecha web bare-metal.

### Capacidades que HA no tiene

- Animaciones / micro-interacciones por template
- Cards multi-entidad (una "scene card" con sliders de varias luces)
- Cards no-HA (calendario, Spotify, lo que sea)
- Detail panels al tocar (histórico, controles avanzados)
- Layouts adaptativos device-aware

## Plan de sprints

### Sprint 1 — Sistema de templates (sin Lovelace todavía)

**Objetivo**: el usuario abre settings, elige "glass", el app entero cambia.
La home / rooms / etc. ya renderean con glass cards.

1. Auditar las cards actuales (`apps/web/src/components/cards/`) e identificar
   qué es lógica vs presentación.
2. Extraer hooks headless por dominio: `useLight`, `useSwitch`, `useSensor`,
   `useBinarySensor`, `useClimate`, `useMediaPlayer`, `useCamera`. Vivirán en
   `apps/web/src/hooks/entities/`.
3. Refactor de cards existentes para que usen los hooks → estas pasan a ser
   el template `'base'`.
4. Definir tipo `Template` y registry en `apps/web/src/templates/`.
5. Crear template `'glass'` con cards nuevas:
   - Portar tokens CSS de HAWeb a `apps/web/src/templates/glass/tokens.css`.
   - Componentes nuevos: `GlassLightCard`, `GlassSwitchCard`, etc.
6. Factory `<EntityCard entityId={id} />` que resuelve template + dominio.
7. Reemplazar usos hardcodeados de cards por `<EntityCard>` en las páginas
   actuales (home, room views).
8. Selector de template (settings page o sección): persistido en SQLite vía
   `user_prefs`.

**Persistencia**: agregar campo `active_template_id` a `user_prefs` (ya existe
la tabla, agregar a `PreferencesSnapshot` en `packages/shared`).

**No incluye**: dashboards configurables, DnD, catálogo, multi-dashboard.

### Sprint 2 — Sistema Lovelace-like (capa 3)

1. Modelo `Dashboard` / `View` / `Section` / positioned `Card`.
2. Migración SQLite `003_dashboards.sql`.
3. Editor con DnD (reusar `@dnd-kit` ya instalado).
4. Catálogo: vidriera de cards disponibles en el template activo.
5. Multi-dashboard, switcher.
6. Persistencia + sync vía Socket.IO (patrón existente).

## Investigación HAWeb (referencia visual)

> Mantenida como referencia visual y de tokens. NO portamos código —
> reescribimos en React.

Stack: Astro 5 + Svelte islands + Tailwind. Backend Express con
`home-assistant-js-websocket` y datos estáticos (no real-time).

### Lo único que portamos: tokens glass

`/Users/claudiojara/dev/homeassistant/HAWeb/frontend/public/styles/glass-tokens.css`
(líneas 8–38):

```css
--g-accent: #7c6ff7;            /* periwinkle */
--g-glass-bg: rgba(255,255,255,0.42);
--g-glass-border: rgba(255,255,255,0.60);
--g-glass-blur: blur(20px) saturate(160%);
--g-glass-shadow: [layered inset+drop];
--g-text-1, --g-text-2, --g-text-3;
```

Son CSS custom properties puras, NO Tailwind, portarlos es trivial. Vivirán
scoped al template glass.

### Lo que descartamos

- Astro/Svelte (somos React)
- Hash routing del controller (`#view-glass-home`) — usamos TanStack Router
- 19 cards Astro (cada una con su Props ad-hoc) — escribimos las nuestras con
  schema unificado por dominio
- `ha-data.json` estático — ha-pulse tiene WS reactivo en vivo (mejor)

## Estado actual de ha-pulse (al inicio de Sprint 1)

Repo: `/Users/claudiojara/Workspace/personal/home-assistant/ha-pulse`
(symlink desde `ha-dashboard/ha-pulse → ../ha-pulse`).

### Stack

- **Frontend**: React 19 + Vite 6 + TanStack Router 1.91 + TS 5.7 + Tailwind 3.4 + Zustand 5
- **Backend**: Node 22 + Fastify 5.2 + Socket.IO 4.8 + `home-assistant-js-websocket`
- **DB**: SQLite (`better-sqlite3` 12.9, WAL) en `/data/preferences.db`
- **Monorepo**: pnpm workspaces — `apps/api`, `apps/web`, `packages/shared`
- **Extras instalados**: `@dnd-kit`, `zod`, Radix, Lucide

### Rutas existentes

- `/` — `HomePage` con `LightsList`
- `/chat` — `ChatPanel` (Anthropic streaming)
- `/room.$areaId` — `RoomView`

### Cards existentes (`apps/web/src/features/<dominio>/`)

Cada card vive en su propio feature folder. Líneas confirmadas en auditoría:

| Card               | Path                                                | LOC |
| ------------------ | --------------------------------------------------- | --- |
| `LightCard`        | `apps/web/src/features/lights/LightCard.tsx`        | 146 |
| `SwitchCard`       | `apps/web/src/features/switches/SwitchCard.tsx`     | 54  |
| `SensorCard`       | `apps/web/src/features/sensors/SensorCard.tsx`      | 45  |
| `BinarySensorCard` | `apps/web/src/features/sensors/BinarySensorCard.tsx`| 51  |
| `ClimateCard`      | `apps/web/src/features/climate/ClimateCard.tsx`     | 184 |
| `CameraCard`       | `apps/web/src/features/cameras/CameraCard.tsx`      | 81  |
| `MediaPlayerCard`  | `apps/web/src/features/media/MediaPlayerCard.tsx`   | 342 |

Existe ya un `EntityCard` dispatcher — punto natural para enchufar el factory
de templates en Sprint 1.

Estas cards son los candidatos a:
1. Extraer su lógica como hooks headless en `apps/web/src/hooks/entities/`
2. Quedar como tema `'base'` después del refactor

### Stores Zustand

`entities.ts` (con optimistic updates), `areas.ts`, `chat.ts`, `preferences.ts`.

### Persistencia hoy

- `001_init.sql` — `hidden_entities`, `entity_overrides`, `room_layouts`, `user_prefs`
- `002_chat.sql` — historial de chat

`user_prefs` ya existe — agregamos `active_template_id` ahí.

### Tipos compartidos (`packages/shared/src/index.ts`)

`HassEntity`, `Area`, `EntityAreaMap`, `EntityOverride`,
`PreferencesSnapshot`, `ChatItem`. **Falta** `TemplateId`,
`active_template_id` en `PreferencesSnapshot`.

## Decisiones cerradas

- ✅ Sistema de templates (no solo theming de tokens) — múltiples sets de
  componentes intercambiables.
- ✅ Arquitectura de 3 capas: lógica (hooks) / templates (skins) / layout (app-wide).
- ✅ Adoptamos vocabulario Lovelace (Dashboard / View / Card) en Sprint 2.
- ✅ Grid es app-wide, no per-template.
- ✅ Sprint 1 = templates funcionando end-to-end con base + glass.
- ✅ Sprint 2 = sistema Lovelace-like (dashboards configurables).
- ✅ Siempre un template activo, default `'base'`, persistido en `user_prefs`.

## Sprint 1 — Cerrado en código (2026-05-02)

### Capa 1 — Hooks headless (`apps/web/src/hooks/entities/`)

`useService` (optimistic + callService + cleanup), `useLight`, `useSwitch`,
`useSensor`, `useBinarySensor`, `useClimate`, `useCamera`, `useMediaPlayer`.
Más utilitario `apps/web/src/hooks/useThrottle.ts` para drag de sliders.

### Capa 2 — Templates (`apps/web/src/templates/`)

- `registry.ts` — tipo `Template`, `useActiveTemplate()`,
  `ACTIVE_TEMPLATE_PREF_KEY`, `listTemplates()`.
- `base/` — las 7 cards previas, refactorizadas para consumir los hooks
  (movidas con `git mv` desde `features/<dominio>/`).
- `glass/` — MVP de 3 cards (light/switch/sensor) más:
  - `tokens.css` — variables CSS scoped a `.template-glass`
  - `theme.css` — `.glass-card` + orbs/overlay/depth de fondo + estilos
    específicos de cada glass card (portados fielmente de HAWeb)
  - `GlassToggle.tsx` — switch nativo con look glass
  - `GlassBackground.tsx` — capas de fondo (orbs + gradient)
  - Sin imagen Unsplash de HAWeb (reemplazada por gradient CSS-only).
- `TemplateRoot.tsx` — wrapper que aplica `body.template-${id}` y renderiza
  `template.Background` cuando existe.

### Capa 3 — Wiring app-wide

- `apps/web/src/features/entities/EntityCard.tsx` — resuelve componente vía
  registry según template activo + dominio. Caía a `UnsupportedCard` si el
  template no implementa el dominio.
- `apps/web/src/features/lights/LightsList.tsx` — usa `<EntityCard>` (era
  `<LightCard>` directo, ahora template-aware).
- `apps/web/src/routes/__root.tsx` — envuelto en `<TemplateRoot>`. Background
  del shell es transparente cuando glass está activo (deja ver orbs).
- `apps/web/src/components/TemplateSwitcher.tsx` — UI compacta en sidebar.
  Persiste vía `setUserPref({ key: 'active_template_id', value })` (Socket.IO
  → SQLite). Backend ya soportaba `set_pref` genérico, no hubo cambios.

### Cómo verificar

```bash
cd ha-pulse && source ~/scripts/ha-dev.sh && pnpm dev
```

1. Abrir el web app — debe verse idéntico a antes (template `base` por
   default).
2. En el sidebar abajo, en "Template", clickear `Glass`.
3. El fondo cambia a gradient pastel con orbs, las luces (`/`) y sensors
   muestran los nuevos cards. Los switches glass aparecen en views de
   habitación si las hay.
4. Recargar — la preferencia persiste (viene de SQLite vía
   `preferences_updated`).
5. Volver a `Base`. Verifica que vuelve al look original.

Verificación SQLite:

```bash
sqlite3 /path/to/data/preferences.db "SELECT key, value FROM user_prefs WHERE key='active_template_id';"
```

### Sprint 1 — Pendiente

Cobertura de glass para los 4 dominios restantes (climate, camera,
media_player, binary_sensor). Hoy esos caen al `UnsupportedCard` cuando
glass está activo. Si querés cubrirlos, los hookeamos en una iteración
chica reusando los hooks que ya están.
