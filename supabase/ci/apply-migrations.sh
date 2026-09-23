#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# CI-only: replay EVERY file in supabase/migrations/ against an empty local
# Supabase database, skipping none.
#
# Why not let `supabase start` apply them? The production database was built
# incrementally: some files were pushed after files with LATER timestamps
# (`db push --include-all`), and a few only applied because production had
# been hand-repaired first. Those files must never be edited (they are applied
# in production), so this runner adds CI-only scaffolding around them:
#
#   1. Atomic attempts. Each file runs in ONE transaction (psql -1; the file's
#      own top-level `BEGIN;` / `COMMIT;` lines are dropped so they do not end
#      the wrapper early). A failed attempt leaves no partial state.
#   2. Enum pre-commit. `ALTER TYPE ... ADD VALUE` cannot be used later in the
#      same transaction ("unsafe use of new value"). Each file's single-line
#      ADD VALUE statements are run first in autocommit (errors ignored, e.g.
#      when the type is created by that same file); the file's own
#      ADD VALUE IF NOT EXISTS then becomes a no-op.
#   3. Deferral (--defer, full-history replay only). Files run in version
#      order. When one fails, it is parked and retried after every later file
#      that applies, so it lands right after the migration that provides what
#      it needs (several files were pushed after files with later stamps).
#      Every deferral is logged; a file still failing at the end fails the
#      run. Without --defer the first failure stops the run (strict mode, the
#      right mode for the post-baseline delta).
#   4. Per-migration shims: supabase/ci/migration-shims/<version>.pre.sql runs
#      before migration <version> (each attempt) and <version>.post.sql right
#      after it applies. Each shim documents the exact reason in its header.
#
# After each file applies, its version is recorded in
# supabase_migrations.schema_migrations so the CLI sees the chain as applied.
#
# Usage: apply-migrations.sh [--after <version>] [--defer]
#   --after <version>  only apply migrations whose version is greater (used
#                      after loading supabase/e2e-baseline.sql)
#   --defer            enable deferral (3) for a full from-scratch replay
#
# Connection: standard libpq env vars (PGHOST, PGPORT, PGUSER, PGPASSWORD,
# PGDATABASE). Optional: MIGRATION_LOG=<file> receives the apply order.
#
# STATUS (2026-09-23): a full from-scratch replay CANNOT succeed. See
# supabase/ci/README.md for the blockers and the baseline fallback.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

AFTER=""
DEFER=0
while [ $# -gt 0 ]; do
  case "$1" in
    --after) AFTER="$2"; shift 2 ;;
    --defer) DEFER=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIG_DIR="$ROOT/supabase/migrations"
SHIM_DIR="$ROOT/supabase/ci/migration-shims"
LOG="${MIGRATION_LOG:-/dev/null}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1)
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

"${PSQL[@]}" -c "create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (
    version text primary key, statements text[], name text);" >/dev/null || exit 1

run_shim() { # $1 = shim file
  [ -f "$1" ] || return 0
  if ! "${PSQL[@]}" -f "$1" >/dev/null; then
    echo "::error title=Migration shim failed::$(basename "$1")"
    exit 1
  fi
}

# attempt <path> -> 0 applied, 1 failed (error text in $TMP/err)
attempt() {
  local path="$1" file version name
  file="$(basename "$path")"; version="${file%%_*}"
  name="${file#*_}"; name="${name%.sql}"

  grep -oiE "alter[[:space:]]+type[[:space:]]+[^;]*[[:space:]]add[[:space:]]+value[^;]*;" "$path" \
    | while IFS= read -r stmt; do psql -X -q -c "$stmt" >/dev/null 2>&1 || true; done

  run_shim "$SHIM_DIR/$version.pre.sql"

  grep -viE '^[[:space:]]*(begin|commit)[[:space:]]*;[[:space:]]*$' "$path" > "$TMP/body.sql"
  if ! "${PSQL[@]}" -1 -f "$TMP/body.sql" > /dev/null 2> "$TMP/err"; then
    return 1
  fi
  run_shim "$SHIM_DIR/$version.post.sql"
  "${PSQL[@]}" -c "insert into supabase_migrations.schema_migrations (version, name)
    values ('$version', '$name') on conflict (version) do nothing;" >/dev/null
  echo "$file" >> "$LOG"
  return 0
}

pending=()
declare -A waits_for=()   # pending file -> object it failed on (relation/type)

# Which of the objects pending files wait for exist now? One query per round.
ready_objects() {
  local names="" f
  for f in "${pending[@]}"; do
    [ -n "${waits_for[$f]:-}" ] && names+="${waits_for[$f]}"$'\n'
  done
  [ -z "$names" ] && return 0
  printf '%s' "$names" | sort -u | while IFS= read -r n; do
    printf "select '%s' where to_regclass('%s') is not null or to_regtype('%s') is not null;\n" "$n" "$n" "$n"
  done | psql -X -q -At 2>/dev/null
}

retry_pending() { # $1 = label of the migration that just applied
  local progress=1 still p ready
  while [ "$progress" -eq 1 ] && [ "${#pending[@]}" -gt 0 ]; do
    progress=0; still=()
    ready="$(ready_objects)"
    for p in "${pending[@]}"; do
      if [ -n "${waits_for[$p]:-}" ] && ! grep -qxF "${waits_for[$p]}" <<< "$ready"; then
        still+=("$p"); continue
      fi
      if attempt "$MIG_DIR/$p"; then
        echo "applied deferred $p (after $1)"
        applied=$((applied + 1)); progress=1; unset "waits_for[$p]"
      else
        waits_for[$p]="$(missing_object)"
        still+=("$p")
      fi
    done
    pending=("${still[@]+"${still[@]}"}")
  done
}

# From the last error: the relation/type that does not exist yet, if that is
# why the attempt failed (quoted name, schema-qualified when the error was).
missing_object() {
  grep -m1 -oE '(relation|type) "?[A-Za-z0-9_."]+"? does not exist' "$TMP/err" \
    | sed -E 's/^(relation|type) //; s/ does not exist$//; s/"//g'
}

total=0; applied=0; deferrals=0
start=$(date +%s)
for path in $(find "$MIG_DIR" -maxdepth 1 -type f -name '[0-9]*_*.sql' | sort); do
  file="$(basename "$path")"
  if [ -n "$AFTER" ] && [[ ! "${file%%_*}" > "$AFTER" ]]; then continue; fi
  total=$((total + 1))
  if attempt "$path"; then
    applied=$((applied + 1))
    [ "${#pending[@]}" -gt 0 ] && retry_pending "$file"
  elif [ "$DEFER" -eq 0 ]; then
    grep -v 'NOTICE' "$TMP/err" | tail -20
    echo "::error title=Migration failed::$file ($applied of $total applied before it)"
    exit 1
  else
    deferrals=$((deferrals + 1))
    waits_for[$file]="$(missing_object)"
    echo "deferred $file: $(grep -m1 'ERROR' "$TMP/err" | sed 's/^psql:[^ ]* //')"
    pending+=("$file")
  fi
done

echo "Applied $applied of $total migrations in $(( $(date +%s) - start ))s ($deferrals deferrals)"
if [ "${#pending[@]}" -gt 0 ]; then
  for p in "${pending[@]}"; do
    attempt "$MIG_DIR/$p" && { applied=$((applied + 1)); continue; }
    echo "::error title=Migration cannot apply::$p"
    grep -v 'NOTICE' "$TMP/err" | tail -8
  done
fi
[ "$applied" -eq "$total" ]
