/**
 * session-waitlist.test.ts — the queue's derived facts and every refusal the
 * promote path can hand back.
 *
 * THE PROMOTE RPC HAS ITS OWN PROOF, and it runs once, inside the migration's
 * transaction, at apply time. It can never catch a regression here — in the
 * TypeScript that decides what an operator actually reads when the database
 * says `session_full`, and in the derivations the database deliberately does
 * not store (position, and whether an offer has run out).
 *
 * The Supabase client is a stub with one method. That is the whole surface
 * `promoteWaitlistEntry` touches, and stubbing it means these assertions are
 * about the mapping rather than about a network.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_WAITLIST_OFFER_MINUTES,
  deriveWaitlistState,
  describePromoteRefusal,
  nextInLine,
  orderWaitlist,
  promoteWaitlistEntry,
  toPromoteReason,
  type PromoteWaitlistReason,
} from "./session-waitlist";

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const MIGRATIONS = resolve(WEB_ROOT, "..", "supabase", "migrations");

const NOW = new Date("2027-05-01T12:00:00Z");

function raw(over: Partial<Parameters<typeof orderWaitlist>[0][number]> & { id: string }) {
  return {
    session_id: "s1",
    customer_name: "Somebody",
    customer_email: null,
    party_size: 1,
    status: "waiting",
    joined_at: "2027-05-01T10:00:00Z",
    offered_at: null,
    offer_expires_at: null,
    ...over,
  };
}

/** One-method stub: the RPC is all `promoteWaitlistEntry` reaches for. */
function stubAdmin(reply: unknown, capture?: { args?: Record<string, unknown> }) {
  return {
    from() {
      throw new Error("promoteWaitlistEntry must not read tables directly");
    },
    async rpc(name: string, args: Record<string, unknown>) {
      assert.equal(name, "promote_session_waitlist_entry");
      if (capture) capture.args = args;
      return { data: reply, error: null };
    },
  } as unknown as Parameters<typeof promoteWaitlistEntry>[0];
}

test("position is the place in the joined_at queue, never a stored number", () => {
  const ordered = orderWaitlist(
    [
      raw({ id: "c", joined_at: "2027-05-01T11:00:00Z", customer_name: "Third" }),
      raw({ id: "a", joined_at: "2027-05-01T09:00:00Z", customer_name: "First" }),
      raw({ id: "b", joined_at: "2027-05-01T10:00:00Z", customer_name: "Second" }),
    ],
    NOW,
  );
  assert.deepEqual(
    ordered.map((e) => [e.position, e.customerName]),
    [[1, "First"], [2, "Second"], [3, "Third"]],
  );
});

test("an offer whose window has closed reads as expired, never as vanished", () => {
  assert.equal(
    deriveWaitlistState(
      { status: "offered", offerExpiresAt: "2027-05-01T11:59:00Z" },
      NOW,
    ),
    "expired",
  );
  assert.equal(
    deriveWaitlistState(
      { status: "offered", offerExpiresAt: "2027-05-01T12:01:00Z" },
      NOW,
    ),
    "offered",
  );
  // An offer with no window cannot exist in the table; if one ever appears it
  // is treated as lapsed rather than as an offer that never ends.
  assert.equal(deriveWaitlistState({ status: "offered", offerExpiresAt: null }, NOW), "expired");
  // Everything that is not an offer is simply itself.
  for (const status of ["waiting", "accepted", "withdrawn"] as const) {
    assert.equal(deriveWaitlistState({ status, offerExpiresAt: null }, NOW), status);
  }
});

test("whose turn it is skips a live offer and returns to a lapsed one", () => {
  const entries = orderWaitlist(
    [
      raw({
        id: "a",
        joined_at: "2027-05-01T09:00:00Z",
        status: "offered",
        offered_at: "2027-05-01T11:00:00Z",
        offer_expires_at: "2027-05-01T12:30:00Z",
      }),
      raw({ id: "b", joined_at: "2027-05-01T10:00:00Z" }),
    ],
    NOW,
  );
  // The head of the queue is holding a live offer, so the next place goes to b.
  assert.equal(nextInLine(entries, NOW)?.id, "b");

  const lapsed = orderWaitlist(
    [
      raw({
        id: "a",
        joined_at: "2027-05-01T09:00:00Z",
        status: "offered",
        offered_at: "2027-05-01T10:00:00Z",
        offer_expires_at: "2027-05-01T11:00:00Z",
      }),
      raw({ id: "b", joined_at: "2027-05-01T10:00:00Z" }),
    ],
    NOW,
  );
  // a did not answer; the place is theirs to be offered again, ahead of b.
  assert.equal(nextInLine(lapsed, NOW)?.id, "a");
});

