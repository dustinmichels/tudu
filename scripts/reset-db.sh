#!/usr/bin/env bash
# ==============================================================================
# scripts/reset-db.sh
# Dev script to totally reset the local TuDu database.
#
# Wipes local libSQL / SQLite database files (tudu.db, tudu.db-wal, tudu.db-shm)
# and re-applies migrations from src-tauri/migrations/ so the development
# environment starts completely clean.
# ==============================================================================

set -euo pipefail

# Text styling
BOLD="\033[1m"
GREEN="\033[32m"
YELLOW="\033[33m"
BLUE="\033[34m"
RED="\033[31m"
RESET="\033[0m"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATIONS_DIR="$PROJECT_ROOT/src-tauri/migrations"

# Defaults
CUSTOM_PATH=""
SKIP_MIGRATIONS=false
SEED_DATA=false
FORCE=false

print_usage() {
    echo -e "${BOLD}Usage:${RESET} $(basename "$0") [OPTIONS]"
    echo ""
    echo -e "${BOLD}Options:${RESET}"
    echo -e "  -s, --seed         Insert starter seed data (default Inbox list and sample tasks)"
    echo -e "  -n, --no-migrate   Wipe database files without applying schema migrations"
    echo -e "  -p, --path <PATH>  Target a custom database file path instead of default location"
    echo -e "  -f, --force        Force reset without prompts, even if TuDu is detected running"
    echo -e "  -h, --help         Display this help message"
    echo ""
    echo -e "${BOLD}Environment Variables:${RESET}"
    echo -e "  TUDU_DB_PATH       Override full path to tudu.db"
    echo -e "  TUDU_DB_DIR        Override directory containing tudu.db"
}

# Parse CLI arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        -s|--seed)
            SEED_DATA=true
            shift
            ;;
        -n|--no-migrate)
            SKIP_MIGRATIONS=true
            shift
            ;;
        -p|--path)
            if [[ -z "${2:-}" ]]; then
                echo -e "${RED}Error: --path requires a file path argument.${RESET}" >&2
                exit 1
            fi
            CUSTOM_PATH="$2"
            shift 2
            ;;
        -f|--force)
            FORCE=true
            shift
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${RESET}" >&2
            print_usage
            exit 1
            ;;
    esac
done

# Resolve database directory and file path
resolve_db_path() {
    if [[ -n "$CUSTOM_PATH" ]]; then
        echo "$CUSTOM_PATH"
        return
    fi

    if [[ -n "${TUDU_DB_PATH:-}" ]]; then
        echo "$TUDU_DB_PATH"
        return
    fi

    local db_dir="${TUDU_DB_DIR:-}"
    if [[ -z "$db_dir" ]]; then
        case "$(uname -s)" in
            Darwin*)
                db_dir="$HOME/Library/Application Support/com.tudu.app"
                ;;
            Linux*)
                db_dir="${XDG_DATA_HOME:-$HOME/.local/share}/com.tudu.app"
                ;;
            CYGWIN*|MINGW*|MSYS*)
                db_dir="${APPDATA:-$HOME/AppData/Roaming}/com.tudu.app"
                ;;
            *)
                db_dir="$HOME/Library/Application Support/com.tudu.app"
                ;;
        esac
    fi

    echo "$db_dir/tudu.db"
}

TARGET_DB_PATH="$(resolve_db_path)"
TARGET_DB_DIR="$(dirname "$TARGET_DB_PATH")"
DB_NAME="$(basename "$TARGET_DB_PATH")"

echo -e "${BOLD}${BLUE}==> TuDu Database Reset${RESET}"
echo -e "Target database: ${BOLD}$TARGET_DB_PATH${RESET}"
echo -e "Target directory: ${BOLD}$TARGET_DB_DIR${RESET}"
echo ""

# Check if application might be running
if pgrep -f "(target/debug/tudu|TuDu\.app|tauri dev)" >/dev/null 2>&1; then
    if [[ "$FORCE" = false ]]; then
        echo -e "${YELLOW}⚠️  Notice: The TuDu desktop application appears to be running.${RESET}"
        echo -e "${YELLOW}   Resetting while running may cause SQLite file locking conflicts.${RESET}"
        echo -e "${YELLOW}   Consider quitting TuDu before proceeding (or pass --force).${RESET}"
        echo ""
    fi
fi

# Locate and remove existing database files
echo -e "${BLUE}--> Removing existing database files...${RESET}"
REMOVED_COUNT=0

