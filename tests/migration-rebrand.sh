#!/bin/sh
# Exercise only the migration file operations, without touching a live router.
set -eu
ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
TEST_DIR=$(mktemp -d)
trap 'rm -rf "$TEST_DIR"' EXIT
# Source installer functions without running its final main command.
sed '$d' "$ROOT/install.sh" > "$TEST_DIR/functions.sh"
# shellcheck source=/dev/null
. "$TEST_DIR/functions.sh"
LOG="$TEST_DIR/log"
LEGACY_CONFIG="$TEST_DIR/forkop"
LEGACY_DATA="$TEST_DIR/old-data"
NEW_CONFIG="$TEST_DIR/nexroute"
NEW_DEFAULT_CONFIG="$TEST_DIR/default"
NEW_DATA="$TEST_DIR/new-data"
MIGRATION_PARENT="$TEST_DIR"
LEGACY_MIGRATE=1
# Stub the existing ucode migration call; only the copy and protection logic is tested here.
ucode() { printf '%s\n' "$*" > "$TEST_DIR/ucode-call"; }
printf '%s\n' "config settings 'settings'" " option config_version '2.0.0'" " option unmatched_dns_mode 'forkop'" > "$LEGACY_CONFIG"
mkdir "$LEGACY_DATA"
printf '%s\n' 'test state' > "$LEGACY_DATA/state"
printf '%s\n' 'default configuration' > "$NEW_DEFAULT_CONFIG"
backup_legacy
[ -f "$LEGACY_BACKUP/config" ]
cmp "$LEGACY_CONFIG" "$LEGACY_BACKUP/config"
[ "$(stat -c %a "$LEGACY_BACKUP")" = 700 ]
[ "$(stat -c %a "$LEGACY_BACKUP/config")" = 600 ]
# Existing user data must not be overwritten.
printf '%s\n' 'unrelated config' > "$NEW_CONFIG"
if restore_legacy; then exit 1; fi
[ ! -e "$NEW_DATA" ]
[ "$(cat "$NEW_CONFIG")" = 'unrelated config' ]
# Simulate the package installing its default configuration.
cp "$NEW_DEFAULT_CONFIG" "$NEW_CONFIG"
restore_legacy
cmp "$LEGACY_CONFIG" "$NEW_CONFIG"
cmp "$LEGACY_DATA/state" "$NEW_DATA/state"
[ -f "$TEST_DIR/ucode-call" ]
[ -f "$LEGACY_BACKUP/config" ]
# Re-running the transfer must not overwrite the already migrated config.
if restore_legacy; then exit 1; fi
if backup_legacy; then exit 1; fi
printf '%s\n' 'Migration copy and protection tests passed'