test("people who have left the queue are never next", () => {
  const entries = orderWaitlist(
    [
      raw({ id: "a", joined_at: "2027-05-01T09:00:00Z", status: "accepted" }),
      raw({ id: "b", joined_at: "2027-05-01T09:30:00Z", status: "withdrawn" }),
      raw({ id: "c", joined_at: "2027-05-01T10:00:00Z" }),
    ],
    NOW,
  );
  assert.equal(nextInLine(entries, NOW)?.id, "c");
  assert.equal(nextInLine(entries.slice(0, 2), NOW), null);
});

test("the promote sends the status the SCREEN showed, so a stale row is refused", () => {
  const capture: { args?: Record<string, unknown> } = {};
  return promoteWaitlistEntry(
    stubAdmin({ ok: true, already: false, entry_id: "e1", offer_expires_at: "x" }, capture),
    { tenantId: "t1", entryId: "e1", actorUserId: "u1", expectedStatus: "waiting" },
  ).then(() => {
    assert.equal(capture.args?.p_expected_status, "waiting");
    assert.equal(capture.args?.p_offer_minutes, DEFAULT_WAITLIST_OFFER_MINUTES);
  });
});

test("a conflict is the stale-screen sentence, not a generic failure", async () => {
  const result = await promoteWaitlistEntry(
    stubAdmin({ ok: false, reason: "conflict", current_status: "accepted" }),
    { tenantId: "t1", entryId: "e1", actorUserId: "u1", expectedStatus: "waiting" },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "conflict");
  assert.equal(result.refusalKey, "changedSinceOpened");
});

test("a full session carries how many places are already promised", async () => {
  const result = await promoteWaitlistEntry(
    stubAdmin({ ok: false, reason: "session_full", remaining: 1, outstanding_offers: 1 }),
    { tenantId: "t1", entryId: "e1", actorUserId: "u1", expectedStatus: "waiting" },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.refusalKey, "sessionFull");
  assert.equal(result.outstandingOffers, 1);
});

test("a retry of the same intent is a success, not a second offer", async () => {
  const result = await promoteWaitlistEntry(
    stubAdmin({ ok: true, already: true, entry_id: "e1", offer_expires_at: "2027-05-01T12:30:00Z" }),
    { tenantId: "t1", entryId: "e1", actorUserId: "u1", expectedStatus: "offered" },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.already, true);
});

test("a reason the database has not been taught here never leaks raw to a screen", () => {
  assert.equal(toPromoteReason("something_new"), "unavailable");
  assert.equal(toPromoteReason(undefined), "unavailable");
  assert.equal(describePromoteRefusal("unavailable"), "unavailable");
});

test("a missing entry and one in another workspace get the same answer", () => {
  assert.equal(describePromoteRefusal("not_found"), "notFound");
  assert.equal(describePromoteRefusal("wrong_tenant"), "notFound");
});

test("every reason the RPC can return has a sentence in all three languages", () => {
  // The reasons are read from the MIGRATION, so a new refusal added to the
  // function without copy in this repository turns this red instead of
  // rendering its own key path on a screen.
  const sql = readFileSync(join(MIGRATIONS, "20261231001100_session_waitlist.sql"), "utf8");
  const fromSql = new Set(
    [...sql.matchAll(/'reason',\s*'([a-z_]+)'/g)].map((m) => m[1] as PromoteWaitlistReason),
  );
  assert.ok(fromSql.size >= 7, `expected the RPC's refusals, found ${fromSql.size}`);

  for (const locale of ["en", "es", "fr"] as const) {
    const json = JSON.parse(
      readFileSync(join(WEB_ROOT, "messages", `${locale}.json`), "utf8"),
    ) as Record<string, Record<string, Record<string, Record<string, Record<string, string>>>>>;
    const rows = json.dashboard!.adminAppointments!.waitlist!.refusal!;
    for (const reason of fromSql) {
      const key = describePromoteRefusal(reason);
      assert.equal(typeof rows[key], "string", `${locale} has no sentence for "${reason}"`);
      assert.ok(!rows[key]!.includes("—"), `${locale}.${key} uses an em dash`);
    }
  }
});
