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
#      A .pre.sql that fails does NOT kill the run in --defer mode: the
#      migration is deferred like any other failure, because a pre-shim can
#      legitimately reference an object a later file creates. A .post.sql
#      failure is always fatal — the migration is already committed at that
#      point, so there is no clean state to defer back to.
#   5. Replacements: supabase/ci/migration-shims/<version>.replace.sql is
#      applied INSTEAD of the migration file, for the (rare) file that contains
#      a statement PostgreSQL rejects on every version, so no amount of
#      surrounding state can make it pass — see 20260409093000. A replacement
#      must reproduce what production actually holds and say so in its header:
#      it must open with "-- REPLACEMENT for <migration filename>", and the
#      runner refuses an undocumented substitute. Every use is printed as a
#      ::warning so it can never pass unnoticed. The ledger still records the
#      migration's own version, never the shim's. Prefer a pre/post shim.
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
# STATUS (2026-09-23): a full from-scratch replay SUCCEEDS — 859/859, exit 0,
# no baseline and no production credentials. See supabase/ci/README.md for the
# five shapes of blocker the shims handle and the rule for writing one.
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

# run_shim <shim file> -> 0 ran (or absent), 1 failed (error text in $TMP/err)
run_shim() {
  [ -f "$1" ] || return 0
  "${PSQL[@]}" -f "$1" >/dev/null 2> "$TMP/err"
}

# attempt <path> -> 0 applied, 1 failed (error text in $TMP/err)
attempt() {
  local path="$1" file version name src replace
  file="$(basename "$path")"; version="${file%%_*}"
  name="${file#*_}"; name="${name%.sql}"

  # A documented full substitute replaces the migration body, so it is also what
  # the enum pre-commit and the BEGIN/COMMIT strip below read. The header line
  # must name the file it stands in for, so a substitute can never be dropped in
  # silently, and every use is reported as a ::warning in the job summary.
  src="$path"
  replace="$SHIM_DIR/$version.replace.sql"
  if [ -f "$replace" ]; then
    if ! head -n 1 "$replace" | grep -qxF -e "-- REPLACEMENT for $file"; then
      echo "::error title=Undocumented substitute::$(basename "$replace") must start with '-- REPLACEMENT for $file' and explain why."
      exit 1
    fi
    src="$replace"
    replaced[$file]=1
    echo "substituting $file with $(basename "$replace")"
  fi

  grep -oiE "alter[[:space:]]+type[[:space:]]+[^;]*[[:space:]]add[[:space:]]+value[^;]*;" "$src" \
    | while IFS= read -r stmt; do psql -X -q -c "$stmt" >/dev/null 2>&1 || true; done

  # A failing .pre.sql defers the migration (see header note 4) rather than
  # ending the run; in strict mode the caller turns that into a hard failure.
  if ! run_shim "$SHIM_DIR/$version.pre.sql"; then
    echo "pre-shim for $version failed" >> "$TMP/err"
    return 1
  fi

  grep -viE '^[[:space:]]*(begin|commit)[[:space:]]*;[[:space:]]*$' "$src" > "$TMP/body.sql"
  if ! "${PSQL[@]}" -1 -f "$TMP/body.sql" > /dev/null 2> "$TMP/err"; then
    return 1
  fi
  # Fatal: the migration is committed, so there is nothing to defer back to.
  if ! run_shim "$SHIM_DIR/$version.post.sql"; then
    echo "::error title=Migration shim failed::$version.post.sql (after $file applied)"
    grep -v 'NOTICE' "$TMP/err" | tail -8
    exit 1
  fi
  # The ledger MUST record the file's own version — a wrong version here is
  # the production bug this runner exists to prevent — so a failure is fatal
  # rather than a migration silently counted as applied with no ledger row.
  # `version` is digits by construction (the filename glob), but `name` is
  # free text, so its quotes are doubled for the SQL literal. (psql does not
  # expand `:'var'` in a `-c` string, only in files/stdin.)
  local version_sql="${version//\'/\'\'}" name_sql="${name//\'/\'\'}"
  if ! "${PSQL[@]}" \
      -c "insert into supabase_migrations.schema_migrations (version, name)
          values ('$version_sql', '$name_sql') on conflict (version) do nothing;" >/dev/null 2> "$TMP/err"; then
    echo "::error title=Ledger insert failed::$file applied but could not be recorded"
    tail -5 "$TMP/err"
    exit 1
  fi
  echo "$file" >> "$LOG"
  return 0
}

pending=()
declare -A waits_for=()   # pending file -> object it failed on (relation/type)
declare -A replaced=()    # file -> 1 when a .replace.sql stood in for it

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
  # relation / type: the deferral can test these with to_regclass/to_regtype.
  local n
  n="$(grep -m1 -oE '(relation|type) "?[A-Za-z0-9_."]+"? does not exist' "$TMP/err" \
        | sed -E 's/^(relation|type) //; s/ does not exist$//; s/"//g')"
  if [ -n "$n" ]; then echo "$n"; return; fi
  # `column "c" of relation "t" does not exist` -> wait for t, then retry.
  grep -m1 -oE 'column "[^"]+" of relation "[^"]+" does not exist' "$TMP/err" \
    | sed -E 's/.*of relation "([^"]+)".*/\1/'
  # Anything else (missing function, failed assertion, duplicate object) gets
  # no watched object and is simply retried on every round.
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
# FAILURE_REPORT=<file> collects, for every migration that never applied, a
# `=== <file>` header followed by its FULL error text (WARNINGs included — some
# assertions name their offenders in WARNING lines and only summarise in the
# ERROR). Triage reads this file instead of scrolling the whole log.
REPORT="${FAILURE_REPORT:-}"
[ -n "$REPORT" ] && : > "$REPORT"
failed=0
# The final sweep LOOPS. A single pass judges each parked file against the
# state at the moment it is reached, and files that sort early are reached
# first — so a file parked on something a LATER-sorting parked file creates is
# marked "cannot apply" purely because it was tried too soon. (Measured:
# 20261007000000, 20261228000142, 20261229000360 and 20261229000367 all landed
# during the sweep, after the three files waiting on them had been judged.)
# Repeat while anything still applies; only a round with zero progress is a
# real verdict.
while [ "${#pending[@]}" -gt 0 ]; do
  progressed=0; still=()
  for p in "${pending[@]}"; do
    if attempt "$MIG_DIR/$p"; then
      echo "applied deferred $p (final sweep)"
      applied=$((applied + 1)); progressed=1
    else
      still+=("$p")
    fi
  done
  pending=("${still[@]+"${still[@]}"}")
  [ "$progressed" -eq 0 ] && break
done
for p in "${pending[@]+"${pending[@]}"}"; do
  attempt "$MIG_DIR/$p"   # one last run, only to capture the final error text
  failed=$((failed + 1))
  echo "::error title=Migration cannot apply::$p"
  grep -v 'NOTICE' "$TMP/err" | tail -8
  if [ -n "$REPORT" ]; then
    { echo "=== $p"; grep -v '^NOTICE' "$TMP/err"; echo; } >> "$REPORT"
  fi
done
if [ "${#replaced[@]}" -gt 0 ]; then
  for r in "${!replaced[@]}"; do
    echo "::warning title=Migration replaced::$r applied from migration-shims/${r%%_*}.replace.sql"
  done
fi
echo "Final: $applied applied, $failed could not apply, ${#replaced[@]} replaced, of $total on disk"
[ "$applied" -eq "$total" ]
