# Cross-System Task Interoperability & OpenTask JSON Specification

This document provides a comparative analysis of six major task management data models (**iCalendar / CalDAV RFC 5545/7986**, **JMAP for Tasks RFC 9670**, **Remember The Milk**, **Todoist**, **TickTick**, and **Google Tasks**) and defines a unified, interoperable JSON schema designed for task interchange, backup, and local storage in **TuDu**.
---

## 1. Comparative Analysis of Existing Systems

Each system represents tasks through the lens of its own historical architecture and storage model.

| Feature / Concept       | iCalendar (RFC 5545 / RFC 7986 VTODO)                  | JMAP for Tasks (RFC 9670 / JSCalendar)                 | Remember The Milk (RTM)                        | Todoist (REST API v2)                               | TickTick (Web/Open API)                      | Google Tasks (API v1)                       |
| :---------------------- | :----------------------------------------------------- | :----------------------------------------------------- | :--------------------------------------------- | :-------------------------------------------------- | :------------------------------------------- | :------------------------------------------ |
| **Data Format**         | MIME `text/calendar` (`.ics` RFC 5545)                 | Pure JSON (RFC 8620/8984)                              | Proprietary JSON / XML API                     | REST JSON                                           | REST JSON                                    | REST JSON                                   |
| **Container / List**    | `VCALENDAR` or CalDAV collection (`calendar`)          | `TaskList` (`id`, `name`)                              | `List` (`id`, `name`, `sort_order`)            | `Project` + `Section`                               | `Project` (`id`, `name`)                     | `TaskList` (`id`, `title`)                  |
| **Task Entity**         | `VTODO` component                                      | Flat `Task` with properties                            | Split: `TaskSeries` (meta) + `Task` (instance) | Flat `Task` (`content`)                             | Flat `Task` + embedded checklist `items`     | Flat `Task`                                 |
| **Title Property**      | `SUMMARY`                                              | `title`                                                | `name` (on `TaskSeries`)                       | `content`                                           | `title`                                      | `title`                                     |
| **Description / Notes** | `DESCRIPTION` + `COMMENT`                              | `description` (Markdown/plain)                         | `notes` array (`id`, `title`, `text`)          | `description`                                       | `content` (notes) + `desc`                   | `notes` (max 8,192 chars)                   |
| **Status Model**        | `NEEDS-ACTION`, `IN-PROCESS`, `COMPLETED`, `CANCELLED` | `needs-action`, `in-process`, `completed`, `cancelled` | Implicit (`completed` timestamp / `deleted`)   | `is_completed` (boolean)                            | `status`: `0` (normal), `2` (done)           | `status`: `"needsAction"`, `"completed"`    |
| **Completion Time**     | `COMPLETED` (UTC date-time)                            | `completed` (UTC timestamp)                            | `completed` (ISO string)                       | None directly on task object (via sync API)         | `completedTime`                              | `completed` (RFC 3339)                      |
| **Due Date & Time**     | `DUE` (DATE or DATE-TIME with optional `TZID`)         | `due` (ISO 8601 with optional TZ)                      | `due` + `has_due_time` (0 or 1)                | `due`: `{ date, datetime, timezone, is_recurring }` | `dueDate` + `isAllDay` + `timeZone`          | `due` (RFC 3339 date only; time discarded)  |
| **Start / Do Date**     | `DTSTART` (and optional `DURATION`)                    | `start`                                                | None (due date only)                           | None native (duration supported)                    | `startDate` (Do-date / time-blocking)        | None                                        |
| **Priority Scale**      | `0` (Undefined), `1` (Highest) to `9` (Lowest)         | `1` (High) to `9` (Low), `0` = None                    | `1` (High), `2` (Med), `3` (Low), `"N"` (None) | `4` (P1/High), `3` (P2), `2` (P3), `1` (P4/None)    | `5` (High), `3` (Med), `1` (Low), `0` (None) | None                                        |
| **Subtask Support**     | `RELATED-TO;RELTYPE=PARENT` (`UID`)                    | `parentTask` / `subtasks`                              | Parent-child task relationship                 | `parent_id` hierarchy                               | Hybrid: `items` (checklists) & subtasks      | `parent` (single hierarchy depth)           |
| **Tags / Labels**       | `CATEGORIES` (comma-separated list)                    | `keywords` (map or set)                                | `tags` (array of strings)                      | `labels` (array of string names)                    | `tags` (array of strings)                    | None                                        |
| **Recurrence**          | `RRULE`, `RDATE`, `EXDATE`, `RECURRENCE-ID`            | `recurrenceRule` (iCalendar RRULE)                     | `rrule` string                                 | `due.string` / natural language rule                | `repeatFlag` (RRULE format)                  | None (hidden in web UI; not exposed in API) |
| **Reminders / Alarms**  | `VALARM` components (`TRIGGER`, `ACTION`, `SUMMARY`)   | `alerts` map (JSCalendar `Alert`)                      | Reminders array (time / offset / method)       | Reminders (via premium API)                         | Reminders array (`trigger`, `remindType`)    | None                                        |
| **Location**            | `LOCATION` (text) + `GEO` (lat/lon)                    | `locations` (Geo/string map)                           | `location_id` (relational)                     | None                                                | None (reminders have coordinates)            | None                                        |
| **URL**                 | `URL` property + `ATTACH` (URI/binary)                 | `links` map                                            | `url` string                                   | `url` string (links to Todoist web)                 | None                                         | `links` (read-only reference array)         |

