# Mobile & Desktop Standalone Apps — Setup Todo

This plan implements **Target-Specific Frontends in One Tauri Project**:

- **Desktop app**: compiled via `index.html` → `src/desktop/` → macOS `.app` / Windows `.exe`
- **Mobile app**: compiled via `mobile.html` → `src/mobile/` → Android `.apk` / iOS `.ipa`
- **Shared core**: `src/stores/`, `src/services/`, `src/models/`, `src/utils/`

---

## Phase 1: Entry Points & Directory Scaffolding

- [x] **1.1 Create directory layout**
  - [x] Create `src/desktop/`
  - [x] Create `src/mobile/`
  - [x] Create `src/mobile/components/`
  - [x] Create `src/components/common/` (for shared UI atoms like badges, pills, pickers)

- [x] **1.2 Create `mobile.html`**
  - [x] Create `mobile.html` at repository root
  - [x] Configure mobile viewport: `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no" />`
  - [x] Add script tag pointing to `/src/mobile/main.ts`

- [x] **1.3 Migrate Desktop entry point**
  - [x] Create `src/desktop/main.ts` (mounts `DesktopApp.vue`)
  - [x] Create `src/desktop/DesktopApp.vue` (move the existing 3-pane layout, header, and global keyboard shortcuts from `src/App.vue`)
  - [x] Update `index.html` script tag to point to `/src/desktop/main.ts`

- [x] **1.4 Create Mobile entry point**
  - [x] Create `src/mobile/main.ts` (imports styles, Pinia, mounts `MobileApp.vue`)
  - [x] Create `src/mobile/MobileApp.vue` (initial clean mobile shell with bottom navigation placeholder)

---

## Phase 2: Vite Configuration for Multi-Page Builds

- [x] **2.1 Configure multi-page Rollup input in `vite.config.ts`**
  - [x] Add `rollupOptions.input` with entries:
    - `desktop: resolve(__dirname, "index.html")`
    - `mobile: resolve(__dirname, "mobile.html")`
- [x] **2.2 Verify Vite dev & build**
  - [x] Run `bun run dev` and confirm both `http://localhost:1420/` and `http://localhost:1420/mobile.html` load
  - [x] Run `bun run build` and verify that `dist/index.html` and `dist/mobile.html` are generated without TypeScript or bundling errors

---

## Phase 3: Tauri Configuration & Scripts

- [x] **3.1 Set up Tauri mobile configuration overlay**
  - [x] Keep `src-tauri/tauri.conf.json` configured for desktop (`dist/index.html` / `http://localhost:1420`)
  - [x] Create `src-tauri/tauri.mobile.conf.json`:
    - Set `build.devUrl` to `http://localhost:1420/mobile.html`
    - Set `build.frontendDist` to `../dist`
    - Configure mobile window/display settings

- [ ] **3.2 Configure Tauri capabilities for desktop vs mobile**
  - [ ] Inspect `src-tauri/capabilities/`
  - [ ] Ensure capabilities needed on desktop (e.g. window management, shortcuts) and mobile (e.g. notifications, deep links) are properly scoped

- [x] **3.3 Update `package.json` scripts**
  - [x] Add `"dev:desktop": "tauri dev"`
  - [x] Add `"dev:mobile:android": "tauri android dev -c ./src-tauri/tauri.mobile.conf.json"`
  - [x] Add `"dev:mobile:ios": "tauri ios dev -c ./src-tauri/tauri.mobile.conf.json"`
  - [x] Add `"build:desktop": "tauri build"`
  - [x] Add `"build:android": "tauri android build -c ./src-tauri/tauri.mobile.conf.json"`
  - [x] Add `"build:ios": "tauri ios build -c ./src-tauri/tauri.mobile.conf.json"`

---

## Phase 4: Native Mobile Scaffolding (Tauri Targets)

- [ ] **4.1 Initialize Android target**
  - [ ] Run `bun run tauri android init`
  - [ ] Verify `src-tauri/gen/android/` project is generated
  - [ ] Check Android permissions in `AndroidManifest.xml` (internet, network state)

