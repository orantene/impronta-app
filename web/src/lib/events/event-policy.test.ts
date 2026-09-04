import test from "node:test";
import assert from "node:assert/strict";

import {
  canHardDelete,
  canTransition,
  doorsAt,
  refundDecision,
  toEventSlug,
  type EventStatus,
} from "./event-policy";

test("slug survives accents, punctuation and a rename", () => {
  assert.equal(toEventSlug("Noche de Salsa"), "noche-de-salsa");
  assert.equal(toEventSlug("Domingo Acústico"), "domingo-acustico");
  assert.equal(toEventSlug("  Cena  Maridaje!!  "), "cena-maridaje");
  // A title of pure punctuation has no slug. Returning "" would collide with
  // every other such title on the tenant-unique index.
  assert.equal(toEventSlug("!!!"), null);
  assert.equal(toEventSlug(""), null);
  // Never a trailing hyphen, including after the 120-char truncation.
  const long = toEventSlug("a".repeat(118) + " bb");
  assert.ok(long);
  assert.ok(!long.endsWith("-"), "truncation must not leave a trailing hyphen");
});

test("cancelled is terminal, and nothing transitions to itself", () => {
  assert.equal(canTransition("draft", "published"), true);
  assert.equal(canTransition("published", "draft"), true);
  assert.equal(canTransition("draft", "cancelled"), true);
  assert.equal(canTransition("published", "cancelled"), true);
  // Un-cancelling would re-open sales on seats already refunded and given back.
  assert.equal(canTransition("cancelled", "published"), false);
  assert.equal(canTransition("cancelled", "draft"), false);
  for (const s of ["draft", "published", "cancelled"] as EventStatus[]) {
    assert.equal(canTransition(s, s), false, `${s} -> ${s} must be refused`);
  }
});

test("doors is subtraction on an instant, and needs no timezone", () => {
  const start = "2026-09-13T21:00:00.000Z";
  assert.equal(doorsAt(start, 30)?.toISOString(), "2026-09-13T20:30:00.000Z");
  assert.equal(doorsAt(start, 0)?.toISOString(), start);

  // THE POINT OF THE OFFSET. A show at 21:00 local on either side of a DST
  // boundary keeps doors exactly 30 minutes before the resolved instant. A
  // wall-clock doors time would need its own resolution and could disagree with
  // the session's -- which is how this platform ended up with two zone resolvers
  // holding opposite policies.
  const beforeDst = doorsAt("2027-03-27T20:00:00.000Z", 30);
  const afterDst = doorsAt("2027-03-28T19:00:00.000Z", 30);
  assert.equal(beforeDst?.toISOString(), "2027-03-27T19:30:00.000Z");
  assert.equal(afterDst?.toISOString(), "2027-03-28T18:30:00.000Z");

  // Refuses rather than guessing.
  assert.equal(doorsAt("not a date", 30), null);
  assert.equal(doorsAt(start, -5), null);
  assert.equal(doorsAt(start, Number.NaN), null);
});

test("refund returns a reason, and never answers when the policy is unknown", () => {
  const start = "2026-09-13T21:00:00.000Z";

  const early = refundDecision({
    sessionStartsAt: start,
    now: "2026-09-11T20:00:00.000Z",
    cutoffHours: 48,
  });
  assert.deepEqual(early, { refundable: true, reason: "within_window" });

  const late = refundDecision({
    sessionStartsAt: start,
    now: "2026-09-12T10:00:00.000Z",
    cutoffHours: 48,
  });
  assert.equal(late.refundable, false);
  assert.equal(late.reason, "cutoff_passed");

  // EXACTLY ON the cutoff does not refund: "full until 48h before" is a promise
  // about the window, and the instant it closes is outside it.
  const exact = refundDecision({
    sessionStartsAt: start,
    now: "2026-09-11T21:00:00.000Z",
    cutoffHours: 48,
  });
  assert.equal(exact.refundable, false);
  assert.equal(exact.reason, "cutoff_passed");

  // A NULL cutoff means the event inherits and the caller failed to resolve the
  // workspace default. It must be structurally distinct from "no refund", or a
  // customer is told the window closed when nobody ever set one.
  const unset = refundDecision({ sessionStartsAt: start, now: start, cutoffHours: null });
  assert.deepEqual(unset, { refundable: false, reason: "unknown_policy" });
  assert.notEqual(unset.reason, "cutoff_passed");

  // A cancelled show refunds even past the cutoff. The cutoff protects the venue
  // from a late change of mind by the buyer; it never entitled a venue to keep
  // the money for a night it decided not to hold.
  const cancelled = refundDecision({
    sessionStartsAt: start,
    now: "2026-09-13T20:00:00.000Z",
    cutoffHours: 48,
    eventCancelled: true,
  });
  assert.deepEqual(cancelled, { refundable: true, reason: "event_cancelled" });

  assert.equal(
    refundDecision({ sessionStartsAt: "nope", now: start, cutoffHours: 48 }).reason,
    "bad_input",
  );
});

test("only a draft with zero admissions may be hard-deleted", () => {
  assert.deepEqual(canHardDelete({ status: "draft", admissionCount: 0 }), { ok: true });
  assert.deepEqual(canHardDelete({ status: "draft", admissionCount: 1 }), {
    ok: false,
    reason: "has_admissions",
  });
  // A published or cancelled event is never deletable: deleting it would strand
  // its sessions at status='scheduled', which the anon policy on `sessions`
  // publishes -- a removed show's nights left on sale, belonging to nothing.
  assert.equal(canHardDelete({ status: "published", admissionCount: 0 }).ok, false);
  assert.equal(canHardDelete({ status: "cancelled", admissionCount: 0 }).ok, false);
});