---

## 2. Core Friction Points & Translation Decisions

When designing an interoperable schema across these six engines, ten major incompatibilities and friction points arise:

### 2.1. Priority Scale Inversion

- **RFC 5545 / JMAP**: Lower numbers mean higher priority (`1` = highest, `9` = lowest).
- **RTM**: `1` = High, `2` = Medium, `3` = Low, `0`/`"N"` = None.
- **Todoist**: `4` = Urgent/P1, `3` = High/P2, `2` = Medium/P3, `1` = None/P4.
- **TickTick**: `5` = High, `3` = Medium, `1` = Low, `0` = None.
- **Google Tasks**: Has no concept of priority.

**Resolution**: Adopt a 4-state normalized priority enum: `"high"`, `"medium"`, `"low"`, `"none"`, plus an optional `priority_num` field normalized to the RFC 5545 / JMAP standard scale (`1` = High, `5` = Med, `9` = Low).

### 2.2. Single Description vs. Multiple Notes

- Most systems (JMAP, Todoist, Google Tasks) support a single markdown/text `description`.
- **RTM** (and **TuDu**) support multiple distinct note records per task, each with its own creation date and title.

**Resolution**: Expose a top-level `description: string` for universal compatibility, while preserving a `notes: Note[]` array. Importers map `notes[0].content` $\rightarrow$ `description` if `description` is blank.

### 2.3. Checklist Items vs. Subtasks

- **Todoist, JMAP, Google Tasks, RTM**: Subtasks are full task objects referencing a `parent_id`.
- **TickTick**: Distinguishes between full subtasks and lightweight checklist `items` (`{ id, title, status }`).

**Resolution**: Represent subtasks primarily as full tasks with `parent_id`. Allow an optional `checklist: ChecklistItem[]` array for systems that distinguish lightweight checklist steps from full scheduled subtasks.

### 2.4. Date vs. DateTime Precision

- **Google Tasks**: Only records calendar dates (time is dropped to `00:00:00.000Z`).
- **RTM**: Stores dates and sets `has_due_time: 0` or `1`.
- **TickTick / Todoist**: Store ISO datetime and an `is_all_day` flag or separate `date` string.

**Resolution**: Store `due` as an ISO 8601 string (e.g. `2026-09-15` or `2026-09-15T14:30:00Z`), supplemented by `is_all_day: boolean` and `timezone: string`.

### 2.5. Task vs. TaskSeries

- **RTM** separates the definition (`TaskSeries`) from instances (`Task`).
- Every other system treats a recurring task as a single object with an RRULE.

**Resolution**: Flatten to single task objects containing an `rrule` string. When importing RTM JSON, collapse `TaskSeries` + child `Task` into single records.

### 2.6. Reminders and Alarms (`VALARM`)

- **iCalendar**: Specifies one or more child `VALARM` sub-components with a `TRIGGER` (relative duration such as `-PT15M` or absolute UTC date-time) and an `ACTION` (`DISPLAY`, `AUDIO`, `EMAIL`).
- **JMAP / JSCalendar**: Uses an `alerts` map indexed by alert ID with relative offsets.
- **RTM / TickTick / Todoist**: Support multiple alert triggers relative to the due date.
- **Google Tasks**: Has no native alarm or reminder model in its API.

**Resolution**: Introduce a first-class `reminders: Reminder[]` array in OpenTask where each item specifies an ISO 8601 duration offset (e.g. `-PT15M` for 15 minutes before, `-P1D` for 1 day before), a trigger target (`"due"` or `"start"`), and an action.