# Delete target db and WAL / SHM / lock files
for file in "$TARGET_DB_DIR/${DB_NAME}"*; do
    if [[ -e "$file" ]]; then
        echo "    Removing: $file"
        rm -rf "$file"
        REMOVED_COUNT=$((REMOVED_COUNT + 1))
    fi
done

# Also check for any rogue db files in workspace
for rogue in "$PROJECT_ROOT/src-tauri/${DB_NAME}"* "$PROJECT_ROOT/${DB_NAME}"*; do
    if [[ -e "$rogue" ]]; then
        echo "    Removing workspace remnant: $rogue"
        rm -rf "$rogue"
        REMOVED_COUNT=$((REMOVED_COUNT + 1))
    fi
done

if [[ $REMOVED_COUNT -eq 0 ]]; then
    echo "    No existing database files found."
else
    echo -e "    ${GREEN}Removed $REMOVED_COUNT file(s).${RESET}"
fi

# Ensure the target directory exists
mkdir -p "$TARGET_DB_DIR"

# Initialize schema and run migrations if requested
if [[ "$SKIP_MIGRATIONS" = true ]]; then
    echo ""
    echo -e "${YELLOW}--> Skipped migrations (--no-migrate).${RESET}"
    echo -e "    Tauri will initialize a fresh database when the app next launches."
elif ! command -v sqlite3 >/dev/null 2>&1; then
    echo ""
    echo -e "${YELLOW}⚠️  Notice: 'sqlite3' CLI tool was not found in your PATH.${RESET}"
    echo -e "   Database files have been wiped, but schema migrations cannot be applied directly via this script."
    echo ""
    echo -e "${BOLD}Installation options:${RESET}"
    echo -e "  • macOS:            brew install sqlite"
    echo -e "  • Ubuntu / Debian:  sudo apt-get install sqlite3"
    echo -e "  • Fedora / RHEL:    sudo dnf install sqlite"
    echo -e "  • Arch Linux:       sudo pacman -S sqlite"
    echo -e "  • Windows:          winget install SQLite.SQLite (or choco install sqlite)"
    echo ""
    echo -e "${BOLD}Automatic Fallback:${RESET}"
    echo -e "  TuDu's embedded Rust backend (libSQL/SQLite) automatically executes all pending migrations"
    echo -e "  on startup. Run ${BOLD}bun run dev:desktop${RESET} to launch TuDu and initialize the database."
    if [[ "$SEED_DATA" = true ]]; then
        echo ""
        echo -e "${YELLOW}   Note: Starter seed data (--seed) was skipped because sqlite3 is not available.${RESET}"
    fi
