/**
 * export-stock-manifest.ts — write the lifestyle stock manifest to
 * docs/plans/templates/stock-manifest.json so the licence trail lives in git
 * without the bytes (docs/plans/templates/01-plan.md §3.1).
 *
 *   npx tsx scripts/export-stock-manifest.ts            (from web/)
 *
 * Read-only. Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

async function main() {
  const { loadEnvLocal } = await import("./load-env-local.mjs");
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb
    .from("platform_stock_images")
    .select("id, asset_id, business_type, family, role, source, licence, prompt, supplier, palette_hint, alt_es, alt_en, sort_order, retired_at, created_at")
    .order("family")
    .order("business_type")
    .order("role")
    .order("sort_order");
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const byType = new Map<string, unknown[]>();
  for (const r of rows as Array<Record<string, unknown>>) {
    const k = `${r.family}/${r.business_type ?? "_family"}`;
    byType.set(k, [...(byType.get(k) ?? []), r]);
  }
  const out = {
    exportedAt: new Date().toISOString(),
    total: rows.length,
    live: rows.filter((r) => !(r as { retired_at: string | null }).retired_at).length,
    /** Flat list, one row per photo (the shape a reader expects first). */
    rows,
    /** The same rows grouped `family/business_type` (`_family` = the family pack). */
    packs: Object.fromEntries([...byType.entries()]),
  };
  const dest = resolve("../docs/plans/templates/stock-manifest.json");
  mkdirSync(resolve("../docs/plans/templates"), { recursive: true });
  writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote ${dest}: ${out.total} rows (${out.live} live) across ${byType.size} packs`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
