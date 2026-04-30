import Database from 'better-sqlite3';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface EntityOverride {
  entity_id: string;
  custom_name: string | null;
  custom_icon: string | null;
}

export interface RoomLayout {
  area_id: string;
  entity_order: string[];
}

export interface UserPrefs {
  [key: string]: string;
}

export interface PreferencesSnapshot {
  hidden_entities: string[];
  entity_overrides: Record<string, EntityOverride>;
  room_layouts: Record<string, string[]>;
  user_prefs: UserPrefs;
}

export interface ChatStoredMessage {
  id: number;
  role: 'user' | 'assistant';
  /** Content del MessageParam de Anthropic (string o array de blocks) serializado. */
  content_json: string;
  created_at: number;
}

export interface PrefsDb {
  getSnapshot(): PreferencesSnapshot;
  setHidden(entityId: string, hidden: boolean): void;
  setOverride(input: EntityOverride): void;
  clearOverride(entityId: string): void;
  setRoomLayout(areaId: string, order: string[]): void;
  setPref(key: string, value: string): void;
  appendChatMessage(role: 'user' | 'assistant', contentJson: string): void;
  getChatHistory(): ChatStoredMessage[];
  clearChatHistory(): void;
  close(): void;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createPrefsDb(dbPath: string): PrefsDb {
  mkdirSync(dirname(resolve(dbPath)), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Migrations: archivos `NNN_*.sql` se ejecutan en orden lexicográfico una sola vez.
  db.exec(
    'CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL DEFAULT (strftime(\'%s\',\'now\') * 1000)) STRICT',
  );
  const applied = new Set(
    db.prepare<[], { id: string }>('SELECT id FROM _migrations').all().map((r) => r.id),
  );
  const migrationsDir = join(__dirname, 'migrations');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const insertMigration = db.prepare<[string]>('INSERT INTO _migrations (id) VALUES (?)');
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    db.transaction(() => {
      db.exec(sql);
      insertMigration.run(file);
    })();
  }

  // Prepared statements
  const stmts = {
    listHidden: db.prepare<[], { entity_id: string }>('SELECT entity_id FROM hidden_entities'),
    listOverrides: db.prepare<
      [],
      { entity_id: string; custom_name: string | null; custom_icon: string | null }
    >('SELECT entity_id, custom_name, custom_icon FROM entity_overrides'),
    listLayouts: db.prepare<[], { area_id: string; entity_order: string }>(
      'SELECT area_id, entity_order FROM room_layouts',
    ),
    listPrefs: db.prepare<[], { key: string; value: string }>(
      'SELECT key, value FROM user_prefs',
    ),
    insertHidden: db.prepare<[string]>(
      'INSERT OR IGNORE INTO hidden_entities (entity_id) VALUES (?)',
    ),
    deleteHidden: db.prepare<[string]>('DELETE FROM hidden_entities WHERE entity_id = ?'),
    upsertOverride: db.prepare<[string, string | null, string | null]>(
      `INSERT INTO entity_overrides (entity_id, custom_name, custom_icon)
       VALUES (?, ?, ?)
       ON CONFLICT(entity_id) DO UPDATE SET
         custom_name = excluded.custom_name,
         custom_icon = excluded.custom_icon,
         updated_at  = strftime('%s','now') * 1000`,
    ),
    deleteOverride: db.prepare<[string]>('DELETE FROM entity_overrides WHERE entity_id = ?'),
    upsertLayout: db.prepare<[string, string]>(
      `INSERT INTO room_layouts (area_id, entity_order)
       VALUES (?, ?)
       ON CONFLICT(area_id) DO UPDATE SET
         entity_order = excluded.entity_order,
         updated_at   = strftime('%s','now') * 1000`,
    ),
    upsertPref: db.prepare<[string, string]>(
      `INSERT INTO user_prefs (key, value)
       VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value      = excluded.value,
         updated_at = strftime('%s','now') * 1000`,
    ),
    insertChatMessage: db.prepare<[string, string]>(
      'INSERT INTO chat_messages (role, content_json) VALUES (?, ?)',
    ),
    selectChatHistory: db.prepare<
      [],
      { id: number; role: 'user' | 'assistant'; content_json: string; created_at: number }
    >(
      'SELECT id, role, content_json, created_at FROM chat_messages ORDER BY created_at ASC, id ASC',
    ),
    deleteChatHistory: db.prepare('DELETE FROM chat_messages'),
  };

  return {
    getSnapshot(): PreferencesSnapshot {
      const overrides: Record<string, EntityOverride> = {};
      for (const r of stmts.listOverrides.all()) {
        overrides[r.entity_id] = {
          entity_id: r.entity_id,
          custom_name: r.custom_name,
          custom_icon: r.custom_icon,
        };
      }
      const layouts: Record<string, string[]> = {};
      for (const r of stmts.listLayouts.all()) {
        try {
          const parsed = JSON.parse(r.entity_order);
          if (Array.isArray(parsed)) layouts[r.area_id] = parsed.filter((x) => typeof x === 'string');
        } catch {
          // entity_order corrupto: lo ignoramos en el snapshot, se sobreescribirá al próximo guardar
        }
      }
      const prefs: UserPrefs = {};
      for (const r of stmts.listPrefs.all()) prefs[r.key] = r.value;
      return {
        hidden_entities: stmts.listHidden.all().map((r) => r.entity_id),
        entity_overrides: overrides,
        room_layouts: layouts,
        user_prefs: prefs,
      };
    },
    setHidden(entityId, hidden) {
      if (hidden) stmts.insertHidden.run(entityId);
      else stmts.deleteHidden.run(entityId);
    },
    setOverride(input) {
      const name = input.custom_name?.trim() ? input.custom_name.trim() : null;
      const icon = input.custom_icon?.trim() ? input.custom_icon.trim() : null;
      if (!name && !icon) {
        // Sin valores → eliminar override.
        stmts.deleteOverride.run(input.entity_id);
        return;
      }
      stmts.upsertOverride.run(input.entity_id, name, icon);
    },
    clearOverride(entityId) {
      stmts.deleteOverride.run(entityId);
    },
    setRoomLayout(areaId, order) {
      const cleaned = order.filter((x) => typeof x === 'string');
      stmts.upsertLayout.run(areaId, JSON.stringify(cleaned));
    },
    setPref(key, value) {
      stmts.upsertPref.run(key, value);
    },
    appendChatMessage(role, contentJson) {
      stmts.insertChatMessage.run(role, contentJson);
    },
    getChatHistory() {
      return stmts.selectChatHistory.all();
    },
    clearChatHistory() {
      stmts.deleteChatHistory.run();
    },
    close() {
      db.close();
    },
  };
}
