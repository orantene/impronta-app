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
TICKET=""
SLEEP_PID=""

cleanup() {
  [ -n "$SLEEP_PID" ] && kill "$SLEEP_PID" 2>/dev/null
  [ -n "$HB_PID" ] && kill "$HB_PID" 2>/dev/null
  [ -n "$TICKET" ] && rm -f "$TICKET"
  # Only a HOLDER removes a slot lock. $HELD is set solely on acquire, so a
  # waiter killed mid-wait cannot delete a live holder's slot — the bug the
  # tsc-queue port introduced and its test caught.
  [ -n "$HELD" ] && rm -rf "$HELD"
  # Only clear the claim if it is still OURS. A newer waiter from this checkout
  # may have overwritten it while displacing us; deleting it then would strand
  # that newer job with no claim of its own.
  if [ -n "${CLAIM:-}" ] && [ "$(cat "$CLAIM" 2>/dev/null)" = "$$" ]; then rm -f "$CLAIM"; fi
}
# EXIT cleans up; INT/TERM must also EXIT. A bash trap handler RESUMES the
# script, so a displaced waiter would tidy up and then carry on to take a slot.
# 143 = 128 + SIGTERM.
trap cleanup EXIT
trap 'cleanup; exit 143' INT TERM

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
# Defined BEFORE the displacement block below, which reads it: an earlier
# version declared it after, so displacement looked in an undefined directory
# and inheritance silently never happened. The newcomer went to the back of the
# queue while the code claimed it inherited — a fix that reported success and
# did nothing, caught only because its test asserted the ORDER rather than the
# absence of an error.
TICKETS="${GATE_QUEUE_TICKETS:-/tmp/tulala-gate-${LANE}.tickets}"
mkdir -p "$TICKETS"

CKEY=$(pwd | shasum | cut -c1-8)
CLAIM="/tmp/tulala-gate-${LANE}.waiting.${CKEY}"
if [ -f "$CLAIM" ]; then
  PREV=$(cat "$CLAIM" 2>/dev/null)
  if [ -n "$PREV" ] && [ "$PREV" != "$$" ] && kill -0 "$PREV" 2>/dev/null; then
    echo "gate-queue[$LANE]: displacing this checkout's older waiter (pid $PREV) — newer job wins" >&2
    # Decision 2: take over its queue position before killing it, so this
    # checkout keeps the place it has already been waiting for. Read the seq
    # from the ticket FILENAME rather than the claim, which carries only a pid.
    for _t in "$TICKETS"/*.$PREV; do
      [ -e "$_t" ] || continue
      INHERIT_SEQ="$(basename "$_t")"; INHERIT_SEQ="${INHERIT_SEQ%.$PREV}"
      rm -f "$_t"
      break
    done
    kill "$PREV" 2>/dev/null
  fi
fi
echo "$$" > "$CLAIM"

# ── FAIRNESS: a ticket, generalised to CAP slots ──────────────────────────────
#
# Same defect tsc-queue.sh had (fixed in #1861) and the same fix, with one
# change that matters. Acquire is a bare `mkdir` in a retry loop, so every
# waiter races on each release and the winner is whichever woke closest to it; a
# waiter that keeps losing waits for ever. Measured on tsc-queue: a checkout
# queued at 22:26 watched the lock pass to two checkouts that arrived AFTER it
# and was still waiting an hour later. Nothing fails — the machine just looks
# busy while one session never gets a turn.
#
# DECISION 1 — CAP, not 1. A waiter may attempt while its ticket is among the
# lowest CAP live tickets, NOT only when it is the single lowest. The
# single-lowest rule is the obvious port and it is wrong here: it would let one
# waiter at a time attempt a lane that is deliberately allowed CAP concurrent
# runs, quietly serialising it. A fairness fix that halves throughput is not a
# fix.
#
# DECISION 2 — a displaced waiter's successor INHERITS its ticket. When a newer
# job from this checkout displaces an older waiter, the newcomer takes over that
# waiter's ticket rather than joining the back of the queue. Displacement exists
# precisely so a checkout does not lose its turn to its own newer job; a fresh
# ticket would punish exactly the re-run the mechanism was built for, and a
# checkout that re-runs often would be sent to the back every time.

# Arrival order to microseconds. `date` on macOS has no sub-second format and
# this repo's bash is 3.2 (no EPOCHREALTIME); two jobs starting in the same
# second is the normal case, not the edge case.
new_seq() { perl -MTime::HiRes -e 'printf "%019.6f", Time::HiRes::time()' 2>/dev/null || date +%s; }

TICKET=""
if [ -n "${INHERIT_SEQ:-}" ]; then
  # Decision 2: step into the displaced waiter's place in the queue.
  TICKET="$TICKETS/$INHERIT_SEQ.$$"
  echo "gate-queue[$LANE]: inheriting the displaced waiter's queue position" >&2
else
  TICKET="$TICKETS/$(new_seq).$$"
fi
printf '%s\n' "$$" > "$TICKET"

# Is our ticket among the lowest CAP still held by a live process? Reaps dead
# tickets on the way past, on the same only-when-the-owner-is-dead rule the
# slot locks use. Nothing is reaped for being old: a live run is never stale.
holds_a_live_ticket() {
  _ahead=0
  for t in "$TICKETS"/*; do
    [ -e "$t" ] || continue
    [ "$t" = "$TICKET" ] && return 0
    _tp=$(cat "$t" 2>/dev/null)
    if [ -z "$_tp" ] || ! kill -0 "$_tp" 2>/dev/null; then rm -f "$t"; continue; fi
    _ahead=$((_ahead + 1))
    [ "$_ahead" -ge "$CAP" ] && return 1
  done
  return 0
}

WAITED=0
while [ -z "$HELD" ]; do
  slot=1
  # Fairness gate: do not even LOOK at the slots unless our ticket is among the
  # lowest CAP live ones. Without this the loop below is the mkdir race.
  holds_a_live_ticket || slot=$((CAP + 1))
  while [ "$slot" -le "$CAP" ]; do
    L="/tmp/tulala-gate-${LANE}.${slot}.lock"
    if mkdir "$L" 2>/dev/null; then
      # Atomic: a racing reader must never see a half-written owner file.
      printf '%s %s %s\n' "$$" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(pwd)" > "$L/.owner.tmp"
      mv "$L/.owner.tmp" "$L/owner"
      HELD="$L"
      rm -f "$TICKET"          # we hold a SLOT now; the ticket has done its job
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
    # `sleep 10 & wait $!`: on bash 3.2 a trap does not fire until the current
    # FOREGROUND command finishes, so a bare sleep swallows SIGTERM for up to
    # ten seconds — long enough for a displaced waiter to go on and take a slot
    # it no longer wants.
    sleep 10 &
    SLEEP_PID=$!
    wait "$SLEEP_PID" 2>/dev/null
    SLEEP_PID=""
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
