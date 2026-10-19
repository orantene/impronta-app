/**
 * H2 (TUL-1269 #12): ticketLookup is email + 4 digits, so it must not be
 * brute-forceable and must not scan every receipt of the tenant.
 *
 * Run: node_modules/.bin/tsx --test src/lib/venues/ticket-lookup-limits.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { ticketLookup } from "./ticket-self";

process.env.GUEST_COOKIE_SECRET = process.env.GUEST_COOKIE_SECRET ?? "test-secret-ticket-lookup";

function fakeAdmin() {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const chain: Record<string, unknown> = {
    select(...a: unknown[]) { calls.push({ op: "select", args: a }); return chain; },
    eq(...a: unknown[]) { calls.push({ op: "eq", args: a }); return chain; },
    not(...a: unknown[]) { calls.push({ op: "not", args: a }); return chain; },
    like(...a: unknown[]) { calls.push({ op: "like", args: a }); return chain; },
    limit(...a: unknown[]) { calls.push({ op: "limit", args: a }); return chain; },
    then(resolve: (v: unknown) => void) { resolve({ data: [], error: null }); },
  };
  return { admin: { from: () => chain } as never, calls };
}

test("the receipt tail is matched in SQL (like), not by loading every receipt", async () => {
  const { admin, calls } = fakeAdmin();
  await ticketLookup(admin, { tenantId: "t-sql", email: "a@b.com", last4OfReceipt: "1234" });
  const like = calls.find((c) => c.op === "like");
  assert.ok(like, "receipt_code must be filtered with like");
  assert.deepEqual(like!.args, ["receipt_code", "%1234"]);
  assert.ok(calls.some((c) => c.op === "limit"), "the read is bounded");
});

test("a tenant-wide cap stops a spray of different emails", async () => {
  const { admin } = fakeAdmin();
  let refused = 0;
  for (let i = 0; i < 400; i += 1) {
    const r = await ticketLookup(admin, { tenantId: "t-spray", email: `p${i}@b.com`, last4OfReceipt: "0000" });
    if (!r.ok && r.reason === "too_many_attempts") refused += 1;
  }
  assert.ok(refused > 0, "400 lookups in a minute for one tenant must be limited");
});

test("a per-email hourly cap sits behind the per-minute one", async () => {
  const { admin } = fakeAdmin();
  const email = "slow@b.com";
  let ok = 0;
  for (let i = 0; i < 20; i += 1) {
    const r = await ticketLookup(admin, { tenantId: "t-hour", email, last4OfReceipt: "0000" });
    if (!(!r.ok && r.reason === "too_many_attempts")) ok += 1;
  }
  assert.ok(ok <= 8, `only the per-minute budget of 8 is served, got ${ok}`);
});
