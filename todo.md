# TuDu Codebase Audit & Action Plan

This document outlines the findings from a comprehensive audit of the TuDu codebase across Vue 3, TypeScript, Pinia, SQLite migrations, and Tauri v2 (Rust). Items are broken down into bite-sized, actionable tasks categorized by priority and domain.

---

## 1. Critical & High-Priority Bugs

- [x] **1.1 Add Task Description editing and display to `TaskDetail.vue`**
  - **Issue**: The database schema, backend models, API layer, and OpenTask interchange specification all support `description: string | null`, but `TaskDetail.vue` completely omits a description field. Users have no way to view or edit a task's top-level description in the UI.
  - **Action**: Add an editable Description textarea in `src/components/TaskDetail.vue` with debounced persistence (`updateTask({ id, description })`) matching the existing title and notes patterns.

- [x] **1.2 Fix window click event listener memory leak in `GlobalHeader.vue`**
  - **Issue**: `GlobalHeader.vue` registers `window.addEventListener("click", handleDocumentClick)` in `onMounted` to close the dropdown menu, but does not define `onUnmounted` to clean it up.
  - **Action**: Add `onUnmounted(() => window.removeEventListener("click", handleDocumentClick))` in `src/components/GlobalHeader.vue`.

- [x] **1.3 Fix disconnected sorting state between `filterStore` and `TaskList.vue`**
  - **Issue**: `useFilterStore` holds `sortBy` (defaulting to `"priority"`) and `sortOrder`, which `filteredTasks` uses when a search query is active. However, `TaskList.vue` maintains independent local refs (`activeSortField = ref(null)` and `activeSortOrder = ref("asc")`) and never updates `filterStore`. When a user searches, results are sorted by priority regardless of the sort order shown in the header.
  - **Action**: Connect `TaskListHeader.vue` sort controls directly to `filterStore.setSorting(...)` so `filterStore` is the single source of truth for sorting across both filtered and standard list views.

- [x] **1.4 Fix destructive token stripping for unrecognized tokens in `parseSmartAdd`**
  - **Issue**: In `src/utils/smartAdd.ts`, the regex `(?:^|\s)([#!^])(?:"([^"]+)"|'([^']+)'|([^\s]+))` captures any word starting with `!`, `^`, or `#`. If a token does not resolve to a valid priority (e.g. `!not` in `"Read this ! Not urgent"`) or valid date, it is still removed from the title in the reverse index slice loop.
  - **Action**: Only remove matched tokens from `cleanedTitle` if they successfully resolved to a recognized list, tag, due date, or priority.

- [x] **1.5 Prevent completed overdue tasks from immediately vanishing in "Today" view**
  - **Issue**: In `queryEngine.ts`, `matchesSmartView` tests `task.completed ? isToday(task.due, now) : isTodayOrOverdue(task.due, now)`. When an overdue task is completed in the "Today" view, its completion status flips to `true`, causing `isToday(task.due)` to evaluate to `false` and the task to instantly vanish even when `includeCompleted` is enabled.
  - **Action**: Update `matchesSmartView` and the backend SQL query in `commands/tasks.rs` so completed tasks shown in "Today" include tasks completed today (`completed_at` is today) or due today/overdue.

- [x] **1.6 Synchronize task store on list deletion in `lists.ts`**
  - **Issue**: When `listStore.deleteList(id)` is called, the backend cascades soft-deletion to all active tasks in that list. However, `listStore.deleteList` only removes the list from `lists.value`, leaving stale tasks in `taskStore.allTasks` in memory. `Sidebar.vue` had to work around this with a manual `taskStore.fetchAllTasks()`.
  - **Action**: In `src/stores/lists.ts`, automatically trigger `taskStore.fetchAllTasks()` or filter out tasks belonging to the deleted `list_id` inside `deleteList`.

