-- Migration 0001: Consolidated Core Schema & GTD Baseline

-- Lists table
CREATE TABLE IF NOT EXISTS lists (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    color TEXT,
    icon TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0,
    extra TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    deleted_at TEXT
);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY NOT NULL,
    uid TEXT,
    parent_id TEXT REFERENCES tasks(id),
    list_id TEXT NOT NULL REFERENCES lists(id),
    title TEXT NOT NULL,
    description TEXT,
    due TEXT,
    is_all_day INTEGER NOT NULL DEFAULT 0,
    rrule TEXT,
    priority INTEGER,
    status TEXT NOT NULL DEFAULT 'needs_action',
    start TEXT,
    duration TEXT,
    timezone TEXT,
    percent_complete INTEGER NOT NULL DEFAULT 0,
    color TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    freeform_x REAL,
    freeform_y REAL,
    location TEXT,
    url TEXT,
    geo_latitude REAL,
    geo_longitude REAL,
    extra TEXT,
    completed INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    deleted_at TEXT
);

-- Tags table
CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE,
    color TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    deleted_at TEXT
);

-- Task Tags junction table
CREATE TABLE IF NOT EXISTS task_tags (
    task_id TEXT NOT NULL REFERENCES tasks(id),
    tag_id TEXT NOT NULL REFERENCES tags(id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    deleted_at TEXT,
    PRIMARY KEY (task_id, tag_id)
);

-- Notes table
CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY NOT NULL,
    task_id TEXT NOT NULL REFERENCES tasks(id),
    title TEXT,
    content TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    deleted_at TEXT
);

-- Reminders table
CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY NOT NULL,
    task_id TEXT NOT NULL REFERENCES tasks(id),
    trigger TEXT NOT NULL,
    relative_to TEXT NOT NULL DEFAULT 'due',
    action TEXT NOT NULL DEFAULT 'display',
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    deleted_at TEXT
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_lists_deleted_at ON lists(deleted_at);
CREATE INDEX IF NOT EXISTS idx_lists_is_archived ON lists(is_archived);
CREATE INDEX IF NOT EXISTS idx_tasks_list_id ON tasks(list_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_position ON tasks(position);
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed);
CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON tasks(deleted_at);
CREATE INDEX IF NOT EXISTS idx_tasks_uid ON tasks(uid);
CREATE INDEX IF NOT EXISTS idx_task_tags_tag_id ON task_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_notes_task_id ON notes(task_id);
CREATE INDEX IF NOT EXISTS idx_reminders_task_id ON reminders(task_id);
CREATE INDEX IF NOT EXISTS idx_reminders_deleted_at ON reminders(deleted_at);

-- ---------------------------------------------------------------------------
-- Default GTD Lists (Inbox, Next actions, Waiting on, Someday/Maybe)
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO lists (id, name, color, position, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000001', 'Inbox', '#3b82f6', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM lists WHERE lower(name) = 'inbox' AND deleted_at IS NULL);

INSERT OR IGNORE INTO lists (id, name, color, position, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000002', 'Next actions', '#f59e0b', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM lists WHERE lower(name) = 'next actions' AND deleted_at IS NULL);

INSERT OR IGNORE INTO lists (id, name, color, position, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000003', 'Waiting on', '#f97316', 2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM lists WHERE lower(name) = 'waiting on' AND deleted_at IS NULL);

INSERT OR IGNORE INTO lists (id, name, color, position, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000004', 'Someday/Maybe', '#eab308', 3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM lists WHERE lower(name) = 'someday/maybe' AND deleted_at IS NULL);

-- ---------------------------------------------------------------------------
-- Default GTD Context Tags (@home, @work, @school, @errands, @computer, @calls)
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO tags (id, name, color, created_at, updated_at)
SELECT '00000000-0000-0000-0001-000000000001', '@home', '#22c55e', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM tags WHERE lower(name) = '@home' AND deleted_at IS NULL);

INSERT OR IGNORE INTO tags (id, name, color, created_at, updated_at)
SELECT '00000000-0000-0000-0001-000000000002', '@work', '#3b82f6', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM tags WHERE lower(name) = '@work' AND deleted_at IS NULL);

INSERT OR IGNORE INTO tags (id, name, color, created_at, updated_at)
SELECT '00000000-0000-0000-0001-000000000003', '@school', '#a855f7', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM tags WHERE lower(name) = '@school' AND deleted_at IS NULL);

INSERT OR IGNORE INTO tags (id, name, color, created_at, updated_at)
SELECT '00000000-0000-0000-0001-000000000004', '@errands', '#eab308', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM tags WHERE lower(name) = '@errands' AND deleted_at IS NULL);

