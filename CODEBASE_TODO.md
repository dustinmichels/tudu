# TuDu Codebase Action Plan & Structured TODO

> Generated from [`CODEBASE_EVALUATION.md`](CODEBASE_EVALUATION.md).  
> Tracking actionable items across Correctness, Performance, Code Cleanup, Architecture, and Toolchain.

---

## Progress Overview

- [x] **Phase 1: Correctness & Data Integrity** (7 items)
- [x] **Phase 2: Performance & Scalability** (3 items)
- [x] **Phase 3: Cleanup & Dead Code Removal** (5 items)
- [x] **Phase 4: Architecture & Modularity** (4 items)
- [ ] **Phase 5: Testing & Toolchain** (3 items)

---

## Phase 1: Correctness & Data Integrity (P1)

High-severity bugs, data integrity gaps, and logic synchronization discrepancies between frontend and backend.

### 1.1. Prevent Orphaned "Ghost" Tasks on List Soft-Deletion

- **Files**:
  - [`src-tauri/src/commands.rs:335-365`](src-tauri/src/commands.rs#L335-L365) (`delete_list_impl`)
  - [`src-tauri/src/commands.rs:376-527`](src-tauri/src/commands.rs#L376-L527) (`get_tasks_impl`)
- **Action Items**:
  - [x] Update `delete_list_impl` to cascade soft-delete tasks when deleting a list:
    ```sql
    UPDATE tasks SET deleted_at = ?2, updated_at = ?2 WHERE list_id = ?1 AND deleted_at IS NULL;
    ```
    _(Alternatively: reassign active tasks to default Inbox list)._
  - [x] Add active list validation filter in `get_tasks_impl`:
    ```sql
    AND t.list_id IN (SELECT id FROM lists WHERE deleted_at IS NULL)
    ```
  - [x] Add integration/unit test verifying that deleting a list hides its tasks from "All Tasks", "Today", and search results.

---

### 1.2. Fix Tag Task Counts in Sidebar

- **Files**:
  - [`src/stores/tags.ts:69-114`](src/stores/tags.ts#L69-L114)
  - [`src/components/Sidebar.vue:506-516`](src/components/Sidebar.vue#L506-L516)
  - [`src-tauri/src/commands.rs`](src-tauri/src/commands.rs)
- **Action Items**:
  - [x] Implement a dedicated Tauri command `get_tags_with_counts` in Rust:
    ```sql
    SELECT tg.id, tg.name, tg.color, tg.created_at, tg.updated_at, tg.deleted_at,
           COUNT(t.id) as task_count
    FROM tags tg
    LEFT JOIN task_tags tt ON tg.id = tt.tag_id AND tt.deleted_at IS NULL
    LEFT JOIN tasks t ON tt.task_id = t.id AND t.deleted_at IS NULL AND t.completed = 0
    WHERE tg.deleted_at IS NULL
    GROUP BY tg.id;
    ```
  - [x] Expose `get_tags_with_counts` in Tauri commands registry and frontend API bridge (`src/services/api.ts` or `tagStore`).
  - [x] Update `tagStore.loadTags()` to call the new endpoint so counts populate directly from SQL without scanning tasks.
  - [x] Verify that tag count badges render correctly in `Sidebar.vue` when incomplete tasks have tags.

---

### 1.3. Align Smart List Filtering Logic (Frontend vs Backend)

- **Files**:
  - [`src/services/queryEngine.ts:55-97`](src/services/queryEngine.ts#L55-L97)
  - [`src-tauri/src/commands.rs:450-475`](src-tauri/src/commands.rs#L450-L475)
- **Action Items**:
  - [x] **Today View (Completed Tasks)**:
    - In `queryEngine.ts:matchesSmartView("today")`, when `task.completed === true`, match only if the task's due date is strictly today (`isToday(task.due)`).
    - Do not use `isTodayOrOverdue(task.due)` for completed tasks (prevents pulling in old completed tasks).
  - [x] **This Week View (Incomplete Tasks)**:
    - In `queryEngine.ts:matchesSmartView("this_week")`, allow overdue tasks (`d <= endOf7Days`) when `!task.completed` to match the backend SQL rule (`date(t.due) <= date('now', '+7 days')`).
  - [x] Add unit tests in `tests/queryEngine.test.ts` covering both completed and incomplete tasks for "today" and "this_week" views.

---

### 1.4. Unify `listStore` and `filterStore` Navigation State

- **Files**:
  - [`src/stores/lists.ts`](src/stores/lists.ts)
  - [`src/stores/filters.ts`](src/stores/filters.ts)
  - [`src/stores/tasks.ts:115-143`](src/stores/tasks.ts#L115-L143)
  - [`src/components/Sidebar.vue`](src/components/Sidebar.vue)
  - [`src/components/CommandPaletteModal.vue`](src/components/CommandPaletteModal.vue)
- **Action Items**:
  - [x] Make `listStore` the single source of truth for the active view/container:
    - Keep `activeListId` and `activeView` exclusively in `listStore`.
    - Deprecate/remove `selectedListId` and `smartView` from `filterStore`.
  - [x] Consolidate `includeCompleted`:
    - Remove duplicate `includeCompleted` flag from either `filterStore` or `taskStore`, keeping a single authoritative source.
  - [x] Refactor `filterStore` to focus solely on in-view filters:
    - `searchQuery`, `selectedTag`, and `sortOptions`.
  - [x] Fix `listStore.createList()` to automatically reset/deactivate smart views when switching to the new list.
  - [x] Simplify navigation call-sites in `Sidebar.vue`, `App.vue`, and `CommandPaletteModal.vue` by eliminating manual cross-store reset boilerplate.

---

### 1.5. Fix Timezone Drift in Date Sorting

- **Files**:
  - [`src/utils/sorting.ts:47-65`](src/utils/sorting.ts#L47-L65)
  - [`src/services/queryEngine.ts`](src/services/queryEngine.ts)
- **Action Items**:
  - [x] Replace direct `new Date(aDue).getTime()` in `compareByDueDate` with `parseDueDateToLocal()` from `src/services/queryEngine.ts`.
  - [x] Ensure date-only strings (`YYYY-MM-DD`) are consistently interpreted in the user's local timezone instead of defaulting to UTC midnight.
  - [x] Add unit tests in `tests/sorting.test.ts` with mixed date-only (`2026-09-12`) and ISO timestamps (`2026-09-11T23:59:00Z`).

---

### 1.6. Standardize Due Date Format on Postpone

- **Files**:
  - [`src-tauri/src/commands.rs:1260-1285`](src-tauri/src/commands.rs#L1260-L1285)
- **Action Items**:
  - [x] In `postponeTask`: check if the task is all-day or date-only (`is_all_day == true` or absence of time component).
  - [x] Format postponed date as `YYYY-MM-DD` for date-only tasks (matching initial assignment format).
  - [x] Only format with full RFC3339 timestamp when `is_all_day == false` and a specific time was set.
  - [x] Add a unit test verifying date string format after postponing an unscheduled or date-only task.

---

### 1.7. Fix TypeScript Error in Shortcuts Test

- **Files**:
  - [`tests/shortcuts.test.ts:296`](tests/shortcuts.test.ts#L296)
- **Action Items**:
  - [x] Fix `listStore.setActiveView("calendar")` call: replace with `uiStore.isCalendarView = true` or a valid `DefaultView` type.
  - [x] Run `bun test tests/shortcuts.test.ts` to ensure the test passes cleanly without type errors.

---

## Phase 2: Performance & Scalability (P2)

Eliminate IPC chatter, disk sync stalls, and untyped payload parsing.

### 2.1. Eliminate N+1 IPC Task Tag Fetching in `TaskList.vue`

- **Files**:
  - [`src/components/TaskList.vue:648-678`](src/components/TaskList.vue#L648-L678) (`loadVisibleTaskTags`)
  - [`src-tauri/src/commands.rs`](src-tauri/src/commands.rs) (`get_tasks_impl`)
  - [`src-tauri/src/models.rs`](src-tauri/src/models.rs)
  - [`src/models/task.ts`](src/models/task.ts)
- **Action Items**:
  - [x] Modify Rust `Task` or return a `TaskWithTags` struct from `get_tasks` that includes an array of associated tag objects or tag names.
  - [x] Update SQL query in `get_tasks_impl` to fetch tags via `GROUP_CONCAT` or a single batch subquery instead of separate queries per task.
  - [x] Update frontend TypeScript `Task` interface to include `tags?: Tag[]` or `tagNames?: string[]`.
  - [x] Delete `taskTagsCache` and the `loadVisibleTaskTags` function from `TaskList.vue`.
  - [x] Render tags directly from `task.tags` in task list rows.

---

### 2.2. Transactional & Batch Backup Import/Export

- **Files**:
  - [`src-tauri/src/commands.rs:1948-2020`](src-tauri/src/commands.rs#L1948-L2020) (`export_backup_impl`)
  - [`src-tauri/src/commands.rs:2068-2578`](src-tauri/src/commands.rs#L2068-L2578) (`import_backup_impl`)
- **Action Items**:
  - [x] Wrap `import_backup_impl` operations in an explicit database transaction:
    ```rust
    conn.execute("BEGIN TRANSACTION", ()).await?;
    // perform all inserts / updates
    conn.execute("COMMIT", ()).await?;
    ```
    Roll back transaction on any error to prevent partial database corruption.
  - [x] Optimize `export_backup_impl` queries:
    - Replace the per-task loop (fetching notes, reminders, tags per task) with batch queries using `IN (...)` or single joined queries with JSON/string aggregation.
  - [x] Add integration test verifying import atomicity (verify rollback occurs if payload has invalid data midway).

---

### 2.3. Strongly-Typed `update_task` Command

- **Files**:
  - [`src-tauri/src/commands.rs:777-1130`](src-tauri/src/commands.rs#L777-L1130)
  - [`src-tauri/src/models.rs`](src-tauri/src/models.rs)
- **Action Items**:
  - [x] Refactor `update_task` Tauri command signature from untyped `serde_json::Value` to `UpdateTaskInput`:
    ```rust
    #[tauri::command]
    pub async fn update_task(state: State<'_, DbState>, task: UpdateTaskInput) -> Result<Task, String>
    ```
  - [x] Remove ~350 lines of manual string key lookups and type conversions in `update_task_impl`.
  - [x] Verify that frontend calls in `taskStore` / `api.ts` adhere to the `UpdateTaskInput` schema.

---

## Phase 3: Cleanup & Dead UI Removal (P3)

Remove dead controls, cosmetic placeholders, duplicate UI widgets, and boilerplate assets.

### 3.1. Resolve Dead Settings Button

- **Files**:
  - [`src/components/GlobalHeader.vue:278-286`](src/components/GlobalHeader.vue#L278-L286)
  - [`src/stores/ui.ts`](src/stores/ui.ts)
- **Action Items**:
  - [x] Decide on immediate path:
    - **Option A**: Build a minimal `SettingsModal.vue` displaying DB status, theme toggle, and backup import/export actions.
    - **Option B (Recommended for MVP cleanup)**: Remove or hide the settings gear button in `GlobalHeader.vue` until the full settings screen is implemented.
  - [x] Clean up unused or dangling state in `uiStore` if Option B is chosen.

---

### 3.2. Replace Simulated Sync Placeholder

- **Files**:
  - [`src/components/GlobalHeader.vue:90-96`](src/components/GlobalHeader.vue#L90-L96)
- **Action Items**:
  - [x] Remove cosmetic `setTimeout` sync simulation.
  - [x] Wire the sync status icon to real state (e.g. SQLite local-only status or actual libSQL replica synchronization when configured).
  - [x] Add clear tooltip (e.g. "Local Storage" or "Synced with Turso") to set accurate user expectations.

---

### 3.3. Deduplicate "List | Calendar" Toggle Buttons

- **Files**:
  - [`src/components/GlobalHeader.vue:147-165`](src/components/GlobalHeader.vue#L147-L165)
  - [`src/components/TaskList.vue:1232-1253`](src/components/TaskList.vue#L1232-L1253)
  - [`src/components/CalendarView.vue:339-360`](src/components/CalendarView.vue#L339-L360)
- **Action Items**:
  - [x] Retain the primary "List | Calendar" toggle in `GlobalHeader.vue`.
  - [x] Remove duplicate toggle button markup and associated handlers from `TaskList.vue`.
  - [x] Remove duplicate toggle button markup and associated handlers from `CalendarView.vue`.

---

### 3.4. Remove Unused Boilerplate & Fix Asset Inconsistencies

- **Files**:
  - [`src-tauri/src/lib.rs:7-9, 26`](src-tauri/src/lib.rs#L7-L9)
  - `src/assets/vue.svg`, `public/vite.svg`, `public/tauri.svg`
  - `app-icon.svg`, `public/logo.svg`
  - [`src/components/CommandPaletteModal.vue:155`](src/components/CommandPaletteModal.vue#L155)
  - [`README.md`](README.md)
- **Action Items**:
  - [x] Remove unused `greet` command from `src-tauri/src/lib.rs`.
  - [x] Delete template files: `src/assets/vue.svg`, `public/vite.svg`, and `public/tauri.svg`.
  - [x] Remove duplicate `app-icon.svg` at project root (standardize on `public/logo.svg`).
  - [x] Update shortcut label in `CommandPaletteModal.vue:155` from `"Enter"` to `"c"` for completing tasks.
  - [x] Replace default Vite boilerplate in `README.md` with TuDu project overview, build steps, and architecture summary.

---

### 3.5. Sanitize Repository of Personal Sample Data

- **Files**:
  - [`samples/rememberthemilk_dustin.json`](samples/rememberthemilk_dustin.json)
  - [`.gitignore`](.gitignore)
- **Action Items**:
  - [x] Remove `samples/rememberthemilk_dustin.json` containing sensitive personal data.
  - [x] Add `samples/*_private.json` or `samples/rememberthemilk_dustin.json` to `.gitignore`.
  - [x] Verify that generic fixture `samples/rememberthemilk_sample.json` remains intact for test suites.

---

## Phase 4: Architecture & Modularity (P4)

Deconstruct monolithic files into focused, maintainable modules and composables.

### 4.1. Decompose `commands.rs` (3,700 Lines) into Submodules

- **Files**:
  - [`src-tauri/src/commands.rs`](src-tauri/src/commands.rs) $\rightarrow$ `src-tauri/src/commands/`
- **Action Items**:
  - [x] Create `src-tauri/src/commands/` directory.
  - [x] Extract list handlers into `src-tauri/src/commands/lists.rs`.
  - [x] Extract task queries, mutations, and batch handlers into `src-tauri/src/commands/tasks.rs`.
  - [x] Extract tag operations into `src-tauri/src/commands/tags.rs`.
  - [x] Extract note handlers into `src-tauri/src/commands/notes.rs`.
  - [x] Extract reminder handlers into `src-tauri/src/commands/reminders.rs`.
  - [x] Extract OpenTask backup export/import into `src-tauri/src/commands/backup.rs`.
  - [x] Create `src-tauri/src/commands/mod.rs` to re-export handlers and keep `lib.rs` registration clean.
  - [x] Colocate unit tests with their respective submodule files.

---

### 4.2. Decompose Monolithic `TaskList.vue` (2,248 Lines)

- **Files**:
  - [`src/components/TaskList.vue`](src/components/TaskList.vue) $\rightarrow$ `src/components/TaskList/`
- **Action Items**:
  - [x] Extract `TaskListHeader.vue` (view title, task counter, sort dropdown).
  - [x] Extract `TaskBatchToolbar.vue` (bulk selection actions: complete, delete, tag, postpone).
  - [x] Extract `TaskContextMenu.vue` (context menu logic and options).
  - [x] Extract `TaskRow.vue` (task item rendering, priority pill, tag badges, checkbox, subtask indicator).
  - [x] Extract `TaskSmartAddInput.vue` (quick add input with `#tag`, `^due`, `!priority` parsing).
  - [x] Extract `HomeCaptureView.vue` (empty-state capture screen).
  - [x] Slim down `TaskList.vue` to orchestrate state, scrolling, and child component composition.

---

### 4.3. Standardize Types and Utilities Re-exports

- **Files**:
  - [`src/types/index.ts`](src/types/index.ts)
  - [`src/models/index.ts`](src/models/index.ts)
  - [`src/utils/index.ts`](src/utils/index.ts)
- **Action Items**:
  - [x] Standardize model imports: pick either `src/models` or `src/types` as canonical across all Vue components and stores.
  - [x] Update `src/utils/index.ts` to export all helpers (`sorting.ts`, `smartAdd.ts`, `icons.ts`).

---

### 4.4. Centralize Global Keyboard Shortcuts Composable

- **Files**:
  - [`src/App.vue`](src/App.vue)
  - [`src/components/TaskList.vue`](src/components/TaskList.vue)
  - `src/composables/useKeyboardShortcuts.ts` (new)
- **Action Items**:
  - [x] Create `src/composables/useKeyboardShortcuts.ts`.
  - [x] Migrate keyboard event listeners from `App.vue` and `TaskList.vue` into the composable.
  - [x] Implement consistent input guard (suppress single-key shortcuts when typing in `input`, `textarea`, or contenteditable).
  - [x] Handle modal priority (pressing `Escape` closes the top modal before deselecting tasks).

---

## Phase 5: Testing & Toolchain (P5)

Developer experience improvements, script consistency, and test suite hygiene.

### 5.1. Add Test Scripts & Missing Type Definitions

- **Files**:
  - [`package.json`](package.json)
  - [`vite.config.ts`](vite.config.ts)
- **Action Items**:
  - [ ] Add `"test": "bun test"` to `scripts` in `package.json`.
  - [ ] Add `"test:typecheck": "vue-tsc --noEmit && bun run tsc --noEmit -p tsconfig.tests.json"` to `scripts`.
  - [ ] Install `@types/bun` and `@types/node` under `devDependencies`.
  - [ ] Remove `// @ts-expect-error` in `vite.config.ts`.

---

### 5.2. Include Test Files in TypeScript Configuration

- **Files**:
  - [`tsconfig.json`](tsconfig.json)
  - `tsconfig.tests.json` (optional)
- **Action Items**:
  - [ ] Ensure test files are covered by TypeScript checking (either by including `"tests/**/*.ts"` in `tsconfig.json` or configuring `tsconfig.tests.json`).
  - [ ] Run type-check to confirm no hidden type errors exist across test files.

---

### 5.3. Rename Phase-Based Test Files Semantically

- **Files**:
  - `tests/phase3.test.ts` $\rightarrow$ `tests/queryEngine.test.ts` & `tests/sorting.test.ts`
  - `tests/phase4.test.ts` $\rightarrow$ `tests/uiStore.test.ts`
  - `tests/phase6.test.ts` $\rightarrow$ `tests/batchActions.test.ts`
  - `tests/phase7.test.ts` $\rightarrow$ `tests/taskDetail.test.ts`
  - `tests/phase8.test.ts` $\rightarrow$ `tests/optimisticUpdates.test.ts`
- **Action Items**:
  - [ ] Rename test files to reflect their domain rather than development phase number.
  - [ ] Update any test runner references or imports.
  - [ ] Run `bun test` to verify all 100+ tests pass with the new file names.