### 2.7. Recurrence Semantics: Series Expansion vs. Shift-on-Completion

- **iCalendar / CalDAV**: Uses the calendar event paradigm. An `RRULE` defines a theoretical infinite sequence of occurrences. Modifying or completing a single occurrence generates a detached `VTODO` with the same `UID` and a distinct `RECURRENCE-ID`. Cancelled occurrences use `EXDATE`.
- **Consumer Task Managers (RTM, TuDu, Todoist, TickTick)**: Follow a "shift-on-completion" paradigm. Only one physical task record exists. When completed, the engine marks the current instance complete (or logs history) and calculates the next `due` date based on the repeat rule, advancing the single record.

**Resolution**: OpenTask represents the canonical task with an `rrule` string. When exporting to iCalendar, export the master recurring `VTODO`. When importing `.ics` files with `RECURRENCE-ID` overrides, treat detached instances as independent tasks linked via `parent_id` or preserve them in `extra`.

### 2.8. Start Date, Duration, and Due Date Interactions

- **iCalendar**: A `VTODO` can define:
  1. Neither `DTSTART` nor `DUE` (an unscheduled task).
  2. `DUE` only (deadline task).
  3. `DTSTART` and `DUE` (scheduled window).
  4. `DTSTART` and `DURATION` (mutually exclusive with `DUE` in strict RFC 5545).
- **Consumer Task Managers**: Almost universally require a `due` date, with only a few (TickTick) supporting explicit `start` dates for calendar time-blocking.

**Resolution**: OpenTask supports `start`, `due`, and `duration` (ISO 8601 duration string like `PT1H30M`). If an iCalendar task uses `DTSTART` + `DURATION`, importers calculate `due = start + duration` for maximum compatibility with engines lacking duration support.

### 2.9. Floating vs. Local-Timezoned vs. UTC Dates

- **iCalendar (RFC 5545 §3.3.5)**: Strictly distinguishes between:
  1. **Date only**: `VALUE=DATE:20260910` (all-day event).
  2. **UTC date-time**: `20260910T143000Z` (absolute moment).
  3. **Local with TZID**: `TZID=America/New_York:20260910T103000` (anchored to a wall clock in a specific timezone).
  4. **Floating date-time**: `20260910T103000` (no `Z`, no `TZID`; represents 10:30 AM in whatever timezone the user currently happens to be in).
- **RTM**: Due dates can be floating (e.g. 9:00 AM anywhere) or fixed.
- **Google Tasks**: Only supports date (all-day).

**Resolution**: In OpenTask, `is_all_day: true` represents pure calendar dates (`YYYY-MM-DD`). For date-times, if `timezone` is provided (e.g. `"America/New_York"`), the time is interpreted in that zone. If `timezone` is `null` and the timestamp has no `Z` suffix, it represents a floating date-time. If it ends with `Z`, it represents an absolute UTC moment.

### 2.10. Percent Complete vs. Discrete Status

- **iCalendar**: Contains a `PERCENT-COMPLETE` property (integer `0` to `100`), independent of `STATUS`. A task can be `STATUS:IN-PROCESS` with `PERCENT-COMPLETE:50`.
- **JMAP / JSCalendar**: Supports `percentComplete: 0..100`.
- **TuDu / RTM / Todoist / TickTick**: Use discrete status states (incomplete vs complete, or 3-4 state enums) without fractional percentage tracking.

**Resolution**: Provide an optional `percent_complete: integer (0..100)` in OpenTask. When converting to binary systems: `percent_complete == 100` maps to `"completed"`; values `1..99` map to `"in_progress"`; `0` maps to `"needs_action"`.
---

## 3. The Unified "OpenTask" JSON Specification (`v1.0`)

The complete JSON Schema definition for an interoperable task interchange document is defined in [`opentask-v1.json`](./opentask-v1.json).

---

## 4. Bidirectional Mapping Matrix

### 4.1. Priority Translation Table

| OpenTask (`priority`) | iCalendar (RFC 5545) | JMAP (RFC 9670)  | RTM API / JSON | Todoist API v2 | TickTick | Google Tasks |
| :-------------------- | :------------------- | :--------------- | :------------- | :------------- | :------- | :----------- |
| **`"high"`**          | `1` (or 1–4)         | `1` (or 1–4)     | `1`            | `4`            | `5`      | _(None)_     |
| **`"medium"`**        | `5`                  | `5`              | `2`            | `3`            | `3`      | _(None)_     |
| **`"low"`**           | `9` (or 6–9)         | `9` (or 6–9)     | `3`            | `2`            | `1`      | _(None)_     |
| **`"none"`**          | `0` (or omitted)     | `0` (or omitted) | `0` or `"N"`   | `1`            | `0`      | _(None)_     |

