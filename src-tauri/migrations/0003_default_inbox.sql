-- Migration 0003: Default Inbox list

INSERT OR IGNORE INTO lists (id, name, color, position, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000001', 'Inbox', '#3b82f6', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM lists WHERE lower(name) = 'inbox' AND deleted_at IS NULL);
