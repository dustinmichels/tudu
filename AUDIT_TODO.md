# Codebase Audit Checklist

## GTD Lists

- [x] Add 3 lists inspired by GTD: "Next actions", "Waiting on", and "Someday/Maybe". These go at the top, just after Inbox.

## P0 — Fix the broken sort control

- [ ] **P0.1 Assign sorting ownership to one component.** In `src/components/TaskList/TaskListHeader.vue`, remove the direct `filterStore.setSorting(...)` calls _or_ stop emitting `changeSort`; `TaskList.vue` currently applies the same click a second time.
- [ ] **P0.2 Preserve the intended sort cycle.** Verify one click selects ascending order, the second selects descending order, and the third restores the default `priority`/ascending order.
- [ ] **P0.3 Add a focused interaction test.** Mount the header/list boundary and assert the filter store transitions through all three states. This regression is not covered by the existing sorting unit tests.

## P1 — Make destructive actions and state refreshes reliable

- [ ] **P1.1 Remove the silent catch around list-deletion synchronization.** `src/stores/lists.ts` swallows every failure from `useTaskStore()` and `fetchAllTasks()` after a list is deleted; retain test-environment compatibility through dependency setup, not by hiding production failures.
- [ ] **P1.2 Define the post-delete store contract.** After `deleteList`, ensure `lists`, `tasks`, `allTasks`, `activeTaskId`, selected task IDs, and tag counts cannot reference the deleted list.
- [ ] **P1.3 Test a failed refresh after list deletion.** The UI must expose the refresh failure while preserving the backend-confirmed list deletion, rather than silently displaying potentially stale counts.
- [ ] **P1.4 Decide and document restore semantics.** `delete_task_impl` soft-deletes a task and descendants but leaves their notes, reminders, and tag links intact. Either implement restore/purge flows that use this retained data or make deletion a hard cascade and simplify the schema/commands.

## P1 — Harden backend mutation boundaries

- [ ] **P1.5 Wrap multi-statement destructive operations in transactions.** `batch_delete_tasks_impl` processes chunks independently; a later chunk failure leaves a partial batch deletion. Make the entire batch atomic or return an explicit partial-result contract.
- [ ] **P1.6 Check affected-row counts for single-task mutations.** `delete_task_impl` reports success for an unknown/already-deleted ID; align it with `toggle_task_complete_impl`, which errors when no active task can be returned.
- [ ] **P1.7 Add backend regression tests.** Cover atomic batch deletion, an unknown delete ID, recursive subtask deletion, and the chosen notes/reminders/tag cleanup policy.

## P1 — Establish a single task-query pipeline

- [ ] **P1.8 Inventory frontend versus backend task filtering.** `get_tasks_impl` applies SQL view/filter rules while `queryTasks` independently handles smart views, soft deletes, completion, tags, subtasks, search, and sorting.
- [ ] **P1.9 Choose one authoritative layer per concern.** Keep database retrieval/access control in Rust and presentation filters in TypeScript, or move all query criteria into Rust; do not maintain equivalent smart-view semantics in both layers.
- [ ] **P1.10 Share boundary fixtures.** For each smart view, test overdue/completed/deleted/subtask cases against the chosen source of truth so frontend and backend semantics cannot drift.
- [ ] **P1.11 Make timezone policy explicit.** `parseDueDateToLocal`, calendar rendering, and backend date comparisons need one declared policy for date-only values and timestamps with offsets; add timezone-boundary fixtures.

## P1 — Make optimistic updates easier to reason about

- [ ] **P1.12 Extract the per-task mutation queue from `src/stores/tasks.ts`.** The store owns optimistic mutation, debounce timers, resolver/rejecter arrays, sequence numbers, snapshots, and API dispatch in one closure.
- [ ] **P1.13 Specify concurrent-edit behavior.** Define what happens when a debounced edit, immediate freeform-position save, completion toggle, and deletion target the same task.
- [ ] **P1.14 Test request ordering and failure recovery.** Cover newer edits arriving during an active request, API rejection after an optimistic edit, immediate flush cancelling a debounce, and deletion during a pending update.
- [ ] **P1.15 Remove mutation state on task deletion.** Cancel queued timers and reject/settle pending callers for deleted IDs so delayed writes cannot revive stale UI state or retain store memory.

