#!/usr/bin/env bash
# Run targeted node tests in an agent worktree that has no node_modules.
#   test-in-worktree.sh <test files...>
#   test-in-worktree.sh --lane <name>      (e.g. size-ratchet -> package.json "test:size-ratchet")
# Symlinks the main checkout's web/node_modules in ONLY if missing, runs
# tsx --test with the server-only stub, forwards the real exit code, and always
# removes the symlink it created. Never touches a real node_modules directory.
# It only ever executes `tsx --test`; tsc, eslint, next build/dev and npm ci
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

[ "$#" -gt 0 ] || { echo "usage: $0 <test files...> | --lane <name>" >&2; exit 2; }

NODE_OPTIONS="--require $WEB/scripts/register-server-only-test.cjs ${NODE_OPTIONS:-}" npx --no-install tsx --test "$@"
RC=$?
exit "$RC"
