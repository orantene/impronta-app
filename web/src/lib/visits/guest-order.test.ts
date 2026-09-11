import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { guestVisitAddLine, posLineOfferSubstitute } from "./guest-order";

test("guestVisitAddLine refuses a closed visit before writing a draft", async () => {
  const admin = {
    rpc: async () => ({ data: null, error: null }),
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () =>
                table === "visits"
                  ? { data: { id: "v1", tenant_id: "t1", space_id: "s1", status: "closed" }, error: null }
                  : { data: null, error: null },
            }),
            maybeSingle: async () =>
              table === "visits"
                ? { data: { id: "v1", tenant_id: "t1", space_id: "s1", status: "closed", public_token: "tok", opened_at: null, party_size: 2 }, error: null }
                : { data: null, error: null },
          }),
        }),
      }),
    }),
  };
  const result = await guestVisitAddLine(admin, {
    tenantId: "t1",
    token: "tokentok",
    offeringId: "11111111-1111-4111-8111-111111111111",
    qty: 1,
    actorUserId: "u1",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.reason === "visit_closed" || result.reason === "not_found" || result.reason === "unavailable");
});

test("posLineOfferSubstitute maps not_found", async () => {
  const admin = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    rpc: async () => ({ data: { ok: false, reason: "not_found" }, error: null }),
  };
  const result = await posLineOfferSubstitute(admin, {
    tenantId: "t1",
    lineId: "11111111-1111-4111-8111-111111111111",
    substituteOfferingId: "22222222-2222-4222-8222-222222222222",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "not_found");
});

test("guest substitute SQL is service_role only", () => {
  const sql = readFileSync(
    join(process.cwd(), "..", "supabase", "migrations", "20261231226000_guest_qr_substitutes.sql"),
    "utf8",
  );
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.order_line_substitute_offers/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.pos_line_offer_substitute/);
});
