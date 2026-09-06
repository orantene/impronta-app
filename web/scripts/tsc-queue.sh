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
# FAIRNESS: waiters take a TICKET on arrival and may attempt the lock only when
# they hold the lowest live one. Without this the acquire is a bare `mkdir` in a
# retry loop, so every waiter races on each release and the winner is whichever
# happened to wake closest to it. A waiter that keeps losing that race waits
# forever while newer arrivals go first — observed 2026-09-05: one checkout
# queued at 22:26 watched the lock pass to two checkouts that arrived after it,
# and was still waiting an hour later. Serialising without fairness only trades
# starvation-by-thrashing for starvation-by-livelock, which is quieter: the
# machine looks busy and healthy while one session never gets a turn.
#
# A ticket is reaped on exactly the same rule as a lock: only when its owner
# process is dead. Nothing is reaped for being old, for the reasons below.
#
# THE PROPERTY, IN WORDS, because the test that proves it is NOT a merge gate.
# `npm run manual:tsc-queue-fairness` exercises it by spawning real queues; it
# passes on macOS and hangs on the Linux CI runner for a reason nobody has
# pinned, so it was moved off the structural lane rather than left to redden
# main for every team. A timing-dependent process test does not belong on a gate
# every merge waits behind. What it checks, if you change this file:
#
#   1. Turns are granted in ARRIVAL order. Two waiters that arrive in a known
#      order must acquire in that order — not whichever wakes closest to the
#      release.
#   2. A ticket does not outlive its process. A waiter killed mid-wait leaves no
#      ticket, or later arrivals queue behind a position nobody stands in.
#   3. A waiter never removes a lock it does not own. Cleanup runs on TERM for
#      waiters too, so without the ownership check it deletes the LIVE HOLDER's
#      lock.
#   4. Exit 127 reports DID NOT RUN, never TSC FAIL.
#
# Run it by hand after touching the acquire loop, the trap, or cleanup.
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

# Overridable ONLY so the fairness test can drive real locking on its own paths.
# A test that shares the machine-wide lock either races live work or skips, and
# a skipped test proves nothing. Unset in normal use; the defaults are the real
# machine-wide paths, unchanged.
LOCK="${TSC_QUEUE_LOCK:-/tmp/tulala-tsc.lock}"
TICKETS="${TSC_QUEUE_TICKETS:-/tmp/tulala-tsc.tickets}"
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

# Arrival order, to microseconds. `date` on macOS has no sub-second format and
# this repo's bash is 3.2 (no EPOCHREALTIME), so perl is the portable source.
# Second granularity is not enough: two sessions starting a gate in the same
# second is the normal case, not the edge case.
mkdir -p "$TICKETS"
SEQ=$(perl -MTime::HiRes -e 'printf "%019.6f", Time::HiRes::time()' 2>/dev/null || date +%s)
TICKET="$TICKETS/$SEQ.$$"
printf '%s\n' "$$" > "$TICKET"

# The trap is armed BEFORE the acquire loop so a waiter killed while waiting
# still drops its ticket. That makes the ownership check mandatory: without it a
# waiter's cleanup would `rm -rf` the LIVE HOLDER's lock on its way out — silent
# lock theft, and precisely what the policy note above refuses to do. Found by
# the fairness test, which killed a waiter and watched the holder's turn vanish.
HELD_LOCK=""
SLEEP_PID=""
cleanup() {
  [ -n "$SLEEP_PID" ] && kill "$SLEEP_PID" 2>/dev/null
  [ -n "$HB_PID" ] && kill "$HB_PID" 2>/dev/null
  rm -f "$TICKET"
  [ -n "$HELD_LOCK" ] && rm -rf "$LOCK"
  return 0
}
# Drop the ticket on ANY exit, including a kill while still waiting. A ticket
# outliving its process would block every later arrival behind a queue position
# nobody is standing in.
# EXIT cleans up; INT/TERM must also EXIT. A bash trap handler runs and then
# RESUMES the script, so a waiter sent SIGTERM would tidy up and then carry on
# to take a turn nobody wants any more. 143 = 128 + SIGTERM, which this script's
# own verdict logic already reports as "killed, NOT A RESULT".
trap cleanup EXIT
trap 'cleanup; exit 143' INT TERM

