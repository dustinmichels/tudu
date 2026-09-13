# Changelog

All notable changes to TuDu are documented in this file.

## 2026-09-13

### Added

- **Freeform Canvas View**: Spatial 2D board with pan, zoom, card positioning, auto-layout, and DB schema migration (`0005_freeform_coordinates.sql`) for task coordinates (`freeform_x`, `freeform_y`).
- **Bunny Celebration**: Completed-view celebration modal with bunny animation (`BunnyCelebration.vue`).
- **Markdown Checklist Engine**: Parsing and synchronization utilities for markdown checklists (`src/utils/markdown.ts`).
- **Backup Coordinate Support**: Preserved freeform coordinates in OpenTask JSON export/import.
- **Mobile & Desktop Scripts**: Added multi-target npm scripts (`dev:desktop`, `dev:mobile:*`, `build:desktop`) and multi-page Rollup configuration in `vite.config.ts`.

### Changed & Fixed

- **Tag Assignment**: Auto-create tags on assignment in backend and Smart Add/Quick Capture inputs.
- **Task Coordinate Reset**: Enabled clearing `freeform_x` and `freeform_y` coordinates via `null` in `update_task`.
- **Test Suite Modernization**: Stabilized freeform layout tests and modularized phase test suites (`batchActions`, `sidebar`, `taskDetail`, `optimisticUpdates`, `freeformView`).
- **Codebase Cleanup**: Removed legacy entrypoints (`src/App.vue`, `src/main.ts`, `src/types/index.ts`) and stale build configs.
