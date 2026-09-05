#!/usr/bin/env bash
# Machine-wide slot queue for the gate commands, for the Tulala multi-session repo.
#
# WHY THIS EXISTS. `tsc-queue.sh` capped typechecks at one and it worked: the
# lock held, and the only breaches came from checkouts old enough to predate it.
# But lint and every `test:*` lane ran UNTHROTTLED, so a machine with the tsc cap
# honoured still reached load 31.8 with nine gate processes across seven
# worktrees. Capping one lane of three is not a cap.
#
#   gate-queue.sh <lane> <cap> -- <command...>
#
# The cap is platform-wide: slots live in /tmp, so every checkout, worktree and
# session contends for the same N. `<lane>` names the slot family; lanes do not
# compete with each other, which is deliberate — a lint and a typecheck are
# different resources and serialising them against each other would idle the box.
#
# EVERY SEMANTIC BELOW WAS PAID FOR. Do not "simplify" one without reading why:
#
#  * NO AGE-BASED RECLAIM. A live run is never stale, however long it takes.
#    Stealing a live lock is invisible and self-amplifying; a lock held by a
#    wedged process is visible and a human can rm -rf it.
#  * RECLAIM ONLY ON A DEAD PID, via kill -0.
#  * THE WAIT LINE NAMES BOTH ENDS. A line naming only the blocker reads most
#    naturally as "this is me", so a reader blames the wrong session. And
#    basename is useless here: every checkout ends in "/web", so it prints
#    "web is WAITING FOR web". Name the parent directory.
#  * STUCK IS MEASURED IN CPU, NEVER IN ELAPSED TIME. On a contended box a
#    fourteen-minute typecheck at 60% of a core is HEALTHY, and any clock-based
#    reaper would kill it. If a tool or a person needs to judge a job stuck,
#    sample CPU accrual over ~20s and decide on that. Nothing in this script
#    kills on age, and nothing added to it should.
#  * SIGNALS ARE NOT RESULTS. Exit >128 is a signal (143 = SIGTERM). It is
#    neither a pass nor a failure and must never be reported as either.
set -uo pipefail

LANE="${1:?usage: gate-queue.sh <lane> <cap> -- <command...>}"
CAP="${2:?usage: gate-queue.sh <lane> <cap> -- <command...>}"
shift 2
[ "${1:-}" = "--" ] && shift
[ "$#" -gt 0 ] || { echo "gate-queue: no command given" >&2; exit 2; }

# CI has one job per runner and no neighbours to contend with. Queueing there
# would add a lock for nothing and could wedge a run behind a stale /tmp entry.
# `env` and not a bare exec: many lanes begin with a NODE_OPTIONS='...'
# assignment, which the shell strips when it runs the script directly but which
# arrives here as an ORDINARY ARGUMENT. `exec "$@"` then looks for a program
# literally named "NODE_OPTIONS=--require ./scripts/..." and exits 127. CI
# caught this on the first push; `env` applies leading NAME=VALUE pairs the way
# the shell would.
if [ -n "${CI:-}" ]; then exec env "$@"; fi

# Label a checkout by its PARENT directory, because every checkout ends in
# "/web" and basename alone prints "web is WAITING FOR web". But the parent can
# itself be uninformative ("/" when run from /tmp, "" at the root), which the
# first self-test of this script printed as "/ is WAITING FOR /" — the SAME
# defect this line exists to fix, reintroduced one level up. Fall back to the
# full path whenever the short label carries no information.
label_for() {
  local d="${1:-}" p
  [ -n "$d" ] || { echo "(unknown)"; return; }
  p="$(basename "$(dirname "$d")")"
  case "$p" in ""|"/"|"."|"web"|"tmp") echo "$d" ;; *) echo "$p" ;; esac
}
ME="$(label_for "$(pwd)")"
HELD=""
HB_PID=""

cleanup() {
  [ -n "$HB_PID" ] && kill "$HB_PID" 2>/dev/null
  [ -n "$HELD" ] && rm -rf "$HELD"
  # Only clear the claim if it is still OURS. A newer waiter from this checkout
  # may have overwritten it while displacing us; deleting it then would strand
  # that newer job with no claim of its own.
  if [ -n "${CLAIM:-}" ] && [ "$(cat "$CLAIM" 2>/dev/null)" = "$$" ]; then rm -f "$CLAIM"; fi
}
trap cleanup EXIT INT TERM

