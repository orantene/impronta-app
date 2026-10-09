import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { extendLinkClaim, type ClaimRow } from "./link-checkout";
import type { Admin } from "@/lib/pos/sale-rows";

type Reply = { data?: unknown; error?: { message: string } | null };
type FakeQuery = {
  eq: (...a: unknown[]) => FakeQuery;
  select: (...a: unknown[]) => FakeQuery;
  update: (...a: unknown[]) => FakeQuery;
  maybeSingle: () => Promise<Reply>;
  then: (r: (v: Reply) => unknown) => unknown;
  [k: string]: unknown;
};

const NOW = Date.parse("2026-10-09T15:48:31Z");
const FLOOR_OK = new Date(NOW + 33 * 60_000).toISOString();
const claim: ClaimRow = { id: "res-1", state: "reserved", transaction_id: null, expires_at: new Date(NOW + 28 * 60_000).toISOString() };

/** A fake Admin: `claimUpdate` answers the claim update, `reread` the follow-up read, `linkUpdate` the link write. */
function fakeAdmin(opts: { claimUpdate: Reply; reread?: Reply; linkUpdate?: Reply }) {
  const calls: string[] = [];
  const admin = {
    from(table: string) {
      let mode = "";
      const q: FakeQuery = {
        eq: () => q,
        select: () => q,
        update: () => {
          mode = "update";
          return q;
        },
        maybeSingle: async () => {
          calls.push(`${table}:read`);
          return opts.reread ?? { data: null, error: null };
        },
        then: (resolve) => {
          calls.push(`${table}:${mode}`);
          return resolve(table === "payment_links" ? (opts.linkUpdate ?? { data: [], error: null }) : opts.claimUpdate);
        },
      };
      return q;
    },
  } as unknown as Admin;
  return { admin, calls };
}

test("a won update is answered by RETURNING: no re-read, and the link follows", async () => {
  const { admin, calls } = fakeAdmin({ claimUpdate: { data: [{ expires_at: FLOOR_OK }], error: null } });
  const r = await extendLinkClaim(admin, { linkId: "l1", claim, to: FLOOR_OK, now: () => NOW });
  assert.deepEqual(r, { ok: true, expiresAt: FLOOR_OK });
  assert.ok(!calls.includes("order_collection_reservations:read"));
  assert.ok(calls.includes("payment_links:update"));
});

test("a lost compare-and-set whose claim a concurrent tap already moved past the floor is a success", async () => {
  const { admin } = fakeAdmin({
    claimUpdate: { data: [], error: null },
    reread: { data: { id: "res-1", state: "reserved", transaction_id: null, expires_at: FLOOR_OK }, error: null },
  });
  const r = await extendLinkClaim(admin, { linkId: "l1", claim, to: FLOOR_OK, now: () => NOW });
  assert.deepEqual(r, { ok: true, expiresAt: FLOOR_OK });
});

test("a claim that really did not move stays a failure, a released claim is gone", async () => {
  const stale = fakeAdmin({ claimUpdate: { data: [], error: null }, reread: { data: { ...claim }, error: null } });
  assert.deepEqual(await extendLinkClaim(stale.admin, { linkId: "l1", claim, to: FLOOR_OK, now: () => NOW }), {
    ok: false,
    reason: "unavailable",
  });
  const gone = fakeAdmin({ claimUpdate: { data: [], error: null }, reread: { data: { ...claim, state: "released" }, error: null } });
  assert.deepEqual(await extendLinkClaim(gone.admin, { linkId: "l1", claim, to: FLOOR_OK, now: () => NOW }), {
    ok: false,
    reason: "gone",
  });
});

test("an extension failure is a clean start_failed: it happens before any money row or Stripe call", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/payments/link-checkout.ts"), "utf8");
  assert.match(src, /extended\.reason === "gone" \? "expired" : "start_failed"/);
  const step3 = src.indexOf("The claim must outlive the session");
  const stripe = src.indexOf("createCheckoutSession ?? createCheckoutSessionForTransaction");
  assert.ok(step3 > 0 && stripe > step3, "the extension runs before the session create");
});
