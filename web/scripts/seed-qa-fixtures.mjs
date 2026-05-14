#!/usr/bin/env node
/**
 * seed-qa-fixtures.mjs
 *
 * Idempotently seeds the missing fixtures called out in
 * `web/docs/qa-evidence/2026-05-14/fixtures.md`:
 *
 *   1. A studio-tier agency  (qa-studio-tenant)
 *   2. A network-tier agency (qa-network-tenant)
 *   3. A coordinator user in `impronta` agency (qa-coord-1)
 *   4. A talent-coord hybrid (Sofia gets agency_memberships role=coordinator)
 *   5. A seeded `admin_suggested_talent` chat-card row on the in-flight inquiry
 *
 * SKIPPED:
 *   - owner@novacrew.demo (second-tenant admin) — needs explicit decision on tenant model
 *
 * Run: node scripts/seed-qa-fixtures.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./load-env-local.mjs";

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing env");
  process.exit(1);
}
const supa = createClient(url, key, { auth: { persistSession: false } });

const log = (status, msg) => console.log(`${status}  ${msg}`);

async function main() {
  console.log("\n=== Seeding QA fixtures ===\n");

  // ------------------------------------------------------------------
  // 1 + 2. Studio + Network agencies
  // ------------------------------------------------------------------
  for (const tier of ["studio", "network"]) {
    const slug = `qa-${tier}-tenant`;
    const { data: existing } = await supa
      .from("agencies")
      .select("id, plan_tier")
      .eq("slug", slug)
      .maybeSingle();
    if (existing) {
      if (existing.plan_tier !== tier) {
        const { error } = await supa.from("agencies").update({ plan_tier: tier }).eq("id", existing.id);
        if (error) log("❌", `${slug}: update plan_tier failed: ${error.message}`);
        else log("🔄", `${slug}: updated to plan_tier=${tier}`);
      } else {
        log("✅", `${slug}: already exists at tier=${tier}`);
      }
    } else {
      const { data: created, error } = await supa
        .from("agencies")
        .insert({
          slug,
          display_name: `QA ${tier} tenant`,
          plan_tier: tier,
          status: "active",
        })
        .select("id")
        .single();
      if (error) log("❌", `${slug}: insert failed: ${error.message}`);
      else log("➕", `${slug}: created id=${created.id.slice(0, 8)}…`);
    }
  }

  // ------------------------------------------------------------------
  // 3. Coordinator user in impronta agency.
  //    Strategy: promote qa-client-2 to coordinator role in `impronta`.
  //    That keeps the user count stable and gives us a real coord user.
  // ------------------------------------------------------------------
  const { data: imp } = await supa.from("agencies").select("id").eq("slug", "impronta").maybeSingle();
  if (!imp) {
    log("❌", "impronta agency not found — cannot seed coord");
  } else {
    const { data: users } = await supa.auth.admin.listUsers({ page: 1, perPage: 200 });
    const coord = users.users.find((u) => u.email === "qa-client-2@impronta.test");
    if (!coord) {
      log("❌", "qa-client-2 not found — cannot promote to coord");
    } else {
      const { data: existingMem } = await supa
        .from("agency_memberships")
        .select("id, role, status")
        .eq("profile_id", coord.id)
        .eq("tenant_id", imp.id)
        .maybeSingle();
      if (existingMem) {
        if (existingMem.role !== "coordinator" || existingMem.status !== "active") {
          const { error } = await supa
            .from("agency_memberships")
            .update({ role: "coordinator", status: "active", accepted_at: new Date().toISOString() })
            .eq("id", existingMem.id);
          if (error) log("❌", `coord membership update failed: ${error.message}`);
          else log("🔄", `qa-client-2 → impronta: role=coordinator (was ${existingMem.role}/${existingMem.status})`);
        } else {
          log("✅", "qa-client-2 already coordinator in impronta");
        }
      } else {
        const { error } = await supa.from("agency_memberships").insert({
          profile_id: coord.id,
          tenant_id: imp.id,
          role: "coordinator",
          status: "active",
          accepted_at: new Date().toISOString(),
        });
        if (error) log("❌", `coord membership insert failed: ${error.message}`);
        else log("➕", "qa-client-2 → impronta: role=coordinator");
      }
    }
  }

  // ------------------------------------------------------------------
  // 4. Talent-coord hybrid: Sofia (TAL-92001) also gets coordinator role in impronta.
  // ------------------------------------------------------------------
  if (imp) {
    const { data: sofia } = await supa
      .from("talent_profiles")
      .select("user_id, profile_code")
      .eq("profile_code", "TAL-92001")
      .maybeSingle();
    if (!sofia || !sofia.user_id) {
      log("❌", "Sofia (TAL-92001) not found or has no user_id — hybrid blocked");
    } else {
      const { data: existingMem } = await supa
        .from("agency_memberships")
        .select("id, role, status")
        .eq("profile_id", sofia.user_id)
        .eq("tenant_id", imp.id)
        .maybeSingle();
      if (existingMem) {
        if (existingMem.role !== "coordinator" || existingMem.status !== "active") {
          const { error } = await supa
            .from("agency_memberships")
            .update({ role: "coordinator", status: "active", accepted_at: new Date().toISOString() })
            .eq("id", existingMem.id);
          if (error) log("❌", `hybrid update failed: ${error.message}`);
          else log("🔄", `Sofia → impronta: role=coordinator (hybrid talent-coord)`);
        } else {
          log("✅", "Sofia already hybrid (coordinator in impronta)");
        }
      } else {
        const { error } = await supa.from("agency_memberships").insert({
          profile_id: sofia.user_id,
          tenant_id: imp.id,
          role: "coordinator",
          status: "active",
          accepted_at: new Date().toISOString(),
        });
        if (error) log("❌", `hybrid insert failed: ${error.message}`);
        else log("➕", "Sofia → impronta: role=coordinator (hybrid talent-coord)");
      }
    }
  }

  // ------------------------------------------------------------------
  // 5. Seed an admin_suggested_talent chat-card row on the newest in-flight inquiry.
  // ------------------------------------------------------------------
  const { data: target } = await supa
    .from("inquiries")
    .select("id, tenant_id, status")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!target) {
    log("❌", "no recent inquiry to seed card onto");
  } else {
    const { data: existingCard } = await supa
      .from("inquiry_messages")
      .select("id")
      .eq("inquiry_id", target.id)
      .eq("message_kind", "admin_suggested_talent")
      .maybeSingle();
    if (existingCard) {
      log("✅", `admin_suggested_talent card already on inquiry ${target.id.slice(0, 8)}…`);
    } else {
      // Need a real talent_profile to suggest
      const { data: someTalent } = await supa
        .from("talent_profiles")
        .select("id, profile_code, display_name")
        .eq("profile_code", "TAL-92002")
        .maybeSingle();
      const payload = someTalent
        ? {
            talent_profile_id: someTalent.id,
            profile_code: someTalent.profile_code,
            display_name: someTalent.display_name,
            reason: "QA-seeded card to verify rendering path.",
            suggested_at: new Date().toISOString(),
          }
        : { note: "QA placeholder — no talent payload" };
      // sender_user_id null insert requires service role (RLS)
      const { error } = await supa.from("inquiry_messages").insert({
        inquiry_id: target.id,
        tenant_id: target.tenant_id,
        thread_type: "group",
        message_kind: "admin_suggested_talent",
        card_payload: payload,
        body: "Suggested: " + (someTalent?.display_name || "talent"),
      });
      if (error) log("❌", `card insert failed: ${error.message}`);
      else log("➕", `admin_suggested_talent card seeded on inquiry ${target.id.slice(0, 8)}…`);
    }
  }

  console.log("\nDone.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
