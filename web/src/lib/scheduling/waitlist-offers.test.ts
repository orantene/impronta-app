import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { waitlistAcceptOffer, waitlistOfferPlace } from "./waitlist-offers";

test("place maps a reserve refusal to no_place", async () => {
  const result = await waitlistOfferPlace(
    {
      rpc: async () => ({ data: { ok: false, reason: "no_place" }, error: null }),
    },
    { tenantId: "t1", entryId: "e1", operationKey: "offer-aaaaaa" },
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "no_place");
});

test("two accepts of one offer: the RPC decides the winner", async () => {
  let n = 0;
  const admin = {
    rpc: async () => {
      n += 1;
      return n === 1
        ? { data: { ok: true, offer_id: "off1" }, error: null }
        : { data: { ok: false, reason: "already_accepted" }, error: null };
    },
  };
  const a = await waitlistAcceptOffer(admin, { tenantId: "t1", offerId: "off1", operationKey: "accept-aaaa" });
  const b = await waitlistAcceptOffer(admin, { tenantId: "t1", offerId: "off1", operationKey: "accept-bbbb" });
  assert.equal(a.ok, true);
  assert.equal(b.ok, false);
  if (!b.ok) assert.equal(b.reason, "already_accepted");
});

test("waitlist offers SQL holds via reserve_resource_set_v2", () => {
  const sql = readFileSync(join(process.cwd(), "..", "supabase", "migrations", "20261231207000_waitlist_offers.sql"), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public.waitlist_offers/);
  assert.match(sql, /reserve_resource_set_v2/);
  assert.match(sql, /a refused accept wrote a row/);
});
