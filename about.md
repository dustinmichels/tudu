# TuDu Initial Concept & Vision (Archived)

> **Note**: This document captures the initial project concept and early requirements for TuDu.
>
> - For up-to-date user documentation, architecture, and guides, see [README.md](README.md).
> - For comprehensive data models, cross-system interoperability, and OpenTask JSON specifications, see [standard.md](standard.md).

TuDu is a fast, personal task management app modeled after the core workflow and ergonomics of Remember The Milk (RTM).

## Key Features

- **Flexible Organization**: Organize tasks by custom tags, lists, priority levels, or due dates.
- **List & Status Views**: Easily view and filter completed vs. incomplete tasks within each list.
- **Detailed Task Inspector**:
  - Properties: due date/time, recurrence rules, lists, tags, location, URL, and multi-note support.
  - Hierarchical subtasks (recursively supporting the same properties).
- **Prioritization & Actions**: Tasks support priority levels (P1, P2, P3) and quick postponement ("postpone by 1 day, 2 days, 1 week").

## Implementation & Architecture

- **Framework**: Built with [Tauri 2](https://tauri.app/) and a frontend powered by Bun, Vue 3, and TypeScript.
- **Multi-Platform**: Designed for desktop (macOS) first, with an extensible architecture for mobile (iOS and Android).
- **Local-First Database**: Powered locally by embedded libSQL / SQLite with support for remote synchronization via Turso.