INSERT OR IGNORE INTO tags (id, name, color, created_at, updated_at)
SELECT '00000000-0000-0000-0001-000000000005', '@computer', '#06b6d4', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM tags WHERE lower(name) = '@computer' AND deleted_at IS NULL);

INSERT OR IGNORE INTO tags (id, name, color, created_at, updated_at)
SELECT '00000000-0000-0000-0001-000000000006', '@calls', '#f43f5e', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM tags WHERE lower(name) = '@calls' AND deleted_at IS NULL);

-- ---------------------------------------------------------------------------
-- Default Sample Tasks into Next actions
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO tasks (id, list_id, title, description, completed, status, position, created_at, updated_at)
SELECT
    '00000000-0000-0000-0002-000000000001',
    COALESCE(
        (SELECT id FROM lists WHERE lower(name) = 'next actions' AND deleted_at IS NULL LIMIT 1),
        (SELECT id FROM lists WHERE deleted_at IS NULL ORDER BY position ASC LIMIT 1)
    ),
    'Fix leaky kitchen faucet',
    'Tighten valve under the sink or replace rubber washer.',
    0,
    'needs_action',
    1,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE id = '00000000-0000-0000-0002-000000000001')
  AND NOT EXISTS (SELECT 1 FROM tasks WHERE id NOT LIKE '00000000-0000-0000-0002-%' AND deleted_at IS NULL)
  AND EXISTS (SELECT 1 FROM lists WHERE deleted_at IS NULL);

INSERT OR IGNORE INTO tasks (id, list_id, title, description, completed, status, position, created_at, updated_at)
SELECT
    '00000000-0000-0000-0002-000000000002',
    COALESCE(
        (SELECT id FROM lists WHERE lower(name) = 'next actions' AND deleted_at IS NULL LIMIT 1),
        (SELECT id FROM lists WHERE deleted_at IS NULL ORDER BY position ASC LIMIT 1)
    ),
    'Review team sprint priorities',
    'Sync on backlog items and upcoming release milestones.',
    0,
    'needs_action',
    2,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE id = '00000000-0000-0000-0002-000000000002')
  AND NOT EXISTS (SELECT 1 FROM tasks WHERE id NOT LIKE '00000000-0000-0000-0002-%' AND deleted_at IS NULL)
  AND EXISTS (SELECT 1 FROM lists WHERE deleted_at IS NULL);

INSERT OR IGNORE INTO tasks (id, list_id, title, description, completed, status, position, created_at, updated_at)
SELECT
    '00000000-0000-0000-0002-000000000003',
    COALESCE(
        (SELECT id FROM lists WHERE lower(name) = 'next actions' AND deleted_at IS NULL LIMIT 1),
        (SELECT id FROM lists WHERE deleted_at IS NULL ORDER BY position ASC LIMIT 1)
    ),
    'Submit assignment on portal',
    'Upload final PDF and review submission checklist.',
    0,
    'needs_action',
    3,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE id = '00000000-0000-0000-0002-000000000003')
  AND NOT EXISTS (SELECT 1 FROM tasks WHERE id NOT LIKE '00000000-0000-0000-0002-%' AND deleted_at IS NULL)
  AND EXISTS (SELECT 1 FROM lists WHERE deleted_at IS NULL);

INSERT OR IGNORE INTO tasks (id, list_id, title, description, completed, status, position, created_at, updated_at)
SELECT
    '00000000-0000-0000-0002-000000000004',
    COALESCE(
        (SELECT id FROM lists WHERE lower(name) = 'next actions' AND deleted_at IS NULL LIMIT 1),
        (SELECT id FROM lists WHERE deleted_at IS NULL ORDER BY position ASC LIMIT 1)
    ),
    'Drop off package at post office',
    'Bring pre-printed return label and taped box.',
    0,
    'needs_action',
    4,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE id = '00000000-0000-0000-0002-000000000004')
  AND NOT EXISTS (SELECT 1 FROM tasks WHERE id NOT LIKE '00000000-0000-0000-0002-%' AND deleted_at IS NULL)
  AND EXISTS (SELECT 1 FROM lists WHERE deleted_at IS NULL);