# Is our ticket the lowest one still held by a live process? Reaps dead tickets
# on the way past, on the same only-when-the-owner-is-dead rule as the lock.
holds_lowest_ticket() {
  for t in "$TICKETS"/*; do
    [ -e "$t" ] || continue
    [ "$t" = "$TICKET" ] && return 0     # sorted order: nothing live ahead of us
    tp=$(cat "$t" 2>/dev/null)
    if [ -z "$tp" ] || ! kill -0 "$tp" 2>/dev/null; then
      rm -f "$t"
      continue
    fi
    return 1
  done
  return 0
}

while true; do
  if holds_lowest_ticket && mkdir "$LOCK" 2>/dev/null; then
    # Write the owner file atomically: a racing reader must never see it half
    # written, so build it elsewhere and mv it in.
    printf '%s %s %s\n' "$$" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(pwd)" > "$LOCK/.owner.tmp"
    mv "$LOCK/.owner.tmp" "$LOCK/owner"
    HELD_LOCK=1
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
      AHEAD=0
      for t in "$TICKETS"/*; do
        [ -e "$t" ] || continue
        [ "$t" = "$TICKET" ] && break
        AHEAD=$((AHEAD + 1))
      done
      echo "tsc-queue: queue position $((AHEAD + 1)); runs start in arrival order." >&2
      echo "tsc-queue: a live typecheck is never stale. If it is truly wedged: rm -rf $LOCK" >&2
    fi
  fi
  # `sleep 10 & wait $!` rather than a bare `sleep 10`. This repo's bash is 3.2,
  # where a trap does not fire until the current FOREGROUND command finishes, so
  # a SIGTERM to a waiter sat in a bare sleep is swallowed for up to ten seconds
  # — long enough that a killed waiter goes on to take a turn it no longer wants
  # and to leave its ticket standing. `wait` returns immediately on a signal, so
  # the cleanup runs when it is sent. Found by a test that killed a waiter and
  # watched it acquire the lock anyway.
  sleep 10 &
  SLEEP_PID=$!
  wait "$SLEEP_PID" 2>/dev/null
  SLEEP_PID=""
  WAITED=$((WAITED + 10))
done

# Heartbeat: prove liveness to waiters for as long as we hold the lock.
( while :; do sleep 60; touch "$LOCK/owner" 2>/dev/null || exit 0; done ) &
HB_PID=$!

[ "$WAITED" -gt 0 ] && echo "tsc-queue: waited ${WAITED}s, starting" >&2

# The heap bump is NOT optional on this repo: a bare `npx tsc --noEmit` aborts
# with SIGABRT (exit 134) partway through. `npm run build` and `npm run
# typecheck` both already set 8192; only ad-hoc invocations were left without
# it, and this script was one of them. Without this line the queue fails safe
# (it prints "NOT A RESULT") but can never complete a run here.
# TSC_QUEUE_CMD exists so the ordering test can drive the QUEUE without running
# four real typechecks. It is never set in normal use; the default below is the
# real gate, unchanged.
if [ -n "${TSC_QUEUE_CMD:-}" ]; then
  sh -c "$TSC_QUEUE_CMD"
else
  NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=8192}" npx tsc --noEmit
fi
CODE=$?

# The verdict must be unmistakable. A backgrounded run whose harness reports
# "completed (exit code 0)" has told you about the WRAPPER, not about tsc: a
# pipeline's exit status is its LAST command, and everyone wraps tsc in
# something. An exit above 128 is a signal (143 = SIGTERM, someone killed it),
# which is neither a pass nor a type error and must never be read as either.
#
# 127 gets the same treatment for the same reason. It is "command not found" —
# on this repo, almost always `tsx: No such file or directory` in a worktree
# with no node_modules. Nothing was typechecked. In a CI log a red 127 reads
# exactly like a failing gate, and the natural response is to go looking for the
# type error that does not exist. Say what it is where the verdict is printed,
# rather than leaving the reader to know it.
if [ "$CODE" -eq 0 ]; then
  VERDICT="TSC PASS (exit 0)"
elif [ "$CODE" -gt 128 ]; then
  VERDICT="TSC KILLED by signal $((CODE - 128)) (exit $CODE) - NOT A RESULT, run it again"
elif [ "$CODE" -eq 127 ]; then
  VERDICT="TSC DID NOT RUN (exit 127 = command not found; usually no node_modules in this checkout - try npm ci) - NOT A RESULT"
else
  VERDICT="TSC FAIL (exit $CODE)"
fi

printf '%s\n' "$VERDICT" >&2
printf '%s %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(pwd)" "$VERDICT" >> /tmp/tulala-tsc.log
printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$VERDICT" > "$MINE"
rm -f /tmp/tulala-tsc.last

echo "tsc-queue: read this run again with -> cat $MINE" >&2
exit $CODE