# ONE QUEUED JOB PER CHECKOUT — newer displaces older.
#
# Measured: one worktree had THREE tsc-queue waiters stacked under it, the
# oldest burning 60% of a core to typecheck a tree nobody would ever read the
# verdict of. Waiters are free to displace because a waiter has done NO work:
# it holds no slot and has produced no verdict, so replacing it loses nothing.
#
# THE SAFETY PROPERTY, and it is the whole design: this displaces WAITERS ONLY,
# never a holder. A process that has acquired a slot is mid-run; killing it
# would throw away real work and produce a signal exit that reads like neither
# a pass nor a failure. The claim file is removed the instant we acquire, so a
# holder is structurally unreachable from here.
CKEY=$(pwd | shasum | cut -c1-8)
CLAIM="/tmp/tulala-gate-${LANE}.waiting.${CKEY}"
if [ -f "$CLAIM" ]; then
  PREV=$(cat "$CLAIM" 2>/dev/null)
  if [ -n "$PREV" ] && [ "$PREV" != "$$" ] && kill -0 "$PREV" 2>/dev/null; then
    echo "gate-queue[$LANE]: displacing this checkout's older waiter (pid $PREV) — newer job wins" >&2
    kill "$PREV" 2>/dev/null
  fi
fi
echo "$$" > "$CLAIM"

WAITED=0
while [ -z "$HELD" ]; do
  slot=1
  while [ "$slot" -le "$CAP" ]; do
    L="/tmp/tulala-gate-${LANE}.${slot}.lock"
    if mkdir "$L" 2>/dev/null; then
      # Atomic: a racing reader must never see a half-written owner file.
      printf '%s %s %s\n' "$$" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(pwd)" > "$L/.owner.tmp"
      mv "$L/.owner.tmp" "$L/owner"
      HELD="$L"
      rm -f "$CLAIM"          # we are a HOLDER now, not a waiter: unreachable
      break
    fi
    # Occupied — reclaim only if its owner is genuinely gone.
    if [ -f "$L/owner" ]; then
      OWNER_PID=$(awk '{print $1}' "$L/owner" 2>/dev/null)
      if [ -n "$OWNER_PID" ] && ! kill -0 "$OWNER_PID" 2>/dev/null; then
        echo "gate-queue[$LANE]: slot $slot owner pid $OWNER_PID is dead, reclaiming" >&2
        rm -rf "$L"
        continue          # retry THIS slot, do not skip past it
      fi
    fi
    slot=$((slot + 1))
  done

  if [ -z "$HELD" ]; then
    if [ "$WAITED" = 0 ]; then
      BLOCKERS=""
      for i in $(seq 1 "$CAP"); do
        d=$(awk '{print $3}' "/tmp/tulala-gate-${LANE}.${i}.lock/owner" 2>/dev/null)
        [ -n "$d" ] && BLOCKERS="$BLOCKERS $(label_for "$d")"
      done
      echo "gate-queue[$LANE]: $ME is WAITING FOR${BLOCKERS:- (unknown)} — all $CAP slot(s) busy" >&2
      echo "gate-queue[$LANE]: a live run is never stale. If one is truly wedged: rm -rf /tmp/tulala-gate-${LANE}.*.lock" >&2
    fi
    sleep 10
    WAITED=$((WAITED + 10))
  fi
done

# Heartbeat: prove liveness to waiters for as long as we hold the slot.
( while :; do sleep 60; touch "$HELD/owner" 2>/dev/null || exit 0; done ) &
HB_PID=$!

[ "$WAITED" -gt 0 ] && echo "gate-queue[$LANE]: waited ${WAITED}s, starting" >&2

env "$@"          # `env`, not a bare call: see the CI note above — leading
CODE=$?           # NODE_OPTIONS=... arrives as an argument, not an assignment.

if [ "$CODE" -gt 128 ]; then
  echo "gate-queue[$LANE]: KILLED by signal $((CODE - 128)) (exit $CODE) — NOT A RESULT, run it again" >&2
fi
exit "$CODE"
