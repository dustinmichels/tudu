## Phase 9: Cloud Sync & Turso Replication (Multi-Device Readiness)

- [ ] Add Turso Cloud configuration settings UI (database URL and auth token)
- [ ] Configure `libsql` embedded replica sync command in Rust core (`sync()`)
- [ ] Implement background sync scheduler and manual "Sync Now" button with sync status indicator
- [ ] Implement network connectivity detection (auto-sync when back online)
- [ ] Implement conflict resolution policy (Last-Write-Wins based on `updated_at` timestamps, soft-delete tombstones)
- [ ] Build onboarding flow for initial local-to-remote database provisioning / migration

---

## Phase 10: Mobile Expansion (Android / iOS with Tauri v2)

- [ ] Configure Tauri v2 mobile targets (Android / iOS project scaffolding)
- [ ] Implement adaptive touch UI:
  - Replace 3-pane layout on mobile with bottom navigation bar / drawer and stacked detail views
  - Swipe gestures on task rows (swipe right to complete, swipe left to postpone)
- [ ] Set up mobile notification plugin for due date reminders
- [ ] Test end-to-end sync between desktop (macOS) and mobile (Android) via Turso Cloud
