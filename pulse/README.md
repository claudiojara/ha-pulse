# Dashboard Web — Home Assistant Add-on

Dashboard custom para HA con chat (Claude), control de entidades en tiempo
real, vistas por habitación, streams de cámaras y controles de media player.

## Configuration

| Opción              | Tipo       | Default                | Descripción                                        |
|---------------------|------------|------------------------|----------------------------------------------------|
| `log_level`         | enum       | `info`                 | Nivel de logs del backend. `debug` para diagnóstico |
| `anthropic_api_key` | password   | `""`                   | API key de Anthropic. Vacío deshabilita el chat    |
| `anthropic_model`   | string     | `claude-sonnet-4-6`    | Slug del modelo de Claude a usar                   |

Cambios de opciones requieren restart del add-on.

## Network

El add-on usa **Ingress** de Home Assistant: el dashboard aparece en el
sidebar de HA como **Dashboard** y se abre dentro del frame de HA, sin
exponer puertos en la red local. No requiere autenticación adicional.

## Logs

Panel estándar de logs del add-on. Mensajes esperados al arrancar:

- `[config] modo supervised — HA en http://supervisor/core` — el add-on
  detectó el Supervisor y va a usar la API interna.
- `[HA] conectado` — WebSocket auth OK contra HA.
- `[db] preferencias en /data/prefs.db` — SQLite levantado en el path
  persistente de HA (incluido en backups).
- `[chat] habilitado (auto-switch haiku/sonnet 4.5/4.6)` — la API key
  está cargada y el chat está activo.
- `API escuchando en http://0.0.0.0:3001` — server arriba.

Si ves `[chat] deshabilitado: ANTHROPIC_API_KEY no seteada`, configurá la
key en el tab Configuration y reiniciá el add-on.

## Persistencia

El add-on guarda las preferencias de UI (luces ocultas, layouts de
habitación, overrides de nombre/icono) en `/data/prefs.db`, que el
Supervisor incluye automáticamente en los snapshots de HA. Restaurar un
snapshot recupera todas las preferencias.

## Repositorio

<https://github.com/claudiojara/ha-pulse>
