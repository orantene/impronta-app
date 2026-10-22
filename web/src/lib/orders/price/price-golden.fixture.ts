/**
 * Fixtures for the golden invariance table (TUL-1298). Two paths compute the SAME selection:
 *
 *   referenceCharge  the charging steps exactly as `createPurchase` runs them
 *                    (pricePurchase -> resolvePurchasePolicy -> subtotal - discount -> resolveCheckoutCollectCents)
 *   moduleCharge     the price module (`priceSelection`), which display surfaces render
 *
 * No database: the pass-through code runs for real against a small fake client (same shape as
 * link-collect-matches-checkout.test.ts).
 */
import { resolveCheckoutCollectCents } from "@/lib/orders/purchase-collect";
import { resolvePurchasePolicy, type OfferingPolicy, type PaymentChoice } from "@/lib/orders/purchase-policy";
import { pricePurchase, type PricedAddon, type PricedOffering, type PricedVariant } from "@/lib/orders/purchase-pricing";
import type { SelectionContext } from "./context.server";
import { priceSelection } from "./selection.server";
import type { SelectionLine } from "./types";

export type FeeMode = "off" | "seller" | "client";

export type GoldenInput = {
  id: string;
  lines: SelectionLine[];
  choice: PaymentChoice;
  /** What the promo engine returned. */
  discountCents: number;
  fee: FeeMode;
};

export type Charged = { subtotalCents: number; totalCents: number; baseCollectCents: number; collectCents: number };

const TENANT = "ten";
// fee-config-ok: golden fixture pins the MX card rate on purpose so a fee-config change shows up as a golden diff
const MX = { percent: 0.036, fixed_cents: 300, tax_on_fee: 0.16 };

function offering(id: string, amountCents: number | null, talent: string): PricedOffering {
  return { offeringId: id, label: id, amountCents, priceType: "fixed", talentProfileId: talent, ownerTenantId: null, talentCostCents: amountCents ?? 0, currency: "MXN" };
}
function policy(id: string, reserveMode: OfferingPolicy["reserveMode"], depositPct: number | null, allowPayInPerson = false): OfferingPolicy {
  return { offeringId: id, status: "published", tenantId: TENANT, reserveMode, depositPct, allowPayInPerson, requireAccountToBook: false, cancellationHours: null };
}

export const CONTEXT: SelectionContext = {
  tenantId: TENANT,
  currency: "MXN",
  travelFeeOnDayCents: 0,
  catalog: {
    offerings: new Map([
      offering("svc", 10_000, "t1"),
      offering("dep", 20_000, "t1"),
      offering("dep2", 15_000, "t2"),
      offering("odd", 1_999, "t1"),
      offering("big", 33_333, "t1"),
      offering("var", 5_000, "t1"),
      offering("free", 5_000, "t1"),
      offering("door", 8_000, "t1"),
    ].map((o) => [o.offeringId, o] as const)),
    variants: new Map<string, PricedVariant>([
      ["vip", { variantId: "vip", offeringId: "var", label: "VIP", amountCents: 8_000 }],
      // TUL-1301: a tier with NO price of its own is charged the offering's price (5000).
      ["std", { variantId: "std", offeringId: "var", label: "Standard", amountCents: null }],
    ]),
    addons: new Map<string, PricedAddon>([
      ["a1", { addonId: "a1", offeringId: "svc", label: "Gel", amountCents: 2_000 }],
      ["a2", { addonId: "a2", offeringId: "svc", label: "Art", amountCents: 1_500 }],
    ]),
    policies: new Map([
      policy("svc", "full", null),
      policy("dep", "deposit", 30),
      policy("dep2", "deposit", 50),
      policy("odd", "deposit", 50),
      policy("big", "deposit", 30),
      policy("var", "full", null),
      policy("free", "free", null),
      policy("door", "full", null, true),
    ].map((p) => [p.offeringId, p] as const)),
  },
};

