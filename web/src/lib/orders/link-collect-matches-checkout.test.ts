/**
 * The payment-link checkout (offer accept -> /pay) must charge the same amount the direct checkout does:
 * principal plus the pass_through client surcharge when armed. Card 2026-10-09: the link charged 100,000
 * while the snapshot said 101,500.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { collectForOrderPrincipal, resolveCheckoutCollectCents, resolveCollectForPrincipal } from "./purchase-collect";

const MX = { percent: 0.036, fixed_cents: 300, tax_on_fee: 0.16 };
const LINES = [{ talentProfileId: "t1", ownerTenantId: null, talentCostCents: 100_000, totalCents: 100_000 }];

function admin(mode: "included" | "pass_through", opts?: { linesError?: boolean }) {
  const q = (table: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in"]) b[m] = () => b;
    b.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(
        table === "order_lines"
          ? opts?.linesError
            ? { data: null, error: { message: "boom" } }
            : { data: [{ talent_profile_id: "t1", owner_tenant_id: null, total_cents: 100_000, talent_cost_cents: 100_000 }], error: null }
          : { data: [], error: null }, // roster: independent talent
      ).then(resolve);
    return b;
  };
  return {
    from: (t: string) => q(t),
    rpc: async (name: string) =>
      name === "engine_platform_processing_mode"
        ? { data: { processing_mode: mode, pass_through_take_bps: 150, processor_fee_rates: { mxn: MX } }, error: null }
        : { data: "seller", error: null },
  } as never;
}

async function withEnv<T>(armed: boolean, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.COMMISSION_PROCESSING_PASS_THROUGH;
  if (armed) process.env.COMMISSION_PROCESSING_PASS_THROUGH = "1";
  else delete process.env.COMMISSION_PROCESSING_PASS_THROUGH;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.COMMISSION_PROCESSING_PASS_THROUGH;
    else process.env.COMMISSION_PROCESSING_PASS_THROUGH = prev;
  }
}

test("pass_through armed: a link for the full principal charges principal + 1.5%, the same as the direct checkout", async () => {
  await withEnv(true, async () => {
    const link = await collectForOrderPrincipal(admin("pass_through"), { tenantId: "t", orderId: "o", orderCurrency: "MXN", principalCents: 100_000, subtotalCents: 100_000 });
    const direct = await resolveCheckoutCollectCents(admin("pass_through"), { tenantId: "t", orderCurrency: "MXN", lines: LINES, subtotalCents: 100_000, totalCents: 100_000, collect: "full", depositPct: null, payInPerson: false });
    assert.equal(link, 101_500);
    assert.equal(link, direct.collectCents);
  });
});

test("included mode: the link charges the principal", async () => {
  await withEnv(false, async () => {
    assert.equal(await collectForOrderPrincipal(admin("included"), { tenantId: "t", orderId: "o", orderCurrency: "MXN", principalCents: 100_000, subtotalCents: 100_000 }), 100_000);
  });
});

test("a deposit link (a part of the order) is inflated on ITS principal, not on the order total", async () => {
  await withEnv(true, async () => {
    const part = await resolveCollectForPrincipal(admin("pass_through"), { tenantId: "t", orderCurrency: "MXN", lines: LINES, subtotalCents: 100_000, principalCents: 30_000 });
    assert.ok(part > 30_000 && part < 31_000, `deposit collect ${part}`);
  });
});

test("a failed order-lines read never guesses a fee: the link charges the principal", async () => {
  await withEnv(true, async () => {
    assert.equal(await collectForOrderPrincipal(admin("pass_through", { linesError: true }), { tenantId: "t", orderId: "o", orderCurrency: "MXN", principalCents: 100_000, subtotalCents: 100_000 }), 100_000);
  });
});

test("the link checkout charges the collect, records gross = charge / net = principal, and fixes a stale draft row", () => {
  const src = readFileSync("src/lib/payments/link-checkout.ts", "utf8");
  assert.match(src, /collectForOrderPrincipal/);
  assert.match(src, /gross_amount_cents: collectCents,/);
  assert.match(src, /platform_fee_cents: Math\.max\(0, collectCents - amountCents\),\s*\n\s*net_amount_cents: amountCents,/);
  assert.match(src, /amountCents: collectCents,/);
  assert.match(src, /\.update\(\{ gross_amount_cents: collectCents/);
  // a failed draft-row update aborts the start: no mismatched session
  assert.match(src, /if \(amountErr\) \{[\s\S]{0,320}return \{ ok: false, reason: "start_failed" \};/);
  const collect = readFileSync("src/lib/orders/purchase-collect.ts", "utf8");
  assert.match(collect, /logServerError\(`purchase-collect\.collectForOrderPrincipal/);
});
