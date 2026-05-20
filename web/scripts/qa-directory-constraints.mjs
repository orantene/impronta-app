#!/usr/bin/env node
// Lane G3+G7 verification probe.
//
// Exercises both audit gaps end-to-end against the live (linked) Supabase:
//
//   G7: directory_sidebar_layout
//       INSERT a second-tenant row → confirm no CHECK (id=1) /
//       primary-key violation. Cleanup at the end.
//
//   G3: field_definitions clone-INSERT
//       Pick a canonical row, clone it to a fake tenant_id with the
//       same key → confirm no duplicate-key on UNIQUE(key). Cleanup.
//
// Uses the service role; bypasses RLS. Run via:
//   node --env-file=.env.local scripts/qa-directory-constraints.mjs
//
// Exits 1 on any unexpected failure so it's CI-safe.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const s = createClient(url, key, { auth: { persistSession: false } });

// Synthetic UUIDs that won't collide with anything real. agencies has FK
// constraints from both tables, so we provision a throwaway agency row
// for the probe and remove it at the end.
const FAKE_TENANT = "00000000-0000-0000-0000-0000ffff0001";

let failures = 0;
function ok(label) { console.log(`  ✓ ${label}`); }
function fail(label, err) {
  failures++;
  console.error(`  ✗ ${label}: ${err?.message ?? err}`);
}

async function withFakeAgency(fn) {
  // Insert a throwaway agency. If it already exists from a prior aborted
  // run, just reuse it.
  const ins = await s.from("agencies").insert({
    id: FAKE_TENANT,
    display_name: "G3+G7 probe (delete me)",
    slug: "g3g7-probe-delete-me",
  });
  if (ins.error && !/duplicate key/i.test(ins.error.message)) {
    throw new Error(`could not create probe agency: ${ins.error.message}`);
  }
  try {
    await fn();
  } finally {
    // Best-effort cleanup. Children cascade for fields (ON DELETE CASCADE)
    // and we delete the sidebar row explicitly.
    await s.from("directory_sidebar_layout").delete().eq("tenant_id", FAKE_TENANT);
    await s.from("field_definitions").delete().eq("tenant_id", FAKE_TENANT);
    await s.from("agencies").delete().eq("id", FAKE_TENANT);
  }
}

async function probeG7() {
  console.log("G7 — directory_sidebar_layout multi-tenant INSERT");

  // Pre-cleanup: drop any leftover row for FAKE_TENANT.
  await s.from("directory_sidebar_layout").delete().eq("tenant_id", FAKE_TENANT);

  const r = await s.from("directory_sidebar_layout").insert({
    tenant_id: FAKE_TENANT,
    item_order: ["__filter_search__"],
    filter_option_search_visible: true,
  });

  if (r.error) {
    fail("INSERT second-tenant row", r.error);
    return;
  }
  ok("INSERT second-tenant row succeeded (no id=1 / pkey violation)");

  // Now confirm idempotent UPDATE-by-tenant still works.
  const upd = await s
    .from("directory_sidebar_layout")
    .update({ filter_option_search_visible: false })
    .eq("tenant_id", FAKE_TENANT)
    .select("tenant_id")
    .maybeSingle();
  if (upd.error || !upd.data) {
    fail("UPDATE by tenant_id", upd.error || "no row returned");
  } else {
    ok("UPDATE by tenant_id resolves the row correctly");
  }

  // Insert a 3rd-tenant placeholder to also confirm > 2 rows coexist.
  const FAKE2 = "00000000-0000-0000-0000-0000ffff0002";
  await s.from("agencies").insert({ id: FAKE2, display_name: "G7 probe #2", slug: "g7-probe-2" });
  await s.from("directory_sidebar_layout").delete().eq("tenant_id", FAKE2);
  const r3 = await s.from("directory_sidebar_layout").insert({
    tenant_id: FAKE2,
    item_order: ["__filter_search__"],
    filter_option_search_visible: true,
  });
  if (r3.error) {
    fail("INSERT 3rd-tenant row", r3.error);
  } else {
    ok("INSERT 3rd-tenant row succeeded (no singleton enforcement remaining)");
  }
  // Cleanup #2.
  await s.from("directory_sidebar_layout").delete().eq("tenant_id", FAKE2);
  await s.from("agencies").delete().eq("id", FAKE2);
}

async function probeG3() {
  console.log("G3 — field_definitions clone-INSERT to tenant-local override");

  // Pick a canonical row to clone.
  const canon = await s
    .from("field_definitions")
    .select(
      "field_group_id, key, label_en, label_es, help_en, help_es, value_type, required_level, public_visible, internal_only, card_visible, profile_visible, filterable, directory_filter_visible, directory_filter_sort_order, searchable, ai_visible, editable_by_talent, editable_by_staff, editable_by_admin, active, sort_order, taxonomy_kind, config",
    )
    .is("tenant_id", null)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (canon.error || !canon.data) {
    fail("pick canonical row", canon.error || "no canonical row found");
    return;
  }
  ok(`picked canonical key="${canon.data.key}"`);

  // Clean any leftover from prior runs.
  await s.from("field_definitions")
    .delete()
    .eq("tenant_id", FAKE_TENANT)
    .eq("key", canon.data.key);

  // The actual clone-INSERT path (matches setFieldCardVisible).
  const ins = await s.from("field_definitions").insert({
    ...canon.data,
    card_visible: !canon.data.card_visible,
    tenant_id: FAKE_TENANT,
  });

  if (ins.error) {
    fail(
      `clone-INSERT (tenant=${FAKE_TENANT.slice(-4)}, key="${canon.data.key}")`,
      ins.error,
    );
    return;
  }
  ok("clone-INSERT succeeded — partial UNIQUE indexes allow per-tenant duplicate of canonical key");

  // Re-cloning the same key for the same tenant must collide (per-tenant unique).
  const dup = await s.from("field_definitions").insert({
    ...canon.data,
    card_visible: !canon.data.card_visible,
    tenant_id: FAKE_TENANT,
  });
  if (!dup.error) {
    fail(
      "second clone-INSERT for same (tenant, key) should have failed but didn't",
      "no error",
    );
  } else if (/duplicate|unique/i.test(dup.error.message)) {
    ok("second clone-INSERT for same (tenant, key) correctly rejected");
  } else {
    fail("second clone-INSERT rejected with wrong error", dup.error);
  }
}

(async () => {
  await withFakeAgency(async () => {
    await probeG7();
    await probeG3();
  });
  console.log("");
  if (failures > 0) {
    console.error(`FAILED (${failures} probe assertion(s))`);
    process.exit(1);
  }
  console.log("ALL PROBES PASS");
})();
