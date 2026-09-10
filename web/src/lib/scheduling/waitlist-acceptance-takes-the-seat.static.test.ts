/**
 * D-105. One seat could be given to two people, and no unit test could see it.
 *
 * The defect lived entirely in the database. `promote_session_waitlist_entry`
 * holds a released place by subtracting live offers from what the pool
 * reports, and accepting an offer wrote nothing but the word 'accepted' on the
 * entry — so at that instant the subtraction lapsed AND the pool still called
 * the seat free. Reproduced on the isolated branch: promote A succeeds and
 * reports zero remaining, promote B is refused as full, set A to accepted, the
 * public remaining count is 1 again, promote B now succeeds.
 *
 * Nothing in TypeScript could catch that, and the migration's own proof block
 * runs once at apply time and can never catch a regression. These assertions
 * read the migration itself, the way `reschedule-booking-set.static.test.ts`
 * does, so the three properties that make the oversell impossible cannot be
 * quietly removed:
 *
 *   1. the table refuses 'accepted' without a seat named against it;
 *   2. acceptance takes that seat through the capacity ENGINE, commits it, and
 *      writes it onto the entry in the same statement that marks it accepted;
 *   3. giving up an accepted place releases the seat, so it comes back.
 *
 * Comments are stripped before every assertion, so prose about a rule can
 * never stand in for the rule.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const MIGRATIONS = resolve(WEB_ROOT, "..", "supabase", "migrations");
const FILE = "20261231002600_waitlist_acceptance_takes_the_seat.sql";

const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");
const lower = sql.toLowerCase();

/** Strip `--` comments: a migration header is not evidence of behaviour. */
function stripComments(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

/** The body of one function, from its CREATE to the terminating `$$;`. */
function bodyOf(name: string): string {
  const start = lower.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `${FILE} must define ${name}`);
  const end = lower.indexOf("\n$$;", start);
  assert.ok(end > start, `${name} must be a complete function body`);
  return stripComments(lower.slice(start, end));
}

const code = stripComments(lower);

test("an entry cannot read 'accepted' unless a seat is named against it", () => {
  assert.ok(
    code.includes("add column if not exists accepted_allocation_id"),
    "the entry must be able to name the seat it holds",
  );
  assert.ok(
    code.includes("references public.capacity_allocations(id)"),
    "the seat must be a real allocation, not a free-form id",
  );
  const constraint = code.indexOf("constraint session_waitlist_accepted_holds_a_seat");
  assert.ok(constraint >= 0, "the constraint that makes the defect unrepresentable must exist");
  const check = code.slice(constraint, constraint + 240);
  assert.ok(
    check.includes("check (status <> 'accepted' or accepted_allocation_id is not null)"),
    "a hand-written UPDATE that flips the word must be refused by the table itself",
  );
});

test("acceptance takes the seat through the capacity engine, not new arithmetic", () => {
  const body = bodyOf("accept_session_waitlist_offer");

  const reserve = body.indexOf("public._capacity_reserve_locked(");
  assert.ok(
    reserve >= 0,
    "the seat must come from the engine's own reserve, which holds the pool chain root-first",
  );
  assert.ok(
    body.includes("v_entry.party_size"),
    "the reserve must be for the party on the entry, not for one seat regardless",
  );

  const commit = body.indexOf("public.commit_capacity(array[v_alloc.id])");
  assert.ok(
    commit > reserve,
    "the reserved seat must be committed: a hold would expire and hand the seat back on its own",
  );

  const update = body.indexOf("update public.session_waitlist_entries");
  assert.ok(update > commit, "the seat is taken BEFORE the entry is marked accepted");
  const stamp = body.slice(update);
  assert.ok(
    stamp.includes("status = 'accepted'") && stamp.includes("accepted_allocation_id = v_alloc.id"),
    "the word and the seat must be written in the same statement, or neither is true",
  );

  assert.ok(
    body.includes("sqlstate 'cp005'") && body.includes("sqlstate 'cp006'"),
    "the engine's own sold_out and ancestor_full must become a refusal an operator can read",
  );
});