- [ ] **4.2 Initialize iOS target (macOS)**
  - [ ] Run `bun run tauri ios init`
  - [ ] Verify `src-tauri/gen/apple/` Xcode project is generated
  - [ ] Check bundle identifier matches `com.tudu.app`

- [ ] **4.3 Configure `.gitignore`**
  - [ ] Ensure mobile build artifacts in `src-tauri/gen/*/build` or `.gradle` are ignored

---

## Phase 5: Shared Core Verification

- [ ] **5.1 Verify Pinia stores are platform-agnostic**
  - [ ] Ensure `stores/tasks.ts`, `stores/lists.ts`, `stores/tags.ts`, `stores/filters.ts` have no direct DOM or desktop window references
  - [ ] Adapt `stores/ui.ts` so mobile navigation state (active tab, mobile sheet visibility) can be managed cleanly

- [ ] **5.2 Verify backend API layer**
  - [ ] Verify `services/api.ts` invokes Tauri commands identically whether running on desktop or mobile
  - [ ] Test SQLite / Turso database connection path resolution on mobile targets

---

## Phase 6: Mobile Layout & Shell

- [x] **6.1 Handle Mobile Viewport & Safe Areas**
  - [x] Add CSS utilities or Tailwind classes for `pt-[env(safe-area-inset-top)]` and `pb-[env(safe-area-inset-bottom)]`
  - [x] Add `overflow-hidden` and `touch-action` rules to prevent rubber-band bounce on app frame

- [x] **6.2 Build `MobileHeader`**
  - [x] Compact touch header with active list/view title
  - [x] Back button navigation between lists directory and list tasks
  - [x] Sync status icon & offline badge

- [x] **6.3 Build `MobileNav` (Bottom Tab Bar)**
  - [x] Create persistent bottom bar with icons:
    - _Inbox_ (with task count badge)
    - _Today_ (with task count badge)
    - _Lists_
    - _Settings_
  - [x] Add active tab styling and touch feedback styling

- [x] **6.4 Add Floating Action Button (FAB)**
  - [x] Floating `+` button in lower right for quick task capture
  - [x] Connect FAB to `CaptureModal.vue`

---

## Phase 7: Mobile-Optimized Task List

- [ ] **7.1 Build `MobileTaskList.vue`**
  - [ ] Touch-optimized task rows (minimum 48px height)
  - [ ] High-contrast completion checkbox with tap target
  - [ ] Clean badge row for due date, priority, tags, subtask count

- [ ] **7.2 Implement Touch Gestures**
  - [ ] Swipe right: complete task (green reveal with checkmark)
  - [ ] Swipe left: postpone task by 1 day (yellow reveal with clock)
  - [ ] Long press: open batch actions or context menu

- [ ] **7.3 Implement Pull-to-Refresh**
  - [ ] Pull-down gesture to trigger database sync / task re-fetch
  - [ ] Visual spinner / sync status indicator

---

## Phase 8: Mobile Task Detail (Bottom Sheet / Full Screen)

- [ ] **8.1 Build `MobileTaskDetail.vue`**
  - [ ] Slide-up modal sheet or stack screen transition
  - [ ] Header with "Done" button and delete/archive action
  - [ ] Large touch-friendly input for task title & notes
  - [ ] Mobile-optimized pickers for due date, list, tags, and priority
  - [ ] Subtask list with one-tap subtask add

---

## Phase 9: Verification & Testing

- [ ] **9.1 Desktop Verification**
  - [ ] Run `bun run dev:desktop` and verify desktop 3-pane UI works identically to before
  - [ ] Test keyboard shortcuts (`Cmd+P`, `c`, `Tab`, `Arrow` keys)
  - [ ] Run `bun run build:desktop` to verify standalone macOS app builds cleanly

- [ ] **9.2 Mobile Web Verification**
  - [ ] Open `http://localhost:1420/mobile.html` in browser using mobile device simulator
  - [ ] Verify bottom navigation, task creation, swipe actions, and responsive detail view

- [ ] **9.3 Native Mobile Verification**
  - [ ] Run `bun run dev:mobile:android` on an Android emulator / device
  - [ ] Run `bun run dev:mobile:ios` on an iOS simulator / device
  - [ ] Confirm local database creates and tasks persist across app restarts
