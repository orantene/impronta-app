#!/usr/bin/env node
/**
 * CI guard: the public compare table may not contradict what the product enforces.
 *
 * WHY: `product_features` is hand-authored marketing copy that states enforced
 * numbers. It has drifted three times that we know of. On 2026-09-02 it said
 * Free had 1 team seat (enforced 2) and Agency "Up to 8" (enforced unlimited).
 * Those were corrected by hand. On 2026-09-05, a different set of rows still
 * said Studio had "Up to 50" people profiles against an enforced 15 — while a
 * NEIGHBOURING row in the same column said "Up to 15 talent profiles". The page
 * contradicted itself.
 *
 * Fixing values does not stop the next author typing a new one. This does.
 *
 * The comparison logic lives in `src/lib/pricing/enforced-plan-facts.ts` and is
 * unit-tested without a database; this script only supplies the live rows.
 *
 * SKIPPED, not failed, without Supabase credentials — the same posture as
 * check-capability-keys.mjs. A missing credential is not drift, and a guard
 * that fails on absent config gets disabled by the third person who hits it.
 *
 * Exit codes: 0 ok or skipped, 1 drift detected, 2 internal error.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

if (!url || !key) {
  console.log("compare-table drift: skipped (no Supabase credentials)");
  process.exit(0);
}

const { findCompareTableDrift } = await import(
  "../src/lib/pricing/enforced-plan-facts.ts"
);

const SELECT =
  "label,value_text,included,product_tiers!inner(slug,product_packages!inner(family))";

try {
  const res = await fetch(
    `${url}/rest/v1/product_features?select=${encodeURIComponent(SELECT)}` +
      `&product_tiers.product_packages.family=eq.workspace`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );

  if (!res.ok) {
    console.log(`compare-table drift: skipped (REST ${res.status})`);
    process.exit(0);
  }

  const raw = await res.json();
  const rows = raw.map((r) => ({
    tierSlug: r.product_tiers?.slug ?? "",
    label: r.label ?? "",
    valueText: r.value_text ?? null,
    included: r.included === true,
  }));

  const drift = findCompareTableDrift(rows);

  if (drift.length > 0) {
    console.error(
      `\nFAIL: the public compare table states ${drift.length} value(s) the product does not enforce:\n`,
    );
    for (const d of drift) {
      console.error(
        `  ${d.tierSlug.padEnd(8)} ${d.label.padEnd(28)} says "${d.claimed}", enforces "${d.enforced}"`,
      );
    }
    console.error(
      "\nFix the product_features row, or change what is enforced. Do not change this guard.\n",
    );
    process.exit(1);
  }

  // ── Second check: the displayed ticket fee must match live config ─────────
  //
  // `ticket-fee-comparison.ts` keeps a FALLBACK rate for when the config read
  // fails. A fallback that has drifted from the live value is worse than none:
  // it renders a confidently wrong fee on a public page exactly when the read
  // is broken and nobody is watching. This is also the specific rule a typed
  // 0.06 on /pricing violated on the day it was made.
  const cfgRes = await fetch(
    `${url}/rest/v1/platform_commission_config?select=default_take_bps&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );

  if (cfgRes.ok) {
    const cfg = await cfgRes.json();
    const liveBps = cfg?.[0]?.default_take_bps;
    const { TULALA_RATE_FALLBACK } = await import(
      "../src/lib/marketing/ticket-fee-comparison.ts"
    );
    const fallbackBps = Math.round(TULALA_RATE_FALLBACK * 10_000);

    if (typeof liveBps === "number" && liveBps !== fallbackBps) {
      console.error(
        `\nFAIL: the ticket fee fallback has drifted from live config.\n\n` +
          `  ticket-fee-comparison.ts TULALA_RATE_FALLBACK = ${fallbackBps} bps\n` +
          `  platform_commission_config.default_take_bps  = ${liveBps} bps\n\n` +
          `The page reads live config, so customers see the right number today, ` +
          `but the fallback renders when that read fails. Update the constant.\n`,
      );
      process.exit(1);
    }
    console.log(`ticket fee fallback: ${fallbackBps} bps, matches live config`);
  } else {
    console.log(`ticket fee fallback: skipped (REST ${cfgRes.status})`);
  }

  console.log(`compare-table drift: ${rows.length} row(s) checked, none contradict enforcement`);
  process.exit(0);
} catch (err) {
  console.error(
    `internal error: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(2);
}