export const CASES: GoldenInput[] = [
  { id: "01 single full", lines: [{ offeringId: "svc", units: 1 }], choice: "full", discountCents: 0, fee: "off" },
  { id: "02 single full, seller pays card fee", lines: [{ offeringId: "svc", units: 1 }], choice: "full", discountCents: 0, fee: "seller" },
  { id: "03 single full, client pays card fee", lines: [{ offeringId: "svc", units: 1 }], choice: "full", discountCents: 0, fee: "client" },
  { id: "04 three units", lines: [{ offeringId: "svc", units: 3 }], choice: "full", discountCents: 0, fee: "off" },
  { id: "05 one add-on once per line", lines: [{ offeringId: "svc", units: 1, addonIds: ["a1"] }], choice: "full", discountCents: 0, fee: "off" },
  { id: "06 two add-ons, 2 units (add-ons once per line)", lines: [{ offeringId: "svc", units: 2, addonIds: ["a1", "a2"] }], choice: "full", discountCents: 0, fee: "off" },
  { id: "07 variant with its own price", lines: [{ offeringId: "var", units: 1, variantId: "vip" }], choice: "full", discountCents: 0, fee: "off" },
  { id: "08 variant with no price charges the offering price (TUL-1301)", lines: [{ offeringId: "var", units: 2, variantId: "std" }], choice: "full", discountCents: 0, fee: "off" },
  { id: "09 promo 20% on 10000 (TUL-1304 sheet case)", lines: [{ offeringId: "svc", units: 1 }], choice: "full", discountCents: 2_000, fee: "off" },
  { id: "10 promo 20% with seller card fee (10150 shown vs 8120 charged)", lines: [{ offeringId: "svc", units: 1 }], choice: "full", discountCents: 2_000, fee: "seller" },
  { id: "11 promo that makes it free", lines: [{ offeringId: "svc", units: 1 }], choice: "full", discountCents: 10_000, fee: "off" },
  { id: "12 deposit 30%", lines: [{ offeringId: "dep", units: 1 }], choice: "deposit", discountCents: 0, fee: "off" },
  { id: "13 deposit 30% with seller card fee", lines: [{ offeringId: "dep", units: 1 }], choice: "deposit", discountCents: 0, fee: "seller" },
  { id: "14 deposit 30% with client-paid card fee", lines: [{ offeringId: "dep", units: 1 }], choice: "deposit", discountCents: 0, fee: "client" },
  { id: "15 deposit floor: 1999 at 50% charges 999 (rail showed 1000)", lines: [{ offeringId: "odd", units: 1 }], choice: "deposit", discountCents: 0, fee: "off" },
  { id: "16 deposit floor: 33333 at 30%", lines: [{ offeringId: "big", units: 1 }], choice: "deposit", discountCents: 0, fee: "off" },
  { id: "17 deposit on the promo total", lines: [{ offeringId: "dep", units: 1 }], choice: "deposit", discountCents: 5_000, fee: "off" },
  { id: "18 deposit on the promo total with seller fee", lines: [{ offeringId: "dep", units: 1 }], choice: "deposit", discountCents: 5_000, fee: "seller" },
  { id: "19 two lines, two payees, full", lines: [{ offeringId: "svc", units: 1 }, { offeringId: "dep2", units: 1 }], choice: "full", discountCents: 0, fee: "off" },
  { id: "20 two lines, two payees, full, seller fee", lines: [{ offeringId: "svc", units: 1 }, { offeringId: "dep2", units: 1 }], choice: "full", discountCents: 0, fee: "seller" },
  { id: "21 two deposit lines use the smallest % (30)", lines: [{ offeringId: "dep", units: 1 }, { offeringId: "dep2", units: 1 }], choice: "deposit", discountCents: 0, fee: "off" },
  { id: "22 two deposit lines, seller fee", lines: [{ offeringId: "dep", units: 1 }, { offeringId: "dep2", units: 1 }], choice: "deposit", discountCents: 0, fee: "seller" },
  { id: "23 two deposit lines with a promo", lines: [{ offeringId: "dep", units: 1 }, { offeringId: "dep2", units: 2 }], choice: "deposit", discountCents: 3_500, fee: "off" },
  { id: "24 pay in person charges nothing now", lines: [{ offeringId: "door", units: 1 }], choice: "in_person", discountCents: 0, fee: "seller" },
  { id: "25 free reserve charges nothing now", lines: [{ offeringId: "free", units: 1 }], choice: "full", discountCents: 0, fee: "seller" },
  { id: "26 full with add-ons and promo and client fee", lines: [{ offeringId: "svc", units: 2, addonIds: ["a1"] }], choice: "full", discountCents: 1_100, fee: "client" },
  { id: "27 variant + promo + seller fee", lines: [{ offeringId: "var", units: 1, variantId: "vip" }], choice: "full", discountCents: 800, fee: "seller" },
  { id: "28 deposit not offered is refused (full-pay offering)", lines: [{ offeringId: "svc", units: 1 }], choice: "deposit", discountCents: 0, fee: "off" },
  { id: "29 fractional quantity is refused", lines: [{ offeringId: "svc", units: 0.5 }], choice: "full", discountCents: 0, fee: "off" },
  { id: "30 variant required when the offering has tiers", lines: [{ offeringId: "var", units: 1 }], choice: "full", discountCents: 0, fee: "off" },
];