INSERT OR IGNORE INTO tasks (id, list_id, title, description, completed, status, position, created_at, updated_at)
SELECT
    '00000000-0000-0000-0002-000000000005',
    COALESCE(
        (SELECT id FROM lists WHERE lower(name) = 'next actions' AND deleted_at IS NULL LIMIT 1),
        (SELECT id FROM lists WHERE deleted_at IS NULL ORDER BY position ASC LIMIT 1)
    ),
    'Draft project proposal',
    'Outline objectives, key deliverables, and timeline.',
    0,
    'needs_action',
    5,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE id = '00000000-0000-0000-0002-000000000005')
  AND NOT EXISTS (SELECT 1 FROM tasks WHERE id NOT LIKE '00000000-0000-0000-0002-%' AND deleted_at IS NULL)
  AND EXISTS (SELECT 1 FROM lists WHERE deleted_at IS NULL);

INSERT OR IGNORE INTO tasks (id, list_id, title, description, completed, status, position, created_at, updated_at)
SELECT
    '00000000-0000-0000-0002-000000000006',
    COALESCE(
        (SELECT id FROM lists WHERE lower(name) = 'next actions' AND deleted_at IS NULL LIMIT 1),
        (SELECT id FROM lists WHERE deleted_at IS NULL ORDER BY position ASC LIMIT 1)
    ),
    'Call dentist to schedule cleaning',
    'Request a morning appointment next Thursday or Friday.',
    0,
    'needs_action',
    6,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE id = '00000000-0000-0000-0002-000000000006')
  AND NOT EXISTS (SELECT 1 FROM tasks WHERE id NOT LIKE '00000000-0000-0000-0002-%' AND deleted_at IS NULL)
  AND EXISTS (SELECT 1 FROM lists WHERE deleted_at IS NULL);

-- ---------------------------------------------------------------------------
-- Link Tasks to Tags in task_tags
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO task_tags (task_id, tag_id, created_at, updated_at)
SELECT
    '00000000-0000-0000-0002-000000000001',
    (SELECT id FROM tags WHERE lower(name) = '@home' AND deleted_at IS NULL LIMIT 1),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE EXISTS (SELECT 1 FROM tasks WHERE id = '00000000-0000-0000-0002-000000000001')
  AND EXISTS (SELECT 1 FROM tags WHERE lower(name) = '@home' AND deleted_at IS NULL);

INSERT OR IGNORE INTO task_tags (task_id, tag_id, created_at, updated_at)
SELECT
    '00000000-0000-0000-0002-000000000002',
    (SELECT id FROM tags WHERE lower(name) = '@work' AND deleted_at IS NULL LIMIT 1),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE EXISTS (SELECT 1 FROM tasks WHERE id = '00000000-0000-0000-0002-000000000002')
  AND EXISTS (SELECT 1 FROM tags WHERE lower(name) = '@work' AND deleted_at IS NULL);

INSERT OR IGNORE INTO task_tags (task_id, tag_id, created_at, updated_at)
SELECT
    '00000000-0000-0000-0002-000000000003',
    (SELECT id FROM tags WHERE lower(name) = '@school' AND deleted_at IS NULL LIMIT 1),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE EXISTS (SELECT 1 FROM tasks WHERE id = '00000000-0000-0000-0002-000000000003')
  AND EXISTS (SELECT 1 FROM tags WHERE lower(name) = '@school' AND deleted_at IS NULL);

INSERT OR IGNORE INTO task_tags (task_id, tag_id, created_at, updated_at)
SELECT
    '00000000-0000-0000-0002-000000000004',
    (SELECT id FROM tags WHERE lower(name) = '@errands' AND deleted_at IS NULL LIMIT 1),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE EXISTS (SELECT 1 FROM tasks WHERE id = '00000000-0000-0000-0002-000000000004')
  AND EXISTS (SELECT 1 FROM tags WHERE lower(name) = '@errands' AND deleted_at IS NULL);

INSERT OR IGNORE INTO task_tags (task_id, tag_id, created_at, updated_at)
SELECT
    '00000000-0000-0000-0002-000000000005',
    (SELECT id FROM tags WHERE lower(name) = '@computer' AND deleted_at IS NULL LIMIT 1),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE EXISTS (SELECT 1 FROM tasks WHERE id = '00000000-0000-0000-0002-000000000005')
  AND EXISTS (SELECT 1 FROM tags WHERE lower(name) = '@computer' AND deleted_at IS NULL);

INSERT OR IGNORE INTO task_tags (task_id, tag_id, created_at, updated_at)
SELECT
    '00000000-0000-0000-0002-000000000006',
    (SELECT id FROM tags WHERE lower(name) = '@calls' AND deleted_at IS NULL LIMIT 1),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE EXISTS (SELECT 1 FROM tasks WHERE id = '00000000-0000-0000-0002-000000000006')
  AND EXISTS (SELECT 1 FROM tags WHERE lower(name) = '@calls' AND deleted_at IS NULL);
