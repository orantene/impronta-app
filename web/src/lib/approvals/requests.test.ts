import assert from "node:assert/strict";
import { test } from "node:test";
import { assertRoleLimit, decideApproval, requestApproval } from "./requests";

test("a missing role limit is open; over the cap is over_limit", async () => {
  const open = await assertRoleLimit(
    {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    },
    { tenantId: "t1", role: "editor", action: "discount", amountCents: 999999 },
  );
  assert.equal(open.ok, true);

  const capped = await assertRoleLimit(
    {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { limit_cents: 1000 }, error: null }),
              }),
            }),
          }),
        }),
      }),
    },
    { tenantId: "t1", role: "editor", action: "refund", amountCents: 1001 },
  );
  assert.equal(capped.ok, false);
  if (!capped.ok) assert.equal(capped.reason, "over_limit");
});

test("decide maps already_decided and request needs an operation key", async () => {
  const short = await requestApproval(
    { rpc: async () => ({ data: { ok: true, request_id: "r1" }, error: null }) },
    { tenantId: "t1", kind: "discount", subjectId: "s1", requestedBy: "u1", operationKey: "x", reason: "ask" },
  );
  assert.equal(short.ok, false);
  if (!short.ok) assert.equal(short.reason, "invalid");

  const decided = await decideApproval(
    { rpc: async () => ({ data: { ok: false, reason: "already_decided" }, error: null }) },
    { tenantId: "t1", requestId: "r1", decidedBy: "m1", decision: "approved", reason: "ok" },
  );
  assert.equal(decided.ok, false);
  if (!decided.ok) assert.equal(decided.reason, "already_decided");
});
