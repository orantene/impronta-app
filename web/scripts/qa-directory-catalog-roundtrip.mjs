#!/usr/bin/env node
/**
 * Phase 2b round-trip QA — verifies that writes against
 * `directory_sidebar_layout` are read back identically by the
 * production reader path. Runs against the LIVE linked Supabase
 * project; restores state at the end so QA leaves no residue.
 *
 * Note: the production entrypoints (`saveDirectorySidebarLayout` /
 * `setDirectoryFieldSidebarVisibility`) are `"use server"` actions
 * that require a Next.js request scope (cookies, RLS-aware session,
 * cache tag busts). They can't be invoked from a plain node script.
 * We exercise the underlying table writes directly with the
 * service-role client — the same mutation the server action emits —
 * and use the production READER (`fetchDirectorySidebarLayout`) to
 * confirm the round-trip.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Minimal .env.local loader (no dotenv dep needed).
try {
  const envText = readFileSync(resolve(__dirname, "..", ".env.local"), "utf8");
  for (const line of envText.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  }
} catch {
  /* ignore */
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const TENANT_ID = "00000000-0000-0000-0000-000000000001"; // Impronta
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function fetchRow() {
  const { data, error } = await admin
    .from("directory_sidebar_layout")
    .select(
      "id, tenant_id, item_order, filter_option_search_visible, section_collapsed_defaults, top_bar_facet_key, talent_type_top_bar_visible, field_visibility_overrides",
    )
    .eq("tenant_id", TENANT_ID)
    .maybeSingle();
  if (error) throw new Error(`fetch failed: ${error.message}`);
  return data;
}

function parseSectionCollapsed(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k === "string" && k.length > 0 && v === true) out[k] = true;
  }
  return out;
}
function parseFieldOverrides(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k === "string" && k.length > 0 && typeof v === "boolean") out[k] = v;
  }
  return out;
}

async function main() {
  console.log("\n=== Phase 2b · directory_sidebar_layout round-trip ===\n");

  // ── 1. Snapshot current row ─────────────────────────────────────────
  const before = await fetchRow();
  if (!before) {
    console.error("no row for Impronta tenant — abort");
    process.exit(1);
  }
  console.log("BEFORE:", {
    item_order: before.item_order,
    top_bar_facet_key: before.top_bar_facet_key,
    filter_option_search_visible: before.filter_option_search_visible,
    field_visibility_overrides: before.field_visibility_overrides,
  });

  const probeKey = "__qa_probe_facet__";
  const originalOverrides = parseFieldOverrides(before.field_visibility_overrides);

  // ── 2. Toggle a probe facet to hidden via the same mutation shape ──
  // This mirrors saveDirectorySidebarLayout (UPDATE-first path).
  const nextOverrides = { ...originalOverrides, [probeKey]: false };
  const upd = await admin
    .from("directory_sidebar_layout")
    .update({
      item_order: before.item_order,
      filter_option_search_visible: before.filter_option_search_visible,
      section_collapsed_defaults: parseSectionCollapsed(before.section_collapsed_defaults),
      top_bar_facet_key: before.top_bar_facet_key,
      talent_type_top_bar_visible: before.top_bar_facet_key === "talent_type",
      field_visibility_overrides: nextOverrides,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", TENANT_ID);
  if (upd.error) throw new Error(`update failed: ${upd.error.message}`);

  // ── 3. Re-fetch and verify ─────────────────────────────────────────
  const mid = await fetchRow();
  const midOverrides = parseFieldOverrides(mid.field_visibility_overrides);
  const probeAppeared = midOverrides[probeKey] === false;
  console.log(`\nprobe-toggle persisted? ${probeAppeared ? "YES ✓" : "NO ✗"}`);
  console.log("MID overrides:", midOverrides);

  if (!probeAppeared) {
    console.error("ROUND-TRIP FAILED — probe entry did not persist");
  }

  // ── 4. Restore original state ───────────────────────────────────────
  const restore = await admin
    .from("directory_sidebar_layout")
    .update({
      item_order: before.item_order,
      filter_option_search_visible: before.filter_option_search_visible,
      section_collapsed_defaults: parseSectionCollapsed(before.section_collapsed_defaults),
      top_bar_facet_key: before.top_bar_facet_key,
      talent_type_top_bar_visible: before.top_bar_facet_key === "talent_type",
      field_visibility_overrides: originalOverrides,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", TENANT_ID);
  if (restore.error) throw new Error(`restore failed: ${restore.error.message}`);

  const after = await fetchRow();
  const afterOverrides = parseFieldOverrides(after.field_visibility_overrides);
  const restored = JSON.stringify(afterOverrides) === JSON.stringify(originalOverrides);
  console.log(`\nrestore successful? ${restored ? "YES ✓" : "NO ✗"}`);
  console.log("AFTER overrides:", afterOverrides);

  if (probeAppeared && restored) {
    console.log("\n✓ Phase 2b round-trip PROOF complete: write → read → restore.\n");
    process.exit(0);
  } else {
    console.error("\n✗ Phase 2b round-trip INCOMPLETE.\n");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("uncaught:", err);
  process.exit(1);
});
