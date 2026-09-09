/**
 * UNIT TEST — door.ts.
 *
 * Runs in `test:sessions` (glob lane). Note what a pass here means: `tsx --test`
 * executes, it does not typecheck. A green lane is not a green branch.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  doorAdmits,
  doorOutcomeForCheckIn,
  doorOutcomeForSessionScope,
  doorOutcomeForToken,
} from "./door";

// ── The signature layer, which refuses without a round trip ────────────────

test("an unsigned door is OUR problem, never rendered as the holder's", () => {
  // A missing secret must not fall back to admitting, and must not read as a
  // forgery — one is an outage, the other is an accusation.
  const out = doorOutcomeForToken({ ok: false, reason: "no_secret" });
  assert.equal(out?.kind, "door_misconfigured");
  assert.equal(doorAdmits(out!), false);
});

test("a forged or malformed token is refused as forged, and they are the same door answer", () => {
  for (const reason of ["bad_signature", "malformed"] as const) {
    const out = doorOutcomeForToken({ ok: false, reason });
    assert.equal(out?.kind, "forged");
    assert.equal(doorAdmits(out!), false);
  }
});

test("a good signature yields NO outcome — the row decides, not the signature", () => {
  // The mapper must not be able to admit on a signature alone. Returning null
  // is what forces the caller to go to check_in.
  const out = doorOutcomeForToken({ ok: true, admissionId: "a", tokenVersion: 2 });
  assert.equal(out, null);
});

// ── The scope layer: the night, which no other gate asks about ─────────────

const FRIDAY = "11111111-1111-4111-8111-111111111111";
const SATURDAY = "22222222-2222-4222-8222-222222222222";

test("the SAME night proceeds — null means go to check_in, not admit", () => {
  // Returning null rather than an "ok" outcome is what keeps this layer from
  // becoming a second authority on entitlement.
  assert.equal(
    doorOutcomeForSessionScope({
      doorSessionId: FRIDAY,
      admissionSessionId: FRIDAY,
      ticketStartsAt: "2026-10-09T20:00:00Z",
    }),
    null,
  );
});

test("FRIDAY'S TICKET DOES NOT ADMIT ON SATURDAY — the defect this layer exists for", () => {
  // Every other gate says yes to this ticket: the signature is genuine, the
  // tenant matches, the token version is current, the status is valid and the
  // party has room. Only the night is wrong, and until this function existed
  // nothing asked.
  const out = doorOutcomeForSessionScope({
    doorSessionId: SATURDAY,
    admissionSessionId: FRIDAY,
    ticketStartsAt: "2026-10-09T20:00:00Z",
  });
  assert.equal(out?.kind, "wrong_session");
  assert.equal(doorAdmits(out!), false);
  if (out?.kind !== "wrong_session") return;
  // The date is CARRIED, not swallowed: "wrong night" starts an argument that
  // "this is for the 9th" ends.
  assert.equal(out.ticketStartsAt, "2026-10-09T20:00:00Z");
});

test("an admission anchored to NO session is refused at a session door, with no date to offer", () => {
  // Cases 4 and 5 of the anchor table (band reservation, walk-in against a
  // pool) carry session_id NULL legitimately — but "legitimate row" and
  // "belongs at tonight's door" are different facts, and tonight's list is
  // built by session_id, so this row is not on it.
  const out = doorOutcomeForSessionScope({
    doorSessionId: SATURDAY,
    admissionSessionId: null,
    ticketStartsAt: null,
  });
  assert.equal(out?.kind, "wrong_session");
  assert.equal(doorAdmits(out!), false);
  if (out?.kind !== "wrong_session") return;
  assert.equal(out.ticketStartsAt, null);
});

test("a null admission session is refused even when the door id is also absent-looking", () => {
  // Guard against the null-equals-null trap: if the comparison were a bare
  // `!==`, two nulls would match and every unanchored admission would admit at
  // every door. The identity branch is written to require a non-null match.
  const out = doorOutcomeForSessionScope({
    doorSessionId: "",
    admissionSessionId: null,
    ticketStartsAt: null,
  });
  assert.equal(out?.kind, "wrong_session");
});

// ── The row layer ──────────────────────────────────────────────────────────

test("admitted carries the counts and the no-show flag rather than swallowing them", () => {
  const out = doorOutcomeForCheckIn({
    ok: true, admitted: 2, admittedCount: 2, partySize: 4, remaining: 2, wasMarkedNoShow: true,
  });
  assert.equal(out.kind, "admitted");
  assert.equal(doorAdmits(out), true);
  if (out.kind !== "admitted") return;
  assert.equal(out.admitted, 2);
  assert.equal(out.remaining, 2);
  // Somebody may already have been charged a fee; the person at the door is
  // the one who can say so.
  assert.equal(out.wasMarkedNoShow, true);
});

test("a SUPERSEDED token is its own answer, not a forgery and not a refund", () => {
  // The transfer case. The signature was genuine; the version moved on.
  const out = doorOutcomeForCheckIn({ ok: false, reason: "token_superseded" });
  assert.equal(out.kind, "superseded");
  assert.equal(doorAdmits(out), false);
});

test("already_admitted is NOT admittance and NOT a forgery", () => {
  const out = doorOutcomeForCheckIn({
    ok: false, reason: "already_admitted", admittedCount: 2, partySize: 2,
  });
  assert.equal(out.kind, "already_in");
  assert.equal(doorAdmits(out), false);
  if (out.kind !== "already_in") return;
  assert.equal(out.admittedCount, 2);
});

test("a not-valid ticket carries the row's OWN word, so refunded reads as refunded", () => {
  const out = doorOutcomeForCheckIn({ ok: false, reason: "not_valid", status: "refunded" });
  assert.equal(out.kind, "not_valid");
  if (out.kind !== "not_valid") return;
  assert.equal(out.status, "refunded");
});

test("exceeds_remaining reports both numbers, so staff can say how many are left", () => {
  const out = doorOutcomeForCheckIn({
    ok: false, reason: "exceeds_remaining", remaining: 2, requested: 3,
  });
  assert.equal(out.kind, "too_many");
  if (out.kind !== "too_many") return;
  assert.equal(out.remaining, 2);
  assert.equal(out.requested, 3);
});

// ── The failures that must not look like the holder's fault ────────────────

test("token_version_required is OUR bug and must not render as a refusal of the holder", () => {
  // The caller failed to say which door it is. A ticket-shaped refusal here
  // would send staff to argue with someone holding a perfectly good ticket.
  const out = doorOutcomeForCheckIn({ ok: false, reason: "token_version_required" });
  assert.equal(out.kind, "engine_error");
  assert.equal(doorAdmits(out), false);
});

test("an UNRECOGNISED reason becomes engine_error carrying the raw string", () => {
  // A door that renders a cheerful default for a reason it does not understand
  // hides the next refusal somebody adds. Guard-of-a-guard: this is the test
  // that bites when check_in grows a reason and nobody updates the mapper.
  const out = doorOutcomeForCheckIn({ ok: false, reason: "some_future_reason" });
  assert.equal(out.kind, "engine_error");
  if (out.kind !== "engine_error") return;
  assert.equal(out.detail, "some_future_reason");
});

test("a missing or malformed reply is an engine error, never an admittance", () => {
  for (const bad of [null, undefined, "nope" as unknown as Record<string, never>]) {
    const out = doorOutcomeForCheckIn(bad as never);
    assert.equal(out.kind, "engine_error");
    assert.equal(doorAdmits(out), false);
  }
});

test("NOTHING except ok:true admits — checked across every refusal shape", () => {
  // The property that matters most: no refusal path can accidentally open the
  // door. Enumerated rather than spot-checked.
  const refusals = [
    { ok: false, reason: "already_admitted" },
    { ok: false, reason: "token_superseded" },
    { ok: false, reason: "token_version_required" },
    { ok: false, reason: "not_valid", status: "void" },
    { ok: false, reason: "unknown_admission" },
    { ok: false, reason: "exceeds_remaining" },
    { ok: false, reason: "bad_mode" },
    { ok: false },
    {},
  ];
  for (const r of refusals) {
    assert.equal(doorAdmits(doorOutcomeForCheckIn(r)), false, JSON.stringify(r));
  }
  assert.equal(doorAdmits(doorOutcomeForCheckIn({ ok: true })), true);
});