else
    echo ""
    echo -e "${BLUE}--> Applying migrations using sqlite3...${RESET}"

    # Setup WAL mode, foreign keys, and migrations tracking table
    sqlite3 "$TARGET_DB_PATH" >/dev/null << 'EOF'
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS _migrations (
    version INTEGER PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
EOF

    # Apply each migration in order
    if [[ -d "$MIGRATIONS_DIR" ]]; then
        for mig in "$MIGRATIONS_DIR"/*.sql; do
            if [[ -f "$mig" ]]; then
                mig_filename="$(basename "$mig")"
                mig_base="${mig_filename%.sql}"
                # Extract leading digits for migration version (e.g. 0001 -> 1)
                mig_version=$(echo "$mig_base" | sed -E 's/^0*([0-9]+).*/\1/')
                mig_name="$mig_base"

                echo "    Applying migration ${mig_version}: ${mig_name}"
                sqlite3 "$TARGET_DB_PATH" < "$mig"
                sqlite3 "$TARGET_DB_PATH" "INSERT INTO _migrations (version, name) VALUES (${mig_version}, '${mig_name}');"
            fi
        done
    else
        echo -e "${YELLOW}    Migrations directory not found at: $MIGRATIONS_DIR${RESET}"
    fi

    # Optional seed data
    if [[ "$SEED_DATA" = true ]]; then
        echo ""
        echo -e "${BLUE}--> Seeding initial development data...${RESET}"
        
        # UUID generator helper
        gen_uuid() {
            if command -v uuidgen >/dev/null 2>&1; then
                uuidgen | tr '[:upper:]' '[:lower:]'
            else
                python3 -c "import uuid; print(uuid.uuid4())"
            fi
        }

        INBOX_LIST_ID="$(gen_uuid)"
        WORK_LIST_ID="$(gen_uuid)"
        PERSONAL_LIST_ID="$(gen_uuid)"
        TASK_1_ID="$(gen_uuid)"
        TASK_2_ID="$(gen_uuid)"
        TASK_3_ID="$(gen_uuid)"
        TAG_1_ID="$(gen_uuid)"
        TAG_2_ID="$(gen_uuid)"
        NOTE_1_ID="$(gen_uuid)"
        NOW_ISO="$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"
        TOMORROW_ISO="$(date -u -v+1d +"%Y-%m-%dT12:00:00.000Z" 2>/dev/null || date -u -d "+1 day" +"%Y-%m-%dT12:00:00.000Z" 2>/dev/null || echo "$NOW_ISO")"

        sqlite3 "$TARGET_DB_PATH" << EOF
-- Lists
INSERT INTO lists (id, name, color, position, created_at, updated_at) VALUES
    ('$INBOX_LIST_ID', 'Inbox', '#4F46E5', 0, '$NOW_ISO', '$NOW_ISO'),
    ('$WORK_LIST_ID', 'Work', '#F59E0B', 1, '$NOW_ISO', '$NOW_ISO'),
    ('$PERSONAL_LIST_ID', 'Personal', '#10B981', 2, '$NOW_ISO', '$NOW_ISO');

-- Tags
INSERT INTO tags (id, name, color, created_at, updated_at) VALUES
    ('$TAG_1_ID', 'starter', '#6366F1', '$NOW_ISO', '$NOW_ISO'),
    ('$TAG_2_ID', 'priority', '#EF4444', '$NOW_ISO', '$NOW_ISO');

-- Tasks
INSERT INTO tasks (id, list_id, title, due, priority, completed, created_at, updated_at) VALUES
    ('$TASK_1_ID', '$INBOX_LIST_ID', 'Welcome to TuDu! 🚀', '$NOW_ISO', 1, 0, '$NOW_ISO', '$NOW_ISO'),
    ('$TASK_2_ID', '$INBOX_LIST_ID', 'Explore task filtering and keyboard shortcuts', '$TOMORROW_ISO', 2, 0, '$NOW_ISO', '$NOW_ISO'),
    ('$TASK_3_ID', '$PERSONAL_LIST_ID', 'Take a break and stretch', NULL, 3, 0, '$NOW_ISO', '$NOW_ISO');

-- Task Tags
INSERT INTO task_tags (task_id, tag_id, created_at, updated_at) VALUES
    ('$TASK_1_ID', '$TAG_1_ID', '$NOW_ISO', '$NOW_ISO'),
    ('$TASK_2_ID', '$TAG_2_ID', '$NOW_ISO', '$NOW_ISO');

-- Notes
INSERT INTO notes (id, task_id, title, content, created_at, updated_at) VALUES
    ('$NOTE_1_ID', '$TASK_1_ID', 'Getting Started', 'TuDu is a local-first task manager with embedded libSQL/SQLite storage.', '$NOW_ISO', '$NOW_ISO');
EOF
        echo "    Created 3 lists (Inbox, Work, Personal)"
        echo "    Created 2 tags (starter, priority)"
        echo "    Created 3 sample tasks with notes"
    fi

    # Verify tables
    REQUIRED_TABLES=("_migrations" "lists" "tasks" "tags" "task_tags" "notes")
    MISSING_TABLES=()
    for req_table in "${REQUIRED_TABLES[@]}"; do
        if ! sqlite3 "$TARGET_DB_PATH" "SELECT 1 FROM sqlite_master WHERE type='table' AND name='$req_table';" | grep -q 1; then
            MISSING_TABLES+=("$req_table")
        fi
    done

    if [[ ${#MISSING_TABLES[@]} -gt 0 ]]; then
        echo ""
        echo -e "${RED}❌ Migration verification failed! Missing expected table(s): ${MISSING_TABLES[*]}${RESET}" >&2
        exit 1
    fi

    MIGRATIONS_COUNT=$(sqlite3 "$TARGET_DB_PATH" "SELECT count(*) FROM _migrations;")
    TABLES=$(sqlite3 "$TARGET_DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name ASC;" | tr '\n' ' ')
    echo ""
    echo -e "${GREEN}✓ Schema initialized and verified successfully!${RESET}"
    echo -e "  Verified migrations: ${BOLD}$MIGRATIONS_COUNT applied${RESET}"
    echo -e "  Tables: ${BOLD}$TABLES${RESET}"
fi
echo ""
echo -e "${BOLD}${GREEN}==> Database reset complete!${RESET} (${TARGET_DB_PATH})"
