/**
 * qa-xtenant-commission.mts — commission QA harness (2026-05-22).
 *
 * Exercises the PURE resolver `resolveBookingCommissions` across the
 * 4-level precedence hierarchy and the 3-lane split, and probes the live
 * `engine_load_commission_context` RPC against the one existing booking.
 *
 * Run:  npx tsx scripts/qa-xtenant-commission.mts
 *
 * Pure-resolver scenarios need no DB. The RPC probe reads `.env.local`.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  resolveBookingCommissions,
  isOffPlatformPaymentMethod,
  type PlatformCommissionConfig,
  type WorkspaceCommissionOverride,
  type WorkspacePlanTier,
  type PaymentMethod,
} from "../src/lib/billing/commission";

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Identical line items for every scenario so only the config varies.
//   1 unit @ $1,000 client price, $700 talent cost → workspace margin $300.
const LINE_ITEMS = [
  { units: 1, line_total_cents: 100_000, talent_cost_total_cents: 70_000 },
];

// The LIVE platform config. `default_take_bps` moved 500 → 600 in migration
// 20261007000000_commission_talent_protected_split.sql, which also set
// client_surcharge_bps 300. `plan_tier_bps` is still {} — no migration has ever
// written a per-tier key, which is why Free pays the same rate as Agency.
const LIVE_CONFIG: PlatformCommissionConfig = {
  default_take_bps: 600,
  default_take_floor_cents: 0,
  plan_tier_bps: {},
};

// A HYPOTHETICAL tier-differentiated config (NOT what's live) — used only to
// prove the resolver supports per-tier rates when plan_tier_bps is populated.
const TIERED_CONFIG: PlatformCommissionConfig = {
  default_take_bps: 600,
  default_take_floor_cents: 0,
  plan_tier_bps: { free: 0, studio: 1000, agency: 1500, network: 2000 },
};

function resolve(
  label: string,
  plan: WorkspacePlanTier,
  config: PlatformCommissionConfig,
  tenantOverride: WorkspaceCommissionOverride | null = null,
  paymentMethod: PaymentMethod = "card",
) {
  const snap = resolveBookingCommissions({
    tenantId: "qa",
    workspacePlan: plan,
    offerLineItems: LINE_ITEMS,
    currencyCode: "USD",
    paymentMethod,
    platformConfig: config,
    tenantOverride,
  });
  const lanesSum =
    snap.platform_fee_cents + snap.workspace_fee_cents + snap.talent_net_cents;
  const ok = lanesSum === snap.gross_cents;
  console.log(
    `  ${label.padEnd(46)} platform=$${(snap.platform_fee_cents / 100).toFixed(0).padStart(4)}` +
      ` workspace=$${(snap.workspace_fee_cents / 100).toFixed(0).padStart(4)}` +
      ` talent=$${(snap.talent_net_cents / 100).toFixed(0).padStart(4)}` +
      ` | from=${snap.resolved_from.padEnd(16)} lanes=gross:${ok ? "OK" : "FAIL"}`,
  );
  return snap;
}

// ── Item 2 + 3: precedence + 3-lane split ─────────────────────────────────────

console.log("\n── LIVE config (default 6%, plan_tier_bps {}) ─────────────────");
resolve("free tier", "free", LIVE_CONFIG);
resolve("agency tier", "agency", LIVE_CONFIG);
console.log(
  "  → both tiers take the SAME 6% platform_default. Free is NOT 0%.\n" +
    "    plan_tier_bps {} = ratified flat-6% (migration 20261007000000).",
);

console.log("\n── HYPOTHETICAL tiered config (proves resolver capability) ────");
resolve("free tier   (plan_tier_bps.free=0)", "free", TIERED_CONFIG);
resolve("agency tier (plan_tier_bps.agency=1500)", "agency", TIERED_CONFIG);
console.log(
  "  → with plan_tier_bps populated the resolver DOES differentiate;\n" +
    "    free→0% / agency→15%, resolved_from='plan_tier'. Capability exists.",
);

console.log("\n── Precedence level 3: tenant override beats plan_tier ────────");
resolve("agency, no override", "agency", TIERED_CONFIG);
resolve("agency, tenant override 10%", "agency", TIERED_CONFIG, {
  platform_take_bps: 1000,
  platform_take_floor_cents: null,
});
console.log("  → override flips resolved_from to 'tenant_override'.");

// ── Item 4: in-platform vs off-platform ───────────────────────────────────────

console.log("\n── Item 4: payment method classification ─────────────────────");
for (const pm of ["card", "apple_pay", "cash", "wire", "venue_paid"] as PaymentMethod[]) {
  console.log(
    `  ${pm.padEnd(12)} → ${isOffPlatformPaymentMethod(pm) ? "OFF-platform (accrual + balance bump)" : "in-platform (Stripe auto-split)"}`,
  );
}

// ── Live RPC probe ────────────────────────────────────────────────────────────

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

console.log("\n── Live engine_load_commission_context probe ──────────────────");
const { data: bookings } = await sb
  .from("agency_bookings")
  .select("id, tenant_id, source_inquiry_id");
for (const b of bookings ?? []) {
  const { data, error } = await sb.rpc("engine_load_commission_context", {
    p_booking_id: b.id,
  });
  console.log(
    `  booking ${b.id} (src_inquiry=${b.source_inquiry_id ?? "NULL"}) → ` +
      (error ? `ERR ${error.message}` : `ctx loaded: ${JSON.stringify(data).slice(0, 80)}`),
  );
}
console.log(
  "\nDone. Snapshot counts (booking_commission_snapshot / movements / balances)" +
    " are reported separately via qa-mgmt-query.\n",
);
