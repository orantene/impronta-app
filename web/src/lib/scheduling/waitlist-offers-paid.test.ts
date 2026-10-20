/**
 * P1 release gate: the POS classes waitlist "They took it" never gives an
 * unpaid seat.
 *
 * `waitlistAcceptOffer` called `waitlist_accept_offer`, which COMMITS the
 * offer's held seat and marks the entry accepted. On a paid class that is a
 * seat with no order and no payment (the TUL-1552 bug on its second path).
 * Until the desk can take payment for a waitlist place here, a paid session
 * is refused with `payment_required` and staff are pointed at taking payment
 * first. Free sessions are unchanged.
 *
 * Driven through the storefront in-memory PostgREST; the RPC is modelled as
 * today's (commit + accept) so a wrong route shows up as a committed seat.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fakeAdmin, uuid, type FakeStore } from "@/lib/storefront/__fixtures__/fake-admin";
import { waitlistAcceptOffer } from "./waitlist-offers";

const TENANT = uuid(1);
const SESSION = uuid(2);
const OFFERING = uuid(3);
const ENTRY = uuid(4);
const OFFER = uuid(5);
const ALLOC = uuid(6);

function seed(base: number | null, tiers: ReadonlyArray<number | null> = []): FakeStore {
  return {
    waitlist_offers: [{ id: OFFER, tenant_id: TENANT, waitlist_entry_id: ENTRY, allocation_id: ALLOC, accepted_at: null, declined_at: null }],
    session_waitlist_entries: [{ id: ENTRY, tenant_id: TENANT, session_id: SESSION, status: "offered", accepted_allocation_id: null }],
    sessions: [{ id: SESSION, tenant_id: TENANT, offering_id: OFFERING, status: "scheduled" }],
    talent_offerings: [{ id: OFFERING, tenant_id: TENANT, amount_cents: base }],
    talent_offering_variants: tiers.map((cents, i) => ({ id: uuid(20 + i), offering_id: OFFERING, amount_cents: cents })),
    capacity_allocations: [{ id: ALLOC, tenant_id: TENANT, state: "hold" }],
  };
}

function setup(base: number | null, tiers: ReadonlyArray<number | null> = []) {
  const store = seed(base, tiers);
  const db = fakeAdmin(store, {
    // Today's RPC: commit the held seat, mark the entry accepted.
    waitlist_accept_offer: () => {
      store.capacity_allocations[0]!.state = "committed";
      store.waitlist_offers[0]!.accepted_at = new Date().toISOString();
      Object.assign(store.session_waitlist_entries[0]!, { status: "accepted", accepted_allocation_id: ALLOC });
      return { ok: true, offer_id: OFFER, allocation_id: ALLOC };
    },
  });
  return { store, db };
}

const input = { tenantId: TENANT, offerId: OFFER, operationKey: `accept:${OFFER}` };
const committed = (s: FakeStore) => s.capacity_allocations.filter((a) => a.state === "committed").length;

test("PAID session: 'They took it' refuses with payment_required and commits nothing", async () => {
  const { store, db } = setup(2500);
  const r = await waitlistAcceptOffer(db.admin, input);
  assert.equal(committed(store), 0, "an unpaid seat must never be committed");
  assert.equal(store.session_waitlist_entries[0]?.status, "offered");
  assert.equal(db.calls.some((c) => c.rpc === "waitlist_accept_offer"), false, "the commit RPC is not reached");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "payment_required");
});

test("a session priced only by tier (base 0, tier > 0) is paid too: refused", async () => {
  const { store, db } = setup(0, [0, 1500]);
  const r = await waitlistAcceptOffer(db.admin, input);
  assert.equal(committed(store), 0);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "payment_required");
});

test("a price that is not a definite 0 (null base) is refused, never committed", async () => {
  const { store, db } = setup(null);
  const r = await waitlistAcceptOffer(db.admin, input);
  assert.equal(committed(store), 0);
  assert.equal(r.ok, false);
});

test("an unreadable price refuses as unavailable (fail closed)", async () => {
  const { store, db } = setup(2500);
  type Reply = { data: null; error: { code: string; message: string } };
  type Failing = {
    select: () => Failing; eq: () => Failing; in: () => Failing;
    maybeSingle: () => Promise<Reply>; then: (r: (v: Reply) => unknown) => unknown;
  };
  const reply: Reply = { data: null, error: { code: "57014", message: "timeout" } };
  const failing: Failing = {
    select: () => failing, eq: () => failing, in: () => failing,
    maybeSingle: async () => reply, then: (r) => r(reply),
  };
  const broken = { from: (t: string) => (t === "talent_offerings" ? failing : db.admin.from(t)), rpc: db.admin.rpc };
  const r = await waitlistAcceptOffer(broken, input);
  assert.equal(committed(store), 0);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "unavailable");
});

test("FREE session (base 0, no priced tier): 'They took it' commits as today", async () => {
  const { store, db } = setup(0, [0]);
  const r = await waitlistAcceptOffer(db.admin, input);
  assert.equal(r.ok, true);
  assert.equal(committed(store), 1);
  assert.equal(store.session_waitlist_entries[0]?.status, "accepted");
});

test("the desk has a sentence for payment_required in en and es (and fr), with no em dash", () => {
  for (const locale of ["en", "es", "fr"]) {
    const json = JSON.parse(readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8")) as {
      dashboard?: { pos?: { engine?: { refusal?: Record<string, string> } } };
    };
    const sentence = json.dashboard?.pos?.engine?.refusal?.payment_required;
    assert.equal(typeof sentence, "string", `${locale} has no payment_required sentence`);
    assert.ok(!String(sentence).includes("—"), `${locale} uses an em dash`);
  }
  const copy = readFileSync(join(process.cwd(), "src", "components", "admin", "pos", "pos-copy-engine.ts"), "utf8");
  assert.match(copy, /payment_required: t\(`\$\{E\}\.refusal\.payment_required`\)/);
});
