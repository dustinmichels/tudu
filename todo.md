# TuDu — Implementation Roadmap & Todo

A desktop-first task management application inspired by Remember The Milk (RTM), built with Tauri, Vue 3, TypeScript, and Bun, backed by a local-first Turso (libSQL) database with seamless sync readiness for mobile expansion.

---

## Architectural Recommendations & Guiding Principles

1. **Local-First Turso (libSQL) Storage**:
   - Use libSQL embedded in the local application for fast, zero-latency local SQLite operations without requiring a network connection.
   - Structure the database connection to support libSQL's embedded replica synchronization (`sync()`), enabling eventual sync with Turso Cloud (free tier) across desktop and mobile devices.
2. **Collision-Resistant Distributed Keys (UUIDv7 / ULID)**:
   - All primary keys (`tasks`, `lists`, `tags`, `notes`) must use collision-resistant identifiers (such as time-sortable UUIDv7 or ULID) rather than auto-incrementing integers. This avoids ID collisions when creating tasks offline on multiple devices (e.g., MacBook and Android phone).
3. **First-Class Subtask Architecture**:
   - Subtasks support the exact same properties as top-level tasks (due, repeats, list, tags, location, url, notes, priority) independently, without assuming property inheritance from the parent.
   - Model subtasks in the same `tasks` table with a plain self-referential foreign key (`parent_id REFERENCES tasks(id)`).
   - Subtask soft-delete policy: Because deletion uses `deleted_at` tombstones rather than SQL `DELETE`, database-level cascading triggers do not execute. Deleting a parent task must either transactionally mark descendant subtasks with `deleted_at`, or queries must filter out subtasks whose parent has `deleted_at IS NOT NULL`.
4. **Sync-Ready Relational Schema & Soft Deletes**:
   - All syncable entity tables (`tasks`, `lists`, `tags`, `notes`) and association tables (`task_tags`) must carry appropriate audit timestamps (`created_at`, `updated_at`) and tombstone metadata (`deleted_at`).
   - Domain-specific lifecycle fields like `completed_at` belong strictly to entities that track completion state (`tasks`).
   - Soft deletes across both entity rows and relationship associations (such as tag additions/removals) ensure offline changes on one device cleanly replicate into the sync stream without data loss.
5. **Cross-Platform Mobile Readiness (Tauri v2)**:
   - Design the frontend shell with responsive breakpoints from day one so the 3-pane desktop layout cleanly folds into drawer/stacked mobile views on Android/iOS.
   - Keep platform-specific logic isolated behind Tauri commands or abstractions.

---

## Add defaults

- [ ] Add a default list: "Inbox" which is always there
- [ ] Add some default "views": "Today", "Tomorrow", "This Week". These are filters that show tasks with corresponding due dates. They look like lists and are also always there.

## Full Page

- [ ] The desktop app is currently a small window. I want it to default to being a full page app. The mobile version will come later.

## Phase 1: Project Setup & Tooling

- [x] Initialize Tauri (v2) project with Bun, Vue 3, and TypeScript, Vite
- [x] Set up styling framework (e.g., Tailwind) and icon library (Lucide)
- [x] Configure OxFmt / Biome as the formatter
- [x] Verify clean builds for both frontend (`bun run build`) and Tauri desktop app (`bun run tauri dev`)

---

## Phase 2: Database Layer & Local Turso/libSQL (Rust Core / Tauri)

- [x] Integrate `libsql` crate in the Tauri Rust core for embedded local database operations
- [x] Define database schema and migration runner:
  - `lists`: `id` (TEXT/UUID), `name` (TEXT), `color` (TEXT), `position` (INTEGER), `created_at`, `updated_at`, `deleted_at`
  - `tasks`: `id` (TEXT/UUID), `uid` (TEXT, nullable), `parent_id` (TEXT/UUID, nullable, FK to `tasks`), `list_id` (TEXT/UUID, FK to `lists`), `title` (TEXT), `description` (TEXT, nullable), `due` (TIMESTAMP/ISO8601), `is_all_day` (INTEGER/BOOLEAN), `rrule` (TEXT RRULE), `priority` (INTEGER: 1, 2, 3, or NULL), `location` (TEXT), `url` (TEXT), `completed` (BOOLEAN), `completed_at` (nullable), `created_at`, `updated_at`, `deleted_at`
  - `tags`: `id` (TEXT/UUID), `name` (TEXT UNIQUE), `color` (TEXT), `created_at`, `updated_at`, `deleted_at`
  - `task_tags`: `task_id` (TEXT/UUID, FK to `tasks`), `tag_id` (TEXT/UUID, FK to `tags`), `created_at`, `updated_at`, `deleted_at`, PRIMARY KEY (`task_id`, `tag_id`)
  - `notes`: `id` (TEXT/UUID), `task_id` (TEXT/UUID, FK to `tasks`), `title` (TEXT), `content` (TEXT), `created_at`, `updated_at`, `deleted_at`
  - `reminders`: `id` (TEXT/UUID), `task_id` (TEXT/UUID, FK to `tasks`), `trigger` (TEXT), `relative_to` (TEXT), `action` (TEXT), `created_at`, `updated_at`, `deleted_at`