- [x] **1.7 Create missing `tauri.mobile.conf.json` or update package scripts**
  - **Issue**: `package.json` specifies `"dev:mobile:android": "tauri android dev -c ./tauri.mobile.conf.json"` and `"dev:mobile:ios": "tauri ios dev -c ./tauri.mobile.conf.json"`, but `tauri.mobile.conf.json` does not exist in the repository, causing mobile development scripts to fail immediately.
  - **Action**: Create `src-tauri/tauri.mobile.conf.json` with appropriate mobile configuration (pointing to `mobile.html` or dev server) or update package script paths to the correct configuration location.

---

## 2. Performance & Database Optimizations

- [x] **2.1 Eliminate $O(42 \times N)$ date parsing bottleneck in `CalendarView.vue`**
  - **Issue**: In `src/components/CalendarView.vue`, `calendarCells` generates 42 day slots. For each slot, it runs `calendarTasks.value.filter(...)`, calling `parseDueDateToLocal(t.due)` for every task on every cell ($42 \times N$ parses per render).
  - **Action**: Pre-group tasks into a `Map<string, Task[]>` keyed by `YYYY-MM-DD` string before iterating over the 42 cells, reducing calculation complexity from $O(42 \times N)$ to $O(N)$.

- [x] **2.2 Replace sequential single-task IPC deletes with batch delete in `TaskBatchToolbar.vue`**
  - **Issue**: In `TaskBatchToolbar.vue`, `handleBatchDelete` executes `for (const id of ids) await taskStore.deleteTask(id);`. Deleting 50 selected tasks creates 50 individual async Tauri IPC roundtrips and SQLite transactions sequentially.
  - **Action**: Add batch delete support to the backend `batch_update_tasks` or add a dedicated `batch_delete_tasks` command in `src-tauri/src/commands/tasks.rs` and invoke it once with all IDs.

- [x] **2.3 Batch tag assignment and removal in `TaskBatchToolbar.vue`**
  - **Issue**: `handleBatchAssignTag` and `handleBatchRemoveTag` fire `Promise.all(ids.map(id => assignTag(id, tag.id)))`, sending concurrent individual IPC calls per task.
  - **Action**: Introduce `batch_assign_tag` and `batch_remove_tag` commands in `src-tauri/src/commands/tags.rs` to associate or dissociate tags across multiple task IDs in a single SQL operation.

- [x] **2.4 Avoid redundant 2-step parent linking during checklist import in `backup.rs`**
  - **Issue**: In `src-tauri/src/commands/backup.rs`, checklist items are inserted with `parent_id = NULL`, appended to `pending_parent_updates`, and then re-updated in a second SQL query pass (`UPDATE tasks SET parent_id = ?1 WHERE id = ?2`).
  - **Action**: Insert checklist items directly with `parent_id = task_id` on the initial `INSERT`, removing unnecessary follow-up update queries.

- [x] **2.5 Eliminate redundant double invocation of `onSwitchView()` in `src/stores/ui.ts`**
  - **Issue**: In `src/stores/ui.ts`, `setViewMode` explicitly calls `onSwitchView()`, then mutates `viewMode.value`, which synchronously triggers `watch(viewMode, ..., { flush: "sync" })`, calling `onSwitchView()` a second time.
  - **Action**: Remove the manual `onSwitchView()` call inside `setViewMode` and rely solely on the watcher, or remove the watcher and handle view switches exclusively in `setViewMode`.

---

## 3. Accessibility (a11y) & UX Polish

- [x] **3.1 Add ARIA dialog attributes and focus trap to `CaptureModal.vue`**
  - **Issue**: `CaptureModal.vue` uses an overlay transition without `role="dialog"`, `aria-modal="true"`, or `aria-labelledby`, and does not constrain Tab focus within the modal.
  - **Action**: Add proper dialog ARIA roles to `CaptureModal.vue` and implement a focus trap or `@keydown.tab` guard while open.

- [x] **3.2 Improve keyboard accessibility on task list rows (`TaskRow.vue`)**
  - **Issue**: Task row containers are `<div>` elements with `@click`. Keyboard users without screen-reader navigation or custom shortcuts cannot tab directly to a task row, inspect it, or press Enter/Space to select it.
  - **Action**: Add `tabindex="0"`, `role="button"`, and `@keydown.enter` / `@keydown.space` handlers on the task row container, or clarify that keyboard navigation uses shortcut keys (with appropriate `aria-keyshortcuts` attributes).