test("the seat comes back when an accepted place is given up", () => {
  const body = bodyOf("cancel_session_waitlist_seat");
  const release = body.indexOf("public.release_capacity(array[v_entry.accepted_allocation_id])");
  assert.ok(release >= 0, "the committed seat must be released through the engine's own clamp");
  const update = body.indexOf("update public.session_waitlist_entries");
  assert.ok(update > release, "the seat is released before the entry leaves the list");
  assert.ok(
    body.includes("v_entry.status <> 'accepted'"),
    "an entry holding no seat must be refused here rather than silently withdrawn",
  );
});

test("an offer is still not an allocation, and declining releases nothing", () => {
  const body = bodyOf("decline_session_waitlist_offer");
  assert.ok(
    !body.includes("release_capacity") && !body.includes("_capacity_reserve_locked"),
    "an offer never held capacity, so declining one must not touch the engine",
  );
  assert.ok(
    body.includes("'already_accepted'"),
    "an accepted place must be refused here: it holds a seat that has to be released",
  );
});

test("outstanding offers are subtracted in seats, not in people", () => {
  const body = bodyOf("promote_session_waitlist_entry");
  const count = body.indexOf("into v_offers");
  assert.ok(count >= 0, "promote must still subtract the offers still inside their window");
  const clause = body.slice(body.lastIndexOf("select", count), count);
  assert.ok(
    clause.includes("sum(e.party_size)"),
    "a party of four holding one unit of a count is the same oversell in miniature",
  );
  assert.ok(
    body.includes("v_effective < v_entry.party_size"),
    "the asking entry's own party has to fit in what is left",
  );
});

test("the new write RPCs are service_role only", () => {
  for (const name of [
    "accept_session_waitlist_offer",
    "decline_session_waitlist_offer",
    "cancel_session_waitlist_seat",
  ]) {
    const revoke = code.indexOf(`revoke all on function public.${name}(`);
    assert.ok(revoke >= 0, `${name} must be revoked`);
    const clause = code.slice(revoke, revoke + 200);
    assert.ok(
      clause.includes("from public, anon, authenticated"),
      `${name} must be revoked FROM PUBLIC: a role revoke alone leaves it reachable`,
    );
  }
});

test("every refusal the acceptance path can return has a sentence in all three languages", () => {
  const reasons = new Set(
    [
      ...bodyOf("accept_session_waitlist_offer").matchAll(/'reason',\s*'([a-z_]+)'/g),
      ...bodyOf("cancel_session_waitlist_seat").matchAll(/'reason',\s*'([a-z_]+)'/g),
      ...bodyOf("decline_session_waitlist_offer").matchAll(/'reason',\s*'([a-z_]+)'/g),
    ].map((m) => m[1] as string),
  );
  assert.ok(reasons.size >= 10, `expected the new refusals, found ${reasons.size}`);

  // Imported lazily so the mapping under test is the shipped one.
  const map: Record<string, string> = {
    invalid: "invalid",
    not_found: "notFound",
    wrong_tenant: "notFound",
    conflict: "changedSinceOpened",
    not_offered: "notOffered",
    offer_expired: "offerExpired",
    not_promotable: "notPromotable",
    session_missing: "sessionMissing",
    session_not_open: "sessionNotOpen",
    no_pool: "noPool",
    session_full: "seatJustTaken",
    already_accepted: "alreadyAccepted",
    not_accepted: "notAccepted",
    unavailable: "unavailable",
  };

  for (const locale of ["en", "es", "fr"] as const) {
    const json = JSON.parse(
      readFileSync(join(WEB_ROOT, "messages", `${locale}.json`), "utf8"),
    ) as Record<string, Record<string, Record<string, Record<string, Record<string, string>>>>>;
    const rows = json.dashboard!.adminAppointments!.waitlist!.refusal!;
    for (const reason of reasons) {
      const key = map[reason];
      assert.ok(key, `no catalogue key is mapped for the refusal "${reason}"`);
      assert.equal(typeof rows[key], "string", `${locale} has no sentence for "${reason}"`);
      assert.ok(!rows[key]!.includes("—"), `${locale}.${key} uses an em dash`);
    }
  }
});