### 4.2. Status Translation Table

| OpenTask (`status`)  | iCalendar (RFC 5545) | JMAP (RFC 9670)  | RTM               | Todoist               | TickTick    | Google Tasks    |
| :------------------- | :------------------- | :--------------- | :---------------- | :-------------------- | :---------- | :-------------- |
| **`"needs_action"`** | `"NEEDS-ACTION"`     | `"needs-action"` | `completed == ""` | `is_completed: false` | `status: 0` | `"needsAction"` |
| **`"in_progress"`**  | `"IN-PROCESS"`       | `"in-process"`   | `completed == ""` | `is_completed: false` | `status: 0` | `"needsAction"` |
| **`"completed"`**    | `"COMPLETED"`        | `"completed"`    | `completed != ""` | `is_completed: true`  | `status: 2` | `"completed"`   |
| **`"cancelled"`**    | `"CANCELLED"`        | `"cancelled"`    | `deleted != ""`   | _(deleted)_           | _(deleted)_ | `deleted: true` |

### 4.3. System-Specific Ingestion & Egress Rules

1. **Remember The Milk (RTM)**:
   - _Import_: Flatten RTM's `list.taskseries[]` structure. Copy `taskseries.name` $\rightarrow$ `title`, `taskseries.tags` $\rightarrow$ `tags`, `taskseries.notes` $\rightarrow$ `notes`. If `has_due_time == 0`, set `is_all_day = true`.
   - _Export_: Convert `notes` array to RTM note objects; map normalized priority back to `1`, `2`, `3`, or `0`.
2. **Todoist**:
   - _Import_: `content` $\rightarrow$ `title`, `description` $\rightarrow$ `description`. Parse `due.date` or `due.datetime`. Invert priority: $P_{\text{OpenTask}} = 5 - P_{\text{Todoist}}$ for non-default priorities.
   - _Export_: If `notes` exist, concatenate them into `description`.
3. **TickTick**:
   - _Import_: `content` $\rightarrow$ `description`. `items` array maps directly to `checklist`. Map `startDate` $\rightarrow$ `start`, `dueDate` $\rightarrow$ `due`.
   - _Export_: If subtasks have no children of their own, serialize as `items` checklist or full subtasks based on user preference.
4. **Google Tasks**:
   - _Import_: `notes` $\rightarrow$ `description`. `due` parsed as date with `is_all_day = true`. Hierarchy mapped via `parent` $\rightarrow$ `parent_id`.
   - _Export_: Set `due` date component only. Priority, tags, locations, and recurrence are stored in `extra` or appended to `notes` (e.g. `[Tags: work, urgent]`).
5. **JMAP for Tasks**:
   - _Import_: Almost 1:1 mapping with RFC 9670 Task objects.
   - _Export_: Direct conversion to JMAP `Task/set` operations.

