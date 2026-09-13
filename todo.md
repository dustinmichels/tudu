# TuDu Codebase Audit & Improvement Plan

This document outlines key findings from the codebase audit, organized into bite-sized actionable sections.

---

## 1. Legacy & Dead Code (Completed)

- [x] **Remove legacy desktop wrapper `src/App.vue`**
  - Replaced by `src/desktop/DesktopApp.vue` and referenced nowhere in the active application.
- [x] **Remove legacy root entry point `src/main.ts`**
  - Replaced by `src/desktop/main.ts` and `src/mobile/main.ts`.
- [x] **Remove stale build artifacts in project root**
  - Deleted `vite.config.js` and `vite.config.d.ts` (canonical config is `vite.config.ts`).
  - Deleted committed build cache `tsconfig.node.tsbuildinfo`.
- [x] **Update `.gitignore`**
  - Added `*.tsbuildinfo`, `vite.config.js`, `vite.config.d.ts`, and `target` to prevent build artifact tracking.
- [x] **Remove redundant type re-export module `src/types/index.ts`**
  - The single-line re-export was unused; all imports reference `src/models/index.ts` directly.
- [x] **Export `freeform.ts` from `src/utils/index.ts`**
  - Added `freeform.ts` alongside `sorting.ts`, `smartAdd.ts`, `icons.ts`, and `markdown.ts`.

---

## 2. Bug Fixes & Correctness

- [x] **Fix silent tag assignment failure for new tags in Smart Add & Quick Capture**
  - **Issue:** `TaskSmartAddInput.vue` (line 236) and `CaptureModal.vue` (line 237) pass parsed tag names to `assignTag(created.id, tag)`. In `src-tauri/src/commands/tags.rs`, `assign_tag_impl` requires the tag to exist in the `tags` table; if not found, it returns `Err("Tag '...' does not exist")`.
  - **Fix:** Follow the pattern used in `TaskDetail.vue` and `TaskBatchToolbar.vue`: check `tagStore.tags` and call `tagStore.createTag(name)` if the tag is new, or enhance `assign_tag_impl` on the backend to automatically create missing tags by name.
- [x] **Fix inability to clear `freeform_x` and `freeform_y` coordinates in `update_task`**
  - **Issue:** In `src-tauri/src/models.rs`, `UpdateTaskInput.freeform_x` and `freeform_y` are defined as `Option<f64>` instead of `Option<Option<f64>>` with `deserialize_with = "double_option"`. In `src-tauri/src/commands/tasks.rs:535`, `task.freeform_x.or(existing.freeform_x)` treats `None` / `null` as "keep existing", preventing coordinates from ever being reset to `NULL`.
  - **Fix:** Update `freeform_x` and `freeform_y` in `UpdateTaskInput` to `Option<Option<f64>>` with `deserialize_with = "double_option"`, matching all other nullable fields (`due`, `parent_id`, `geo_latitude`, etc.).
- [x] **Stabilize flaky auto-layout unit test in `tests/freeformView.test.ts`**
  - **Issue:** Line 333 (`expect(distS2).toBeLessThan(450)`) can fail intermittently (e.g. received `451.806`) because `computeAutoLayoutPositions` defaults to unseeded `Math.random()`, and iterative collision resolution pushes cards apart beyond the arbitrary 450px boundary.
  - **Fix:** Provide a deterministic pseudo-random generator (e.g. `random: () => 0.5`) in the test options or adjust the distance threshold to 500px to account for dynamic collision resolution displacement.
- [x] **Persist freeform board coordinates in OpenTask Backup export and import**
  - **Issue:** `export_backup_impl` and `import_backup_inner` in `src-tauri/src/commands/backup.rs` do not export or restore `freeform_x` and `freeform_y` (added in migration 5).
  - **Fix:** Store `freeform_x` and `freeform_y` inside the task `extra` JSON metadata on export, and restore them upon import so custom board layouts persist across backup and restore.

---

## 3. Build & Multi-Target Configuration

- [x] **Configure multi-page Rollup input in `vite.config.ts`**
  - **Issue:** `vite.config.ts` currently lacks `build.rollupOptions.input`. Production `bun run build` only builds `index.html` (desktop); `mobile.html` is omitted from `dist/`.
  - **Fix:** Configure `build.rollupOptions.input` with:
    - `desktop: resolve(__dirname, "index.html")`
    - `mobile: resolve(__dirname, "mobile.html")`
- [x] **Add mobile and desktop scripts to `package.json`**
  - Add standard scripts defined in `mobile-setup-todo.md`:
    - `"dev:desktop": "tauri dev"`
    - `"dev:mobile:android": "tauri android dev -c ./tauri.mobile.conf.json"`
    - `"dev:mobile:ios": "tauri ios dev -c ./tauri.mobile.conf.json"`
    - `"build:desktop": "tauri build"`

---

## 4. Code Quality & Consistency

- [x] **Clean up redundant code in `CommandPaletteModal.vue`**
  - Line 55 has a redundant ternary: `query.value = uiStore.commandPaletteInitialMode === "lists" ? "" : "";`. Clean up to `query.value = "";`.
- [!] **Clean up placeholder `.gitkeep` files** - Blocked: Real components have not yet been added to `src/mobile/components/` or `src/components/common/`; removing `.gitkeep` now would leave the empty directories untracked.
  - Remove `src/mobile/components/.gitkeep` and `src/components/common/.gitkeep` once real components are added to those directories.
- [x] **Unify markdown specifications and documentation**
  - `about.md` references a nonexistent `screenshots` directory; update or archive in favor of `standard.md` and `README.md`.
