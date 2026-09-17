# Changelog

## 2026-09-17

### Added

- **Undo (⌘Z)**: Task mutations now record inverse operations in `useUndoStore`, surfaced by the floating undo toast and `⌘Z`/`Ctrl+Z`. Covers add, complete/reopen, discrete field edits (priority, due, list, rename), delete, batch delete, and batch update; per-keystroke text edits keep native input undo.
- **Task Restore**: Registered the existing `restore_task`/`batch_restore_tasks` backend commands in the Tauri invoke handler and exposed `taskStore.restoreTask`/`batchRestore`, so soft-deleted tasks (and the descendants deleted with them) can be revived.

## 2026-09-13

### Added

- **Freeform Canvas View**: Spatial 2D board with pan, zoom, card positioning, auto-layout, and DB schema migration (`0005_freeform_coordinates.sql`) for task coordinates (`freeform_x`, `freeform_y`).
- **Mobile App Experience**: Replaced the prototype shell with a functional mobile task interface.
- **Task Descriptions**: Added description viewing and editing to task details.
- **Task Context Actions**: Added complete, delete, priority, list, and postpone actions to the task context menu.
- **Backup Workflows**: Added OpenTask JSON export and direct OpenTask/TuDu backup import to the UI.
- **Bunny Celebration**: Completed-view celebration modal with bunny animation (`BunnyCelebration.vue`).
- **Markdown Checklist Engine**: Parsing and synchronization utilities for markdown checklists (`src/utils/markdown.ts`).
- **Backup Coordinate Support**: Preserved freeform coordinates in OpenTask JSON export/import.
- **Mobile & Desktop Scripts**: Added multi-target npm scripts (`dev:desktop`, `dev:mobile:*`, `build:desktop`) and multi-page Rollup configuration in `vite.config.ts`.

### Changed & Fixed

- **Smart Add**: Preserved unrecognized tokens and shared suggestion behavior between Smart Add and Quick Capture.
- **Tag Assignment**: Auto-create tags on assignment in backend and Smart Add/Quick Capture inputs.
- **Sorting**: Unified list and search-result sorting, including created-date, list, and tag sorting.
- **Today View**: Keep overdue tasks visible when they are completed that day.
- **List Deletion**: Refresh in-memory tasks after deleting a list.
- **Batch Actions**: Reduced delete and tag operations to one backend request per batch.
- **Calendar**: Improved rendering performance and added parent-task context to subtasks.
- **Accessibility**: Improved modal focus handling, task-row keyboard controls, and icon-button labels.
- **Task Coordinate Reset**: Enabled clearing `freeform_x` and `freeform_y` coordinates via `null` in `update_task`.
- **Test Suite Modernization**: Stabilized freeform layout tests and modularized phase test suites (`batchActions`, `sidebar`, `taskDetail`, `optimisticUpdates`, `freeformView`).
- **Codebase Cleanup**: Removed legacy entrypoints (`src/App.vue`, `src/main.ts`, `src/types/index.ts`) and stale build configs.
