#!/usr/bin/env bash
# Run targeted node tests in an agent worktree that has no node_modules.
#   test-in-worktree.sh <test files...>
#   test-in-worktree.sh --lane <name>      (e.g. size-ratchet -> package.json "test:size-ratchet")
# Symlinks the main checkout's web/node_modules in ONLY if missing, runs
# tsx --test with the server-only stub, forwards the real exit code, and always
# removes the symlink it created. Never touches a real node_modules directory.
# It only ever executes `tsx --test` (through scripts/lane-test.cjs); tsc, eslint, next build/dev and npm ci
# requests are refused (exit 2): local gates are CI's job.
set -u

# Refusal check. Echoes a reason and returns 1 when an argument looks like a
# typecheck / lint / build / install request or any unknown option.
check_args() {
  local a prev=""
  for a in "$@"; do
    case "$a" in
      tsc|eslint|next|npm|npx|ci|build|dev|lint|typecheck|*--noEmit*|*"next build"*|*"next dev"*|*"npm ci"*|*"npm install"*|*eslint*|*/tsc|*/next)
        echo "test-in-worktree: refused '$a'. Local gates are CI's job: no tsc, no eslint, no next build/dev, no npm ci. This helper only runs tsx --test on test files or --lane <name>." >&2
        return 1 ;;
      -*)
        if [ "$a" != "--lane" ]; then
          echo "test-in-worktree: refused option '$a'. Local gates are CI's job: no tsc, no eslint, no next build/dev, no npm ci." >&2
          return 1
        fi ;;
    esac
    prev="$a"
  done
  return 0
}

check_args "$@" || exit 2
[ "${TEST_IN_WT_CHECK_ONLY:-}" = 1 ] && exit 0

WEB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$WEB" || exit 2

LANE=""
if [ "${1:-}" = "--lane" ]; then
  LANE="${2:-}"
  [ -n "$LANE" ] || { echo "usage: $0 --lane <name>" >&2; exit 2; }
  shift 2
fi

CREATED=0
cleanup() { [ "$CREATED" = 1 ] && rm -f "$WEB/node_modules"; }
trap cleanup EXIT
trap 'exit 130' INT TERM

if [ -L node_modules ] && [ ! -e node_modules ]; then
  echo "test-in-worktree: dangling node_modules symlink at $WEB/node_modules; remove it" >&2; exit 2
elif [ -d node_modules ] && [ ! -L node_modules ]; then
  echo "test-in-worktree: node_modules is a real directory; using it untouched" >&2
elif [ ! -e node_modules ]; then
  COMMON="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || { echo "not in a git repo" >&2; exit 2; }
  SRC="$(dirname "$COMMON")/web/node_modules"
  [ -d "$SRC" ] || { echo "test-in-worktree: main checkout has no $SRC" >&2; exit 2; }
  ln -s "$SRC" node_modules && CREATED=1
fi

if [ -n "$LANE" ]; then
  ARGS="$(LANE="$LANE" node -e '
    const s = require("./package.json").scripts["test:" + process.env.LANE];
    if (!s) { console.error("no lane test:" + process.env.LANE); process.exit(3); }
    const m = s.match(/(?:tsx --test|lane-test\.cjs)\s+(.*)$/);
    if (!m) { console.error("lane test:" + process.env.LANE + " is not a tsx --test lane"); process.exit(3); }
    process.stdout.write(m[1]);
  ')" || exit 2
  eval "set -- $ARGS"
fi

# Lane files: `lane-test.cjs @scripts/lanes/<x>.txt` passes a list file. Do NOT expand
# it here: the final run goes through scripts/lane-test.cjs, which expands the list,
# resolves every argument against the filesystem in the form THIS Node accepts
# (brackets are glob classes on Node 22 and `?` is a failed path on Node 20; see
# scripts/lane-paths.cjs), applies the quarantine, and FAILS on a zero-match argument
# or a run of zero tests. Handing tsx the raw list line by line is what made
# `test:wt -- --lane money` die on the [tenantSlug] paths (TUL-1754).

[ "$#" -gt 0 ] || { echo "usage: $0 <test files...> | --lane <name>" >&2; exit 2; }

# Dry run: resolve and count the files, run nothing, take no lock (guard tests use this).
if [ "${LANE_TEST_DRY_RUN:-}" = 1 ]; then
  NODE_OPTIONS="--require $WEB/scripts/register-server-only-test.cjs ${NODE_OPTIONS:-}" exec node scripts/lane-test.cjs "$@"
fi

# ── One test run per MACHINE (Oct 15: 4-5 lanes ran suites at once, load 55-65,
# swap full, the Mac crashed). mkdir is atomic: the first caller gets the lock,
# everyone else waits and is told who holds it. A lock whose holder process is
# gone is stale and is removed. The lock is released on any exit.
LOCK="${TULALA_TEST_LOCK:-$HOME/.tulala-test.lock}"
HAVE_LOCK=0
release_lock() { [ "$HAVE_LOCK" = 1 ] && rm -rf "$LOCK"; }
trap 'cleanup; release_lock' EXIT
waited=0
while ! mkdir "$LOCK" 2>/dev/null; do
  holder_pid="$(cat "$LOCK/pid" 2>/dev/null || true)"
  if [ -n "$holder_pid" ] && ! kill -0 "$holder_pid" 2>/dev/null; then
    echo "test-in-worktree: removing stale lock (pid $holder_pid is gone)" >&2
    rm -rf "$LOCK"; continue
  fi
  if [ $((waited % 30)) -eq 0 ]; then
    echo "test-in-worktree: waiting for the machine test lock, held by: $(cat "$LOCK/owner" 2>/dev/null || echo unknown)" >&2
  fi
  sleep 5; waited=$((waited + 5))
done
HAVE_LOCK=1
echo "$$" > "$LOCK/pid"
echo "pid $$ · $(basename "$(dirname "$WEB")") · since $(date '+%H:%M:%S')" > "$LOCK/owner"

# Do not start while the machine is already overloaded (5-min load > 12).
while :; do
  load5="$(sysctl -n vm.loadavg 2>/dev/null | awk '{print $3}')"
  [ -z "$load5" ] && load5="$(uptime | awk -F'load averages?: ' '{print $2}' | awk '{print $2}' | tr -d ,)"
  awk -v l="${load5:-0}" 'BEGIN{exit !(l > 12)}' || break
  echo "test-in-worktree: 5-min load is $load5 (> 12); waiting before starting tests" >&2
  sleep 30
done

# One test file at a time inside this run, too.
NODE_OPTIONS="--require $WEB/scripts/register-server-only-test.cjs ${NODE_OPTIONS:-}" node scripts/lane-test.cjs --test-concurrency=1 "$@"
RC=$?
exit "$RC"
