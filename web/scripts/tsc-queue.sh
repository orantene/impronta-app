#!/bin/bash
# Machine-wide serialiser for `tsc --noEmit`, for the Tulala multi-session repo.
#
# WHY: with 9+ sessions on one machine, concurrent full typechecks thrash each
# other. Observed: 30 at once across 6 checkouts, top process at 38% CPU and the
# rest in single digits, one branch waiting 58 minutes. Serialised they finish in
# minutes each. This does NOT weaken the gate: it runs the SAME full
# `tsc --noEmit` and exits with its real code.
#
# USE (from the web/ directory of your worktree):
#   bash <path-to>/tsc-queue.sh
#
# READING THE RESULT LATER (e.g. after backgrounding it): the verdict file is
# keyed by checkout. Use the path the script prints, or:
#   grep " $(pwd) " /tmp/tulala-tsc.log | tail -1
# NEVER read the result from a task notification's summary: that reports the
# WRAPPER's exit, not tsc's. And never read a bare /tmp/tulala-tsc.last - it is
# deleted on every run, because a machine-wide file gets clobbered by whichever
# worktree finished last.
#
# LOCK POLICY: a lock is reclaimed ONLY when its owner process is dead. There is
# no age-based reclaim of any kind, on purpose. An earlier version also
# reclaimed after 30 minutes, which inverted the tool exactly when it was
# needed: under real contention a run exceeds 30 minutes, its lock is stolen,
# runs re-parallelise, more runs exceed 30 minutes. A positive feedback loop
# into the state the queue exists to prevent. A heartbeat backstop was tried and
# rejected too: it robs a live owner whose heartbeat stalls, which is the same
# bug in a milder form. The heartbeat that remains is informational only, so a
# waiter can say how long ago the holder was seen.

# CI RUNS ALONE, SO IT MUST NOT QUEUE. On a GitHub runner there is exactly one
# job on the machine, /tmp is fresh, and there is nothing to serialise against.
# Taking a lock there buys nothing and adds a failure mode (a crashed run
# leaving a lock dir behind on a reused runner). Exec tsc directly and exit with
# its real code, which is byte-identical to what `npm run typecheck` did before
# this script became the default entry point.
if [ -n "${CI:-}" ]; then
  exec env NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=8192}" npx tsc --noEmit
fi

LOCK="/tmp/tulala-tsc.lock"
WAITED=0
HB_PID=""
KEY=$(pwd | shasum | cut -c1-8)
MINE="/tmp/tulala-tsc.${KEY}.last"

# Clear BEFORE the run, not only after it. A verdict from this checkout's
# previous run must not survive a run that gets killed, or the reader sees a
# real verdict for the right branch from the wrong commit. Kill the unkeyed
# path here too, so nobody can read a neighbour's verdict from the old name
# even if a stale copy of this script recreates it.
rm -f "$MINE" /tmp/tulala-tsc.last

cleanup() {
  [ -n "$HB_PID" ] && kill "$HB_PID" 2>/dev/null
  rm -rf "$LOCK"
}

while true; do
  if mkdir "$LOCK" 2>/dev/null; then
    # Write the owner file atomically: a racing reader must never see it half
    # written, so build it elsewhere and mv it in.
    printf '%s %s %s\n' "$$" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(pwd)" > "$LOCK/.owner.tmp"
    mv "$LOCK/.owner.tmp" "$LOCK/owner"
    break
  fi

  if [ -f "$LOCK/owner" ]; then
    OWNER_PID=$(awk '{print $1}' "$LOCK/owner" 2>/dev/null)
    OWNER_DIR=$(awk '{print $3}' "$LOCK/owner" 2>/dev/null)
    HB_AGE=$(( $(date +%s) - $(stat -f %m "$LOCK/owner" 2>/dev/null || date +%s) ))

    if ! kill -0 "$OWNER_PID" 2>/dev/null; then
      echo "tsc-queue: owner pid $OWNER_PID is dead, reclaiming" >&2
      rm -rf "$LOCK"; continue
    fi
    # DELIBERATELY NO AGE-BASED RECLAIM. A live typecheck is never stale, no
    # matter how long it takes. Stealing a live lock is invisible and
    # self-amplifying; a lock held forever by a wedged process is visible and a
    # human can rm -rf it. Testing an age backstop showed it robs a live owner
    # whose heartbeat stalls, which is the same bug in a milder form.
    if [ "$WAITED" = 0 ]; then
      # Name BOTH ends. The old line printed only the blocker's path, and its
      # most natural reading is "this is my cwd" — a reader takes the blocker
      # for the waiter and blames the wrong session. That cost a wrong
      # attribution the night this was changed. Same class as an exit code of
      # 143 read as a failure: a line whose obvious reading is the wrong one.
      # NOTE: basename alone is useless here — every checkout ends in "/web",
      # so it prints "web is WAITING FOR web". Name the CHECKOUT, which is the
      # parent directory. Found by running it rather than reading it.
      echo "tsc-queue: $(basename "$(dirname "$(pwd)")") is WAITING FOR $(basename "$(dirname "$OWNER_DIR")") (pid $OWNER_PID), last seen ${HB_AGE}s ago." >&2
      echo "tsc-queue: a live typecheck is never stale. If it is truly wedged: rm -rf $LOCK" >&2
    fi
  fi
  sleep 10
  WAITED=$((WAITED + 10))
done

trap cleanup EXIT INT TERM

# Heartbeat: prove liveness to waiters for as long as we hold the lock.
( while :; do sleep 60; touch "$LOCK/owner" 2>/dev/null || exit 0; done ) &
HB_PID=$!

[ "$WAITED" -gt 0 ] && echo "tsc-queue: waited ${WAITED}s, starting" >&2

# The heap bump is NOT optional on this repo: a bare `npx tsc --noEmit` aborts
# with SIGABRT (exit 134) partway through. `npm run build` and `npm run
# typecheck` both already set 8192; only ad-hoc invocations were left without
# it, and this script was one of them. Without this line the queue fails safe
# (it prints "NOT A RESULT") but can never complete a run here.
NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=8192}" npx tsc --noEmit
CODE=$?

# The verdict must be unmistakable. A backgrounded run whose harness reports
# "completed (exit code 0)" has told you about the WRAPPER, not about tsc: a
# pipeline's exit status is its LAST command, and everyone wraps tsc in
# something. An exit above 128 is a signal (143 = SIGTERM, someone killed it),
# which is neither a pass nor a type error and must never be read as either.
if [ "$CODE" -eq 0 ]; then
  VERDICT="TSC PASS (exit 0)"
elif [ "$CODE" -gt 128 ]; then
  VERDICT="TSC KILLED by signal $((CODE - 128)) (exit $CODE) - NOT A RESULT, run it again"
else
  VERDICT="TSC FAIL (exit $CODE)"
fi

printf '%s\n' "$VERDICT" >&2
printf '%s %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(pwd)" "$VERDICT" >> /tmp/tulala-tsc.log
printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$VERDICT" > "$MINE"
rm -f /tmp/tulala-tsc.last

echo "tsc-queue: read this run again with -> cat $MINE" >&2
exit $CODE