- [x] **3.3 Expand context menu actions in `TaskContextMenu.vue`**
  - **Issue**: Right-clicking a task only provides postpone options (+1 day, +2 days, +1 week). Basic expected operations such as "Mark Complete", "Delete", "Change Priority", and "Move to List" are missing.
  - **Action**: Add options for Complete/Incomplete toggle, Priority selection (1, 2, 3, None), Move to List, and Delete to `TaskContextMenu.vue`.

- [x] **3.4 Expose OpenTask v1.0 Export Backup in the UI**
  - **Issue**: `api.backup.export()` and the Rust `export_backup` backend command are fully implemented and tested, but there is no user-facing button or menu entry to trigger a backup export.
  - **Action**: Add an "Export Backup..." action to the App Menu in `GlobalHeader.vue` and/or `Sidebar.vue` footer that downloads the generated OpenTask v1.0 JSON document.

- [x] **3.5 Add direct OpenTask v1.0 JSON import option to `ImportModal.vue`**
  - **Issue**: `ImportModal.vue` only lists Remember The Milk as an enabled provider and passes everything through `mapRememberTheMilkToOpenTask`. Users cannot import a native TuDu / OpenTask backup JSON file directly.
  - **Action**: Add an "OpenTask / TuDu Backup" provider option to `ImportModal.vue` that passes the document directly to `api.backup.import` without RTM translation.

- [x] **3.6 Indicate parent task context on subtasks in `CalendarView.vue`**
  - **Issue**: Subtasks with due dates appear as standalone chips in the calendar grid alongside parent tasks with no visual distinction or parent name indication.
  - **Action**: Display a subtask indicator icon (e.g. `ListTree` or parent task title prefix) on calendar chips when `task.parent_id` is present.

- [x] **3.7 Add explicit `aria-label`s to icon-only buttons**
  - **Issue**: Several icon-only buttons rely solely on the HTML `title` attribute, which is not reliably announced by all screen readers.
  - **Action**: Audit buttons across `GlobalHeader.vue`, `TaskDetail.vue`, `TaskListHeader.vue`, and modal components to ensure `aria-label` is present on all icon-only buttons.

---

## 4. Legacy Code & Dead Code Removal

- [x] **4.1 Remove unused legacy alias `loadTags` in `src/stores/tags.ts`**
  - **Issue**: `const loadTags = fetchTags;` on line 33 of `src/stores/tags.ts` is an obsolete alias not referenced anywhere in the project.
  - **Action**: Delete `loadTags` and export only `fetchTags`.

- [x] **4.2 Clean up unused sorting helper functions in `src/utils/sorting.ts`**
  - **Issue**: `sortByPriority`, `sortByDueDate`, `sortByTitle`, and `sortByManual` are exported convenience functions that are never used in production application code (only in `tests/sorting.test.ts`).
  - **Action**: Either replace hand-rolled sorts with these helpers or deprecate/remove the unused wrapper functions and test `sortTasks` directly.

- [x] **4.3 Clean up unused computed smart list getters in `src/stores/tasks.ts`**
  - **Issue**: `inboxTasks`, `todayTasks`, `tomorrowTasks`, `thisWeekTasks`, `allTasksList`, `trashTasks`, and `overdueTasks` are defined in `useTaskStore`, but all view components query tasks via `filteredTasks` or `tasks.value`.
  - **Action**: Review usage across stores and remove dead computed getters that create unnecessary reactive overhead.

- [x] **4.4 Remove empty `.gitkeep` placeholder files**
  - **Issue**: `src/components/common/.gitkeep` and `src/mobile/components/.gitkeep` are empty placeholders left over from directory scaffolding.
  - **Action**: Delete `.gitkeep` files once real components are added or remove them if directories remain empty.

