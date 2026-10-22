/**
 * TUL-1486: anon must not read the sessions of a hidden, private, draft or unapproved offering.
 * UNTESTED against a live database: this evaluates the HELD migration's policy text over a table of
 * (offering, event) cases and pins the text, the same way the other held RLS files are pinned.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const FILE = join(process.cwd(), "..", "supabase", "migrations", "_pending_pm", "20261231423800_sessions_select_public_offering_visible_tul1486.sql");
const sql = readFileSync(FILE, "utf8").replace(/--[^\n]*/g, "");

type Offering = { status: string; visibility: string; moderation_state: string } | null;
type Event = { status: string } | null;
type Session = { status: string; offering: Offering; hasOffering: boolean; event: Event; hasEvent: boolean };

/** The policy as written in the file, evaluated for anon (no staff). */
function anonCanRead(s: Session): boolean {
  assert.match(sql, /status = 'scheduled'/);
  const offeringOk = !s.hasOffering || (!!s.offering && s.offering.status === "published" && ["public", "on_request"].includes(s.offering.visibility) && s.offering.moderation_state === "approved");
  const eventOk = !s.hasEvent || (!!s.event && s.event.status === "published");
  return s.status === "scheduled" && offeringOk && eventOk;
}
const pub = { status: "published", visibility: "public", moderation_state: "approved" };
const base = { status: "scheduled", hasOffering: true, offering: pub, hasEvent: false, event: null } satisfies Session;

test("the policy text carries every public-catalog gate on the offering, and the event gate", () => {
  assert.match(sql, /DROP POLICY IF EXISTS sessions_select_public ON public\.sessions/);
  assert.match(sql, /offering_id IS NULL\s+OR EXISTS/);
  assert.match(sql, /o\.id = sessions\.offering_id/);
  assert.match(sql, /o\.status = 'published'/);
  assert.match(sql, /o\.visibility IN \('public','on_request'\)/);
  assert.match(sql, /o\.moderation_state = 'approved'/);
  assert.match(sql, /e\.status = 'published'/);
  assert.doesNotMatch(sql, /sessions_select_staff/, "the staff policy is not touched");
});

test("anon reads the sessions of a published, public (or on request), approved offering", () => {
  assert.equal(anonCanRead(base), true);
  assert.equal(anonCanRead({ ...base, offering: { ...pub, visibility: "on_request" } }), true);
  assert.equal(anonCanRead({ ...base, hasOffering: false, offering: null }), true, "a session with no offering is unchanged");
});

test("a hidden, private, draft or unapproved offering's sessions return 0 rows for anon", () => {
  for (const offering of [
    { ...pub, visibility: "hidden" },
    { ...pub, visibility: "private" },
    { ...pub, visibility: "agency_only" },
    { ...pub, status: "draft" },
    { ...pub, status: "archived" },
    { ...pub, moderation_state: "pending" },
    { ...pub, moderation_state: "rejected" },
    null, // the offering row is not readable / missing
  ]) {
    assert.equal(anonCanRead({ ...base, offering }), false, JSON.stringify(offering));
  }
});

test("sessions of a draft event, and cancelled sessions, stay hidden", () => {
  assert.equal(anonCanRead({ ...base, hasEvent: true, event: { status: "draft" } }), false);
  assert.equal(anonCanRead({ ...base, hasEvent: true, event: { status: "published" } }), true);
  assert.equal(anonCanRead({ ...base, status: "cancelled" }), false);
});
