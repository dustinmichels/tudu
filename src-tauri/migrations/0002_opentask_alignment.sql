-- Migration 0002: OpenTask v1.0 Alignment Schema Additions

-- Add OpenTask fields to tasks
ALTER TABLE tasks ADD COLUMN status TEXT NOT NULL DEFAULT 'needs_action';
ALTER TABLE tasks ADD COLUMN start TEXT;
ALTER TABLE tasks ADD COLUMN duration TEXT;
ALTER TABLE tasks ADD COLUMN timezone TEXT;
ALTER TABLE tasks ADD COLUMN percent_complete INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN color TEXT;
ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN geo_latitude REAL;
ALTER TABLE tasks ADD COLUMN geo_longitude REAL;
ALTER TABLE tasks ADD COLUMN extra TEXT;

-- Synchronize status for existing completed tasks
UPDATE tasks SET status = 'completed' WHERE completed = 1;

-- Add OpenTask fields to lists
ALTER TABLE lists ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lists ADD COLUMN extra TEXT;

-- Add OpenTask fields to reminders
ALTER TABLE reminders ADD COLUMN description TEXT;

-- Additional indices
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_position ON tasks(position);
CREATE INDEX IF NOT EXISTS idx_lists_is_archived ON lists(is_archived);