- [x] **4.5 Replace indirect `created_at` sort routing in `src/utils/sorting.ts`**
  - **Issue**: In `createTaskComparator`, the `case "created_at":` branch delegates to `compareByManual(a, b, order)`, which relies on fallback logic rather than a direct timestamp comparison.
  - **Action**: Implement a clean, dedicated `compareByCreatedAt` helper and call it directly in the switch statement.

---

## 5. Code Duplication & Architecture Refactoring

- [x] **5.1 Extract shared Smart Add input logic into a composable (`useSmartAddInput`)**
  - **Issue**: `CaptureModal.vue` and `TaskSmartAddInput.vue` share over 200 lines of identical logic: `updateSmartDropdown`, `selectSmartSuggestion`, cursor calculation, token detection, keyboard navigation (ArrowUp/Down/Enter), badge styling, and task creation.
  - **Action**: Extract the token detection, suggestion filtering, and keyboard navigation state into a reusable `useSmartAddInput` composable in `src/composables/`.

- [x] **5.2 Unify markdown note rendering with a robust parser and sanitization**
  - **Issue**: In `src/components/TaskDetail.vue`, `renderMarkdown` uses a chain of regex replacements that produces invalid HTML (e.g. `<li>` tags outside `<ul>` containers, `<br />` appended after block headings).
  - **Action**: Move note markdown rendering into `src/utils/markdown.ts`, use a lightweight standard-compliant parser or sanitize structured HTML with proper list and block tag nesting.

- [x] **5.3 Unify sorting logic between `TaskList.vue` and `src/utils/sorting.ts`**
  - **Issue**: `TaskList.vue` implements its own custom comparator functions (`compareByCompletion`, `compareByPriority`, `compareByDueDate`, `created_at`, `list`, `tags`) inside a local `computed` property, duplicating logic already implemented in `src/utils/sorting.ts`.
  - **Action**: Expand `src/utils/sorting.ts` to support `"list"` and `"tags"` fields, and use `sortTasks` directly in `TaskList.vue`.

- [x] **5.4 Complete or streamline Mobile App prototype (`MobileApp.vue`)**
  - **Issue**: `src/mobile/MobileApp.vue` contains an initial layout skeleton with static placeholder text ("Mobile Shell Ready"), a non-functional FAB button, and disconnected navigation tabs.
  - **Action**: Either implement the mobile view according to `mobile-setup-todo.md` (reusing `TaskList.vue` or creating a dedicated mobile list component) or mark mobile scaffolding status clearly in documentation.

---

## 6. Security & Configuration Best Practices

- [x] **6.1 Configure Content Security Policy (CSP) in `tauri.conf.json`**
  - **Issue**: In `src-tauri/tauri.conf.json`, `"security": { "csp": null }` explicitly disables the Content Security Policy, leaving the desktop webview without defense-in-depth against injection vulnerabilities.
  - **Action**: Define a restrictive CSP in `tauri.conf.json` (e.g. `default-src 'self'; img-src 'self' asset: https: data:; style-src 'self' 'unsafe-inline'`).

- [x] **6.2 Standardize test console error suppression for negative test cases**
  - **Issue**: Running `bun test` prints raw error messages (`[API Error] update_task: Database error occurred`, `navigator.clipboard.writeText failed: Clipboard write denied`) because production logging runs during intentional error simulation tests.
  - **Action**: In `tests/optimisticUpdates.test.ts` and `tests/markdown.test.ts`, temporarily mock or spy on `console.error` and `console.warn` during expected failure assertions to keep test runner output clean.

- [x] **6.3 Add script checks and verification to `scripts/reset-db.sh`**
  - **Issue**: `scripts/reset-db.sh` relies on `sqlite3` CLI being installed locally to run migrations. If `sqlite3` is absent on the developer's system, migration execution fails silently or with an error.
  - **Action**: Add a prerequisite check for `sqlite3` in `reset-db.sh` with a descriptive error message guiding developers on installation or fallback to Tauri database auto-migration on launch.
