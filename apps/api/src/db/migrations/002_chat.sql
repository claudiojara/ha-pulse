-- Persistencia del chat con Claude. Single-user: una sola conversación global.
-- Cada row es un MessageParam de Anthropic (user/assistant), con el array de
-- content blocks serializado en `content_json`. El orden lo da `created_at`
-- (con tie-break por `id` para inserts en el mismo ms).

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,
  content_json TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at
  ON chat_messages(created_at);
