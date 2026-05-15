#!/usr/bin/env node
/**
 * qa-walk-plan-tiers.mjs — Gap 9 of QA plan v2.
 *
 * Verifies that every plan tier (free / studio / agency / network) has:
 *   - A canonical agency seed
 *   - A consistent agency_entitlements row (Layer 2 defaults)
 *   - The expected feature gates respect the tier (programmatically)
 *
 * Output: per-tier matrix of (plan_tier, entitlements row present, key
 * feature flag values). Anything inconsistent surfaces here.
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./load-env-local.mjs";

loadEnvLocal();
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

async function main() {
  console.log("\n=== Plan-tier walk ===\n");

  // 1. Tier coverage in agencies
  const { data: ags } = await admin
    .from("agencies")
    .select("id, slug, plan_tier, status")
    .order("plan_tier")
    .order("slug");

  const byTier = new Map();
  for (const a of ags) {
    if (!byTier.has(a.plan_tier)) byTier.set(a.plan_tier, []);
    byTier.get(a.plan_tier).push(a);
  }

  console.log("Agencies by plan tier:");
  for (const tier of ["free", "studio", "agency", "network"]) {
    const list = byTier.get(tier) || [];
    if (list.length === 0) {
      console.log(`  ❌ ${tier.padEnd(8)} — no agency on this tier`);
    } else {
      console.log(`  ✅ ${tier.padEnd(8)} — ${list.length} agency(ies): ${list.map((a) => a.slug).slice(0, 4).join(", ")}${list.length > 4 ? "…" : ""}`);
    }
  }

  // 2. Sample one agency per tier and check its entitlements row
  console.log("\nSample agency entitlements per tier:");
  console.log(
    "  Tier".padEnd(10),
    "Agency".padEnd(22),
    "Entitl?".padEnd(8),
    "AI".padEnd(4),
    "Adv-Anal".padEnd(9),
    "WhiteLbl".padEnd(9),
    "MaxStaff".padEnd(9),
    "MaxRost".padEnd(9),
    "MaxDom".padEnd(7),
  );
  for (const tier of ["free", "studio", "agency", "network"]) {
    const list = byTier.get(tier) || [];
    if (list.length === 0) continue;
    const sample = list[0];
    const { data: ent } = await admin
      .from("agency_entitlements")
      .select(
        "plan_key, ai_enabled, advanced_analytics, white_label_email, max_staff_count, max_active_roster_size, max_domains",
      )
      .eq("tenant_id", sample.id)
      .maybeSingle();
    if (!ent) {
      console.log(`  ${tier.padEnd(8)}  ${sample.slug.padEnd(22)}  ❌ no row`);
    } else {
      console.log(
        ` `,
        tier.padEnd(8),
        sample.slug.padEnd(22),
        "✅".padEnd(8),
        (ent.ai_enabled ? "Y" : "N").padEnd(4),
        (ent.advanced_analytics ? "Y" : "N").padEnd(9),
        (ent.white_label_email ? "Y" : "N").padEnd(9),
        String(ent.max_staff_count).padEnd(9),
        String(ent.max_active_roster_size).padEnd(9),
        String(ent.max_domains).padEnd(7),
      );
    }
  }

  // 3. Verify the talent_seat_limit column matches expected per tier
  console.log("\nTalent seat limits per tier:");
  for (const tier of ["free", "studio", "agency", "network"]) {
    const list = byTier.get(tier) || [];
    if (list.length === 0) continue;
    const slugs = list.map((a) => a.slug);
    const { data } = await admin.from("agencies").select("slug, talent_seat_limit").in("slug", slugs);
    for (const r of data) console.log(`  ${tier.padEnd(8)}  ${r.slug.padEnd(22)}  seat_limit=${r.talent_seat_limit ?? "NULL (unlimited)"}`);
  }

  console.log("\nDone.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
