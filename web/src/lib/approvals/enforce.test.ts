import assert from "node:assert/strict";
import { test } from "node:test";
import { enforceRoleLimit } from "./enforce";

function admin(limitCents: number | null) {
  const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return {
    rpcs,
    admin: {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: limitCents == null ? null : { limit_cents: limitCents }, error: null }),
              }),
            }),
          }),
        }),
      }),
      rpc: async (fn: string, args: Record<string, unknown>) => {
        rpcs.push({ fn, args });
        return { data: { ok: true, request_id: "req-1", already: false }, error: null };
      },
    },
  };
}

const INPUT = {
  tenantId: "t1",
  role: "manager",
  action: "discount" as const,
  amountCents: 1500,
  subjectId: "order-1",
  requestedBy: "u1",
  operationKey: "discount:order-1:3",
  reason: "code WIRE10",
};

// D-139: the limit is judged, and a refusal FILES the request the inbox decides.
test("over the role's limit refuses and files an approval request", async () => {
  const { admin: a, rpcs } = admin(1000);
  const out = await enforceRoleLimit(a, INPUT);
  assert.deepEqual(out, { ok: false, reason: "over_limit", requestId: "req-1" });
  assert.equal(rpcs.length, 1);
  assert.equal(rpcs[0].fn, "request_approval");
  assert.equal(rpcs[0].args.p_kind, "discount");
  assert.equal(rpcs[0].args.p_subject_id, "order-1");
  assert.equal(rpcs[0].args.p_requested_by, "u1");
  assert.equal(rpcs[0].args.p_operation_key, "discount:order-1:3");
});

test("at or under the limit passes and files nothing", async () => {
  const { admin: a, rpcs } = admin(1500);
  assert.deepEqual(await enforceRoleLimit(a, INPUT), { ok: true });
  assert.equal(rpcs.length, 0);
});

test("no limit row and no role are both open", async () => {
  const { admin: a, rpcs } = admin(null);
  assert.deepEqual(await enforceRoleLimit(a, INPUT), { ok: true });
  const capped = admin(1);
  assert.deepEqual(await enforceRoleLimit(capped.admin, { ...INPUT, role: null }), { ok: true });
  assert.equal(rpcs.length + capped.rpcs.length, 0);
});