## P2 — Reduce duplicated UI state and behavior

- [ ] **P2.1 Route completion visibility through `filterStore`.** `TaskListHeader.vue` calls both `taskStore.setIncludeCompleted(next)` and `filterStore.setIncludeCompleted(next)`, although the filter store already delegates to the task store.
- [ ] **P2.2 Move list/view title resolution into one shared selector.** `TaskListHeader.vue` and `TaskSmartAddInput.vue` duplicate smart-view title mapping.
- [ ] **P2.3 Consolidate task-list presentation responsibilities.** `TaskList.vue` owns list filtering/sorting/selection/context-menu state while `TaskRow.vue` separately scans `allTasks` for subtasks and counts. Establish selectors in the store or a dedicated view-model/composable.
- [ ] **P2.4 Replace ad-hoc component error logging with a UI error policy.** Multiple components catch and `console.error` action failures, producing inconsistent visible feedback.

## P2 — Simplify the API surface

- [ ] **P2.5 Pick one client API style.** `src/services/api.ts` exposes both named functions and the nested `api` object. Migrate callers to one style and delete the other; do not keep two public interfaces for the same IPC commands.
- [ ] **P2.6 Keep IPC argument naming centrally typed.** Audit `snake_case` model fields versus `camelCase` Tauri command arguments and retain a single mapping boundary in `api.ts`.
- [ ] **P2.7 Add contract tests only at the IPC boundary.** Assert command names and serialized arguments there; avoid repeating mock-based plumbing tests in each component/store.

## P2 — Make import/export behavior deliberate

- [ ] **P2.8 Define import collision policy.** `import_backup_inner` upserts records by supplied IDs. Decide whether import merges, replaces, or rejects collisions, and communicate it before importing.
- [ ] **P2.9 Validate and report unsupported OpenTask fields.** Checklists, archived/smart lists, recurrence details, and vendor `extra` data need an explicit preserve/import/skip policy so users know what survives a round trip.
- [ ] **P2.10 Test collision and rollback scenarios.** Verify an invalid later item rolls back every prior write, and verify ID collisions follow the documented policy.

## P2 — Align project documentation with the repository

- [ ] **P2.11 Correct the architecture tree in `README.md`.** It references `src/commands.rs`, but commands live in `src-tauri/src/commands/`; it also omits the desktop/mobile HTML entry points and migration location accurately.
- [ ] **P2.12 Remove or substantiate the browser fallback claim.** `README.md` says `bun run dev` uses mock/web fallback while `api.ts` directly invokes Tauri IPC. Provide a real adapter or state that the browser build cannot persist task data.
- [ ] **P2.13 Replace generic package metadata.** Update the Rust package description/authors before release.

## P3 — Retire stale planning artifacts and scaffolding

- [ ] **P3.1 Consolidate old audit documents.** `todo.md` is a previous completed audit plan; retain its historical value in version control, then delete/archive it once this checklist is the active tracker.
- [ ] **P3.2 Reconcile `mobile-setup-todo.md` with shipped behavior.** It describes an unfinished mobile roadmap while `MobileApp.vue` and mobile build configuration already exist. Mark remaining items with current evidence, move them to the active tracker, or delete the superseded plan.
- [ ] **P3.3 Remove empty scaffold directories when unused.** Re-check `src/components/common/` and `src/mobile/components/`; delete empty placeholders rather than retaining speculative structure.
- [ ] **P3.4 Remove duplicate comments and stale implementation notes.** Start with the repeated “Sort State” heading in `TaskList.vue` and comments that describe test-only workarounds as runtime behavior.

## Completion gate

- [ ] Each P0/P1 item has a failing regression test before its fix and a passing test afterward.
- [ ] Run `bun test`, `bun run test:typecheck`, and `cargo test --manifest-path src-tauri/Cargo.toml` after implementation changes.
- [ ] Smoke-test desktop list sorting, list deletion, task deletion, backup import/export, and one mobile build target before closing the audit.
