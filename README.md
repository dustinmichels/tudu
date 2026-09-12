# TuDu

A fast, keyboard-first, local-first personal task manager inspired by Remember The Milk (RTM), built with **Tauri 2**, **Vue 3**, and embedded **libSQL / SQLite**.

---

## Features

- **Flexible Organization**: Organize tasks across custom lists, tags, priorities (P1, P2, P3), and due dates.
- **Smart Views**: Built-in dynamic views including _Inbox_, _Today_, _Tomorrow_, _This Week_, _All Tasks_, and _Trash_ with real-time count badges.
- **Hierarchical Subtasks**: Break tasks down into recursive subtasks with individual completion states, due dates, and notes.
- **Keyboard-First Workflow**:
  - `j` / `k` or `↑` / `↓`: Navigate tasks
  - `c`: Toggle completion
  - `d`: Postpone task by 1 day
  - `n` or `/`: Focus quick-add input with smart parsing (`#tag`, `^due`, `!p1`)
  - `⌘K` / `⌘⇧P`: Global Command Palette
  - `⌘C`: Toggle List and Calendar views
  - `?`: Open keyboard shortcuts reference
- **Multiple Views**: Seamlessly switch between the primary **List View** and an interactive monthly **Calendar View**.
- **Data Portability**: Full backup export and import adhering to the open **OpenTask v1.0** format, plus a dedicated Remember The Milk (RTM) JSON import mapper.
- **Local-First & Private**: Data is stored locally in an embedded libSQL/SQLite database using WAL mode and transactional safety.

---

## Tech Stack

- **Frontend**:
  - [Vue 3](https://vuejs.org/) (Composition API, `<script setup>`)
  - [TypeScript](https://www.typescriptlang.org/)
  - [Pinia](https://pinia.vuejs.org/) (State management)
  - [Tailwind CSS](https://tailwindcss.com/)
  - [Lucide Vue](https://lucide.dev/) (Icons)
- **Backend / Desktop Shell**:
  - [Tauri 2](https://tauri.app/)
  - [Rust](https://www.rust-lang.org/)
  - [libSQL](https://github.com/tursodatabase/libsql) / SQLite
- **Runtime & Toolchain**:
  - [Bun](https://bun.sh/) (Package manager & test runner)
  - [Vite](https://vite.dev/)

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (v1.0+)
- [Rust](https://www.rust-lang.org/tools/install) (latest stable)
- System dependencies for [Tauri 2](https://tauri.app/start/prerequisites/)

### Installation

Clone the repository and install frontend dependencies:

```bash
git clone https://github.com/your-username/tudu.git
cd tudu
bun install
```

### Running in Development

Launch the desktop application in Tauri development mode:

```bash
bun run tauri dev
```

Or run the frontend in the browser (with mock data / web fallback):

```bash
bun run dev
```

---

## Testing

Run frontend tests with Bun:

```bash
bun test
```

Run Rust backend tests with Cargo:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Build production frontend assets:

```bash
bun run build
```

---

## Architecture Overview

```
├── src/
│   ├── components/       # UI components (TaskList, CalendarView, DetailView, Modals)
│   ├── desktop/          # Desktop entry point and layout shell
│   ├── mobile/           # Mobile viewport prototype shell
│   ├── stores/           # Pinia stores (lists, tasks, tags, filters, ui)
│   ├── services/         # Tauri IPC bridge, query engine, OpenTask/RTM parsers
│   ├── utils/            # Sorting, smart add token parser, list icon registry
│   └── models/           # Frontend TypeScript interfaces
├── src-tauri/
│   ├── src/
│   │   ├── commands.rs   # Tauri IPC command handlers and database queries
│   │   ├── db.rs         # libSQL connection lifecycle and schema migrations
│   │   ├── models.rs     # Rust data structures and Serde serializers
│   │   └── lib.rs        # Tauri application builder and command dispatch
│   └── migrations/       # SQL migration scripts
└── tests/                # Unit and integration test suites
```

---

## License

MIT