function fakeAdmin(fee: FeeMode) {
  const q = () => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in"]) b[m] = () => b;
    b.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
    return b;
  };
  return {
    from: () => q(),
    rpc: async (name: string) =>
      name === "engine_platform_processing_mode"
        ? { data: { processing_mode: fee === "off" ? "included" : "pass_through", pass_through_take_bps: 150, processor_fee_rates: { mxn: MX } }, error: null }
        : { data: fee === "client" ? "client" : "seller", error: null },
  } as never;
}

export async function withFee<T>(fee: FeeMode, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.COMMISSION_PROCESSING_PASS_THROUGH;
  if (fee !== "off") process.env.COMMISSION_PROCESSING_PASS_THROUGH = "1";
  else delete process.env.COMMISSION_PROCESSING_PASS_THROUGH;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.COMMISSION_PROCESSING_PASS_THROUGH;
    else process.env.COMMISSION_PROCESSING_PASS_THROUGH = prev;
  }
}

/** A refusal is recorded by its reason so the table also pins what is NOT chargeable. */
export type Outcome = { ok: true; charged: Charged } | { ok: false; reason: string };

/** The charging steps, exactly as `createPurchase` runs them. */
export async function referenceCharge(c: GoldenInput): Promise<Outcome> {
  return withFee(c.fee, async () => {
    const { catalog } = CONTEXT;
    const priced = pricePurchase(
      c.lines.map((l) => ({ offeringId: l.offeringId, units: l.units, variantId: l.variantId ?? null, addonIds: [...(l.addonIds ?? [])] })),
      { offerings: catalog.offerings, variants: catalog.variants, addons: catalog.addons },
    );
    if (!priced.ok) return { ok: false, reason: priced.reason };
    const policy = resolvePurchasePolicy(
      { clientOrderKey: "k", tenantId: TENANT, actorUserId: null, paymentChoice: c.choice, lines: c.lines.map((l) => ({ offeringId: l.offeringId, units: l.units })) },
      catalog.policies,
    );
    if (!policy.ok) return { ok: false, reason: policy.reason };
    const totalCents = priced.subtotalCents - c.discountCents;
    const r = await resolveCheckoutCollectCents(fakeAdmin(c.fee), {
      tenantId: TENANT, orderCurrency: "MXN", lines: priced.lines, subtotalCents: priced.subtotalCents, totalCents,
      collect: policy.collect, depositPct: policy.depositPct, payInPerson: policy.payInPerson,
    });
    return { ok: true, charged: { subtotalCents: priced.subtotalCents, totalCents, baseCollectCents: r.baseCollectCents, collectCents: r.collectCents } };
  });
}

/** The same selection through the price module. */
export async function moduleCharge(c: GoldenInput): Promise<Outcome> {
  return withFee(c.fee, async () => {
    const r = await priceSelection(
      fakeAdmin(c.fee), CONTEXT,
      { lines: c.lines, paymentChoice: c.choice, discountCents: c.discountCents },
    );
    if (!r.ok) return { ok: false, reason: r.reason };
    const b = r.breakdown;
    return { ok: true, charged: { subtotalCents: b.subtotalCents, totalCents: b.totalCents, baseCollectCents: b.principalCents, collectCents: b.collectCents } };
  });
}