6. **iCalendar / CalDAV (`.ics` / RFC 5545 / RFC 7986)**:
   - _Import_:
     - Parse `VCALENDAR` documents containing `VTODO` components.
     - Map `SUMMARY` $\rightarrow$ `title`, `DESCRIPTION` $\rightarrow$ `description`. If multiple `COMMENT` properties or `X-ALT-DESC` exist, extract them into `notes`.
     - Map `DUE` and `DTSTART` to ISO 8601 strings. If `VALUE=DATE` is specified, set `is_all_day = true`.
     - If `DTSTART` and `DURATION` exist without `DUE`, calculate `due = DTSTART + DURATION` and populate `duration`.
     - Map `STATUS` directly (`NEEDS-ACTION` $\rightarrow$ `"needs_action"`, `IN-PROCESS` $\rightarrow$ `"in_progress"`, `COMPLETED` $\rightarrow$ `"completed"`, `CANCELLED` $\rightarrow$ `"cancelled"`).
     - Map `PRIORITY` using RFC 5545 scale: 1–4 $\rightarrow$ `"high"`, 5 $\rightarrow$ `"medium"`, 6–9 $\rightarrow$ `"low"`, 0 $\rightarrow$ `"none"`. Preserve the raw numeric value in `priority_raw`.
     - Map `CATEGORIES` (comma-separated or multiple entries) $\rightarrow$ `tags`.
     - Map `RELATED-TO;RELTYPE=PARENT` $\rightarrow$ `parent_id`.
     - Map `VALARM` sub-components $\rightarrow$ `reminders` (converting trigger durations such as `-PT15M`).
     - Map `GEO` (latitude;longitude) $\rightarrow$ `geo`, `LOCATION` $\rightarrow$ `location`, `COLOR` $\rightarrow$ `color`.
     - Preserve `UID` in `uid` for idempotent round-trip synchronization.
   - _Export_:
     - Wrap tasks in a `BEGIN:VCALENDAR` ... `END:VCALENDAR` container with `PRODID:-//TuDu//OpenTask v1.0//EN` and `VERSION:2.0`.
     - Emit `BEGIN:VTODO` per task with `UID: <uid>` (generating a UUID if none exists).
     - Emit `SUMMARY:<title>` and `DESCRIPTION:<description>`. If `notes` array has multiple entries, concatenate them with horizontal dividers or serialize as `COMMENT` entries.
     - Emit `STATUS` and `PRIORITY` (normalized back to RFC 5545 integers: High $\rightarrow$ 1, Med $\rightarrow$ 5, Low $\rightarrow$ 9, None $\rightarrow$ 0).
     - Format `due`: If `is_all_day = true`, emit `DUE;VALUE=DATE:YYYYMMDD`. If date-time, emit UTC `DUE:YYYYMMDDTHHMMSSZ` or local with `TZID`.
     - If `parent_id` is set, look up parent's `uid` and emit `RELATED-TO;RELTYPE=PARENT:<parent-uid>`.
     - Serialize `reminders` into `BEGIN:VALARM ... END:VALARM` sub-components with `ACTION` and `TRIGGER`.
     - If `rrule` is present, emit `RRULE:<rrule>`.

---

## 5. Implementation Fit & Architectural Decisions for TuDu

TuDu’s local SQLite schema (`src-tauri/migrations/0001_initial_schema.sql`), Rust models (`src-tauri/src/models.rs`), and frontend interfaces (`src/models/index.ts`) are 100% aligned with this OpenTask v1.0 specification.

### Adopted Architectural Decisions

1. **Recurrence Engine: Shift-on-Completion (`rrule`)**:
   - TuDu follows RTM's clean single-record model: a recurring task has an RFC 5545 `rrule` string. When completed, the engine marks the task completed and generates/advances the `due` date for the next occurrence.
   - Detached instances from CalDAV imports (`RECURRENCE-ID`) are linked via `parent_id` or preserved in `extra`.

2. **Native Reminders Table**:
   - TuDu includes a dedicated `reminders` table in migration 0001 (`id`, `task_id`, `trigger`, `relative_to`, `action`, audit timestamps).
   - This directly bridges to iCalendar `VALARM` components and enables local desktop notifications and mobile push alerts.

3. **Unified Subtask Architecture**:
   - All subtasks and external checklist items (from TickTick, Google Tasks, etc.) are normalized into first-class tasks referencing `parent_id`.
   - Subtasks have full access to independent due dates, notes, priorities, and recurrence rules without maintaining a disjoint `checklist_items` table.

4. **Multi-Note Export to iCalendar (`.ics`)**:
   - When exporting TuDu tasks to standard `.ics` calendar files, all note records in `notes` are concatenated into the single iCalendar `DESCRIPTION` property with standard section dividers (`--- Note: <title> (<timestamp>) ---`), ensuring universal readability in Apple Calendar, Thunderbird, and Outlook.

5. **Floating Datetimes Supported**:
   - TuDu supports floating times (e.g. "9:00 AM anywhere") by storing ISO strings without timezone offsets and without a `Z` suffix (`timezone: null`), strictly following RFC 5545 §3.3.5 floating semantics.

6. **Standardized Column Naming (`rrule`)**:
   - The recurrence column in SQLite, Rust, and TypeScript is standardized as `rrule` (matching RFC 5545, CalDAV, and JMAP).
   - Ingestion APIs accept `repeats` as a backwards-compatible alias.

### Planned Interchange Commands

1. **OpenTask JSON Backup (`export_backup` / `import_backup`)**:
   - Dumps TuDu’s SQLite database into an `OpenTask v1.0` JSON file, ensuring total data portability with zero vendor lock-in.
2. **iCalendar Interop (`export_ical_backup` / `import_ical_file`)**:
   - Exports and imports standard `.ics` calendar files with `VTODO` components and `VALARM` reminder sub-components.
3. **RTM / Vendor Ingestion Adapters**:
   - Specialized parsers for RTM JSON (mapping `TaskSeries`), Todoist, TickTick, and Google Tasks.
