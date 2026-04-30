-- Schema inicial de preferencias del dashboard.
-- Single-user (id=1 implícito). Toda la metadata de UI vive acá; el state real
-- de las entities sigue viniendo del WS de HA.

CREATE TABLE IF NOT EXISTS hidden_entities (
  entity_id TEXT PRIMARY KEY,
  hidden_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
) STRICT;

CREATE TABLE IF NOT EXISTS entity_overrides (
  entity_id   TEXT PRIMARY KEY,
  custom_name TEXT,
  custom_icon TEXT,
  updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
) STRICT;

-- Orden custom de entidades por habitación. entity_order es un JSON array de
-- entity_ids; entidades NO presentes caen al final ordenadas por nombre como
-- fallback (lo resuelve el frontend).
CREATE TABLE IF NOT EXISTS room_layouts (
  area_id      TEXT PRIMARY KEY,
  entity_order TEXT NOT NULL DEFAULT '[]',
  updated_at   INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
) STRICT;

-- Bag genérica de prefs (theme, etc). value es texto libre; el shape lo conoce
-- el consumidor. Usar keys con namespace, ej: ui.theme, ui.density.
CREATE TABLE IF NOT EXISTS user_prefs (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
) STRICT;
