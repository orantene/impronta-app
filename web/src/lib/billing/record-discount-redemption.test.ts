import assert from "node:assert/strict";
import test from "node:test";

import { recordDiscountRedemption, redemptionLedgerKey } from "./record-discount-redemption";

/** Minimal fake of the three calls the recorder makes. */
function fakeClient(opts: { discountId?: string | null; priorRows?: number }) {
  const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const chain = (data: unknown, count = 0) => {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.maybeSingle = async () => ({ data });
    q.then = (res: (v: unknown) => void) => res({ count, data: null });
    return q;
  };
  const client = {
    from: (t: string) =>
      t === "product_discounts"
        ? chain(opts.discountId === null ? null : { id: opts.discountId ?? "disc-1" })
        : chain(null, opts.priorRows ?? 0),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args });
      return { data: true, error: null };
    },
  };
  return { rpcs, client: client as never };
}

const sub = (over: Record<string, unknown> = {}) =>
  ({
    id: "sub_1",
    metadata: { talent_profile_id: "tp-1", user_id: "u-1" },
    discounts: [{ id: "di_1", end: null, source: { coupon: { id: "cpn_1", percent_off: 10 } } }],
    ...over,
  }) as never;

test("TUL-1872: a code on an upgraded subscription is counted, keyed by subscription and coupon", async () => {
  const { rpcs, client } = fakeClient({});
  await recordDiscountRedemption(sub(), "evt_resync", client);
  assert.equal(rpcs.length, 1);
  assert.equal(rpcs[0].args.p_stripe_event_id, redemptionLedgerKey("sub_1", "cpn_1"));
  assert.equal(rpcs[0].args.p_stripe_coupon_id, "cpn_1");
  assert.equal(rpcs[0].args.p_subject_type, "talent");
});

test("a different event for the same subscription uses the same key, so the RPC counts it once", async () => {
  const a = fakeClient({});
  const b = fakeClient({});
  await recordDiscountRedemption(sub(), "evt_checkout", a.client);
  await recordDiscountRedemption(sub(), "evt_invoice", b.client);
  assert.equal(a.rpcs[0].args.p_stripe_event_id, b.rpcs[0].args.p_stripe_event_id);
});

test("a subscription already in the ledger (older event-keyed row) is not counted again", async () => {
  const { rpcs, client } = fakeClient({ priorRows: 1 });
  await recordDiscountRedemption(sub(), "evt_renewal", client);
  assert.equal(rpcs.length, 0);
});

test("no discount, an unexpanded discount, or no subject records nothing", async () => {
  const { rpcs, client } = fakeClient({});
  await recordDiscountRedemption(sub({ discounts: [] }), "e", client);
  await recordDiscountRedemption(sub({ discounts: ["di_1"] }), "e", client);
  await recordDiscountRedemption(sub({ metadata: {} }), "e", client);
  assert.equal(rpcs.length, 0);
});