- [x] Implement database initialization and migration execution on application launch
- [ ] Implement Tauri commands for core CRUD operations:
  - [ ] `get_tasks`: Filter by list, tag, due date range, completion status, or parent ID (basic list & completion filter implemented)
  - [ ] `get_task_detail`: Fetch task with tags, notes, and subtasks
  - [x] `create_task` / `update_task` / `delete_task` (soft delete with recursive descendant handling)
  - [x] `toggle_task_complete`
  - [ ] `get_lists` / `create_list` / `update_list` / `delete_list` (`get_lists`, `create_list`, `delete_list` implemented)
  - [ ] `get_tags` / `create_tag` / `assign_tag` / `remove_tag` (`get_tags`, `create_tag` implemented)
  - [ ] `add_note` / `update_note` / `delete_note` (`get_notes`, `add_note` implemented)
  - [x] `get_reminders` / `add_reminder` / `delete_reminder`
  - [x] `export_backup` / `import_backup` (OpenTask v1.0 standard interop)
  - [ ] `batch_update_tasks`: Batch complete, postpone, change list, or set priority
- [x] Add unit and integration tests for schema migrations and repository commands

---

## Phase 3: Core Data Layer & State Management (Frontend / Pinia)

- [x] Define TypeScript interfaces mirroring the database schema (`Task`, `Subtask`, `List`, `Tag`, `Note`, `Priority`)
- [ ] Implement Pinia stores:
  - [x] `taskStore`: Reactive task state, active task selection, basic CRUD operations via Tauri commands
  - [x] `listStore`: Lists state, active list selection, list management
  - `filterStore`: Active view filters (list filter, tag filter, smart view, incomplete/completed toggle)
- [ ] Implement smart list query engine:
  - "Inbox" (tasks in default/inbox list)
  - "Today" (due date is today or overdue)
  - "Tomorrow" (due date is tomorrow)
  - "This Week" (due date within next 7 days)
  - "All Tasks"
  - "Trash" (soft-deleted tasks)
- [ ] Add sorting utilities (by priority, due date, title, manual order)

---

## Phase 4: Application Shell & Responsive 3-Pane Layout

- [ ] Build responsive 3-pane layout shell:
  - [x] 3-pane wireframe foundation (`Sidebar.vue`, `TaskList.vue`, `TaskDetail.vue`)
  - [ ] Left pane: Navigation sidebar (lists, tags, smart views)
  - [ ] Center pane: Main task list with view toggle and action toolbar
  - [ ] Right pane: Task detail panel (collapsible/expandable)
- [ ] Implement global header:
  - macOS window title bar integration (traffic lights, draggable region)
  - Global search bar input with instant search filtering
  - Settings and sync status indicator buttons
- [ ] Prepare responsive layout breakpoints for mobile viewports (collapsible drawers and stacked detail views)

---

## Phase 5: Left Sidebar (Navigation & Lists)

- [ ] Implement core smart views list with real-time badges (Inbox, All Tasks, Today, Tomorrow, This Week, Trash)
- [ ] Implement custom Lists section:
  - [x] Display list names with active list selection
  - [x] Create new list inline creator
  - [x] Delete custom lists
  - [ ] Display list names with incomplete task counts and overdue badges
  - [ ] Rename and edit custom lists
- [ ] Implement Tags section:
  - Dynamic list of unique tags extracted from tasks
  - Tag filter navigation
- [ ] Add collapsible sidebar sections and active view highlighting

---

## Phase 6: Center Pane (Task List & Quick Add)

- [x] Implement quick-add input bar (`Add a task...`) with enter-to-submit (auto-assigns active list)
- [x] Implement view toggle tabs:
  - `Incomplete` (active tasks)
  - `Completed` (finished tasks)
- [ ] Build batch action toolbar:
  - Multi-select checkbox dropdown (Select All / None / Invert)
  - Mark completed (`✓`)
  - Postpone menu (`📅 ▾`: +1 day, +2 days, +1 week, custom date)
  - Set priority (`! ▾`: Priority 1, 2, 3, None)
  - Move to list (`📋 ▾`)
  - Add/remove tags (`🏷 ▾`)
  - Delete / Move to Trash
- [ ] Build task row item component:
  - [x] Checkbox for completion toggle
  - [x] Priority indicator badge / border color (P1, P2, P3, None)
  - [x] Title and due date indicator
  - [ ] Subtask count badge, and tag pills
  - [ ] Active selection highlighting

---

## Phase 7: Right Pane (Task Detail & Subtasks)

- [ ] Build task detail header:
  - Editable task title
  - [x] Close button (`✕`)
- [ ] Implement metadata property rows:
  - **due**: Date picker with quick presets (Today, Tomorrow, Next Week, Never)
  - **repeats**: Recurrence rule selector (daily, weekly, monthly, custom RRULE)
  - **list**: Dropdown list selector
  - **tags**: Interactive tag badge input (add/remove tags)
  - **location**: Text input
  - **url**: Clickable URL input field
  - **priority**: Priority selector (Priority 1, 2, 3, None)
- [ ] Implement Subtasks section (first-class tasks with independent properties):
  - Subtask input (`Add a subtask...`)
  - Subtask checklist with completion toggle
  - Incomplete / Completed subtask tabs
  - Subtask detail inspector navigation (inspect and edit a subtask's independent properties: due, repeats, list, tags, location, url, notes, priority)
- [ ] Implement Notes section:
  - Multi-note list matching RTM design (timestamped note entries with author/title)
  - Note input (`Add a note...`)
  - Markdown-capable note rendering and editing

---

## Phase 8: Quick Actions, Keyboard Shortcuts & Polish

- [ ] Add postpone actions to task context menu and detail pane (+1 day, +2 days, +1 week)
- [ ] Implement keyboard shortcuts (RTM-style navigation):
  - `j` / `k` or `ArrowUp` / `ArrowDown` to navigate tasks
  - `c` to complete selected task
  - `p` to postpone
  - `1`, `2`, `3` to set priorities 1–3, `4` for None
  - `/` to focus search bar
  - `t` to focus task quick-add
- [ ] Optimistic UI updates with debounced database persistence

---
