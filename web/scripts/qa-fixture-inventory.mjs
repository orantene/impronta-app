#!/usr/bin/env node
/**
 * qa-fixture-inventory.mjs
 *
 * Reads service-role and reports the existence of every fixture required
 * by inquiry-funnel-qa-plan-v2-2026-05-14.md §5. Read-only.
 *
 * Run: node scripts/qa-fixture-inventory.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./load-env-local.mjs";

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supa = createClient(url, key, { auth: { persistSession: false } });

const row = (status, name, detail) =>
  console.log(`${status}  ${name.padEnd(40)}  ${detail || ""}`);

async function main() {
  console.log("\n=== QA fixture inventory ===\n");
  console.log("(per inquiry-funnel-qa-plan-v2-2026-05-14.md §5)\n");

  // 1. Users (auth.users)
  const targets = [
    { name: "qa-admin@impronta.test", role: "admin" },
    { name: "qa-client-1@impronta.test", role: "client" },
    { name: "qa-client-2@impronta.test", role: "client" },
    { name: "tulum-talent-sofia@impronta.test", role: "talent" },
    { name: "owner@novacrew.demo", role: "second-tenant admin" },
  ];

  const { data: usersData, error: usersErr } = await supa.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (usersErr) {
    row("❌", "auth.admin.listUsers", usersErr.message);
  } else {
    for (const t of targets) {
      const u = usersData.users.find((u) => u.email === t.name);
      if (u) row("✅", t.name, `${t.role}  user_id=${u.id.slice(0, 8)}…`);
      else row("❌", t.name, `${t.role}  not found`);
    }
  }

  // 2. Agencies (tenants)
  const { data: agencies } = await supa
    .from("agencies")
    .select("id, slug, display_name, plan_tier, status");
  console.log("");
  if (!agencies || agencies.length === 0) row("❌", "agencies", "no rows");
  else {
    for (const a of agencies) row("✅", `agency: ${a.slug}`, `tier=${a.plan_tier}  status=${a.status}`);
  }

  // 3. Talent profiles
  console.log("");
  const { data: talents, error: talentErr } = await supa
    .from("talent_profiles")
    .select("id, profile_code, display_name, user_id, created_by_agency_id, workflow_status, visibility")
    .in("profile_code", ["TAL-00001", "TAL-00002", "TAL-92001", "TAL-92002"]);
  if (talentErr) row("❌", "talent_profiles query", talentErr.message);
  else if (!talents || talents.length === 0) {
    const { data: anyTalent } = await supa
      .from("talent_profiles")
      .select("id, profile_code, display_name, workflow_status, visibility")
      .order("profile_code")
      .limit(10);
    row("ℹ", "specific TAL-9xxxx codes", "not seeded — showing sample below");
    for (const t of (anyTalent || [])) row("ℹ", `   ${t.profile_code}`, `"${t.display_name}" ${t.workflow_status}/${t.visibility}`);
  } else {
    for (const t of talents) row("✅", `talent: ${t.profile_code}`, `"${t.display_name}" ${t.workflow_status}/${t.visibility}`);
  }

  // 4. Pitches (real columns)
  console.log("");
  const { data: pitches, error: pitchErr } = await supa.from("pitches").select("*").limit(1);
  if (pitchErr) row("❌", "pitches read", pitchErr.message);
  else if (!pitches || pitches.length === 0) row("❌", "pitches", "no rows seeded — needed for E5 walk");
  else {
    const sample = pitches[0];
    const tokenKey = Object.keys(sample).find((k) => k.toLowerCase().includes("token") || k.toLowerCase().includes("slug"));
    row("✅", "pitches", `${pitches.length} row(s); token column = ${tokenKey || "(unknown)"}`);
  }

  // 5. Inquiry messages — admin_suggested_talent card (column is `message_kind`)
  const { data: cards, error: cardsErr } = await supa
    .from("inquiry_messages")
    .select("id, card_payload, message_kind")
    .eq("message_kind", "admin_suggested_talent")
    .limit(1);
  if (cardsErr) row("❌", "admin_suggested_talent card", cardsErr.message);
  else if (!cards || cards.length === 0) row("❌", "admin_suggested_talent card", "no seeded card — step 13 verification needs one");
  else row("✅", "admin_suggested_talent card", `seeded`);

  // 6. agency_memberships — find coord, owner, talent-coord (hybrid)
  console.log("");
  const { data: coords } = await supa
    .from("agency_memberships")
    .select("profile_id, tenant_id, role, status")
    .eq("role", "coordinator")
    .eq("status", "active")
    .limit(5);
  if (!coords || coords.length === 0)
    row("❌", "coordinators", "no active coordinator memberships — slice F/G unreachable");
  else row("✅", "coordinators", `${coords.length} active coordinator membership(s)`);

  // 7. Hybrid: a profile that is BOTH talent_profile.user_id owner AND has agency_memberships row
  // (talent_profiles has no tenant_id; ownership is via created_by_agency_id)
  const { data: hybridTalents } = await supa
    .from("talent_profiles")
    .select("id, profile_code, user_id, created_by_agency_id, display_name")
    .not("user_id", "is", null)
    .limit(100);
  let hybridFound = null;
  if (hybridTalents) {
    for (const ht of hybridTalents) {
      const { data: mem } = await supa
        .from("agency_memberships")
        .select("role, status, tenant_id")
        .eq("profile_id", ht.user_id)
        .eq("status", "active")
        .maybeSingle();
      if (mem) {
        hybridFound = { talent: ht, mem };
        break;
      }
    }
  }
  if (hybridFound)
    row("✅", "talent-coord (hybrid)", `${hybridFound.talent.profile_code} also ${hybridFound.mem.role}`);
  else row("❌", "talent-coord (hybrid)", "no hybrid found — slice L can't be walked");

  // 8. Plan tier coverage
  console.log("");
  const tiers = new Set((agencies || []).map((a) => a.plan_tier).filter(Boolean));
  for (const t of ["free", "studio", "agency", "network"]) {
    if (tiers.has(t)) row("✅", `plan tier: ${t}`, "at least one agency on tier");
    else row("❌", `plan tier: ${t}`, "no agency on this tier — plan-tier QA blocked");
  }

  // 9. Recent inquiries (for in-flight transition fixtures)
  console.log("");
  const { data: walkable, error: inqErr } = await supa
    .from("inquiries")
    .select("id, status, tenant_id, current_offer_id, source_channel, created_at")
    .order("created_at", { ascending: false })
    .limit(5);
  if (inqErr) row("❌", "recent inquiries", inqErr.message);
  else if (!walkable || walkable.length === 0)
    row("❌", "recent inquiries", "no recent inquiries — submit E1–E5 cold");
  else {
    row("✅", "recent inquiries", `${walkable.length} recent`);
    for (const w of walkable) {
      row("ℹ", `   inquiry`, `${w.id.slice(0, 8)}…  status=${w.status}  src=${w.source_channel}  offer=${w.current_offer_id ? w.current_offer_id.slice(0, 8) + "…" : "none"}`);
    }
  }

  console.log("\nDone.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
