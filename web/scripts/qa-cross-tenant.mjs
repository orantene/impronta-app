#!/usr/bin/env node
/**
 * qa-cross-tenant.mjs — Gap 12 of QA plan v2.
 *
 * Verifies tenant isolation:
 *   - Admin of agency A signs in.
 *   - Tries to READ + UPDATE an inquiry that belongs to agency B.
 *   - All attempts should be blocked at RLS, NOT 200-with-data.
 *
 * Why this matters: cross-tenant data leak is the #1 SaaS audit fail.
 * Engine functions all do `.eq("tenant_id", ctx.tenantId)`, but if RLS
 * were misconfigured the engine's tenant_id constraint would be the
 * only defense — which is fine for engine-mediated paths but irrelevant
 * for any direct REST read/write the client could attempt.
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./load-env-local.mjs";

loadEnvLocal();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) {
  console.error("Missing env");
  process.exit(1);
}
const admin = createClient(url, service, { auth: { persistSession: false } });

async function main() {
  console.log("\n=== Cross-tenant guard walk ===\n");

  // 1. Find an inquiry in impronta tenant (the qa-admin's home)
  const { data: improntaAg } = await admin.from("agencies").select("id, slug").eq("slug", "impronta").maybeSingle();
  const { data: improntaInq } = await admin
    .from("inquiries")
    .select("id, tenant_id, status, contact_email")
    .eq("tenant_id", improntaAg.id)
    .limit(1)
    .maybeSingle();
  console.log(`impronta inquiry: ${improntaInq.id.slice(0, 8)}…  status=${improntaInq.status}`);

  // 2. We need an inquiry on a DIFFERENT tenant. Pick or seed.
  const { data: studioAg } = await admin
    .from("agencies")
    .select("id, slug, plan_tier")
    .eq("slug", "qa-studio-tenant")
    .maybeSingle();
  if (!studioAg) {
    console.error("qa-studio-tenant not seeded — run seed-qa-fixtures first");
    process.exit(1);
  }

  // Check if studio tenant has any inquiry; if not, seed one
  let { data: studioInq } = await admin
    .from("inquiries")
    .select("id, tenant_id, status")
    .eq("tenant_id", studioAg.id)
    .limit(1)
    .maybeSingle();
  if (!studioInq) {
    console.log(`Seeding inquiry on qa-studio-tenant…`);
    const { data: seeded, error } = await admin
      .from("inquiries")
      .insert({
        tenant_id: studioAg.id,
        contact_name: "QA Cross-Tenant Test",
        contact_email: "qa-cross-tenant@test.local",
        status: "submitted",
        source_channel: "directory_guest",
        uses_new_engine: true,
        version: 1,
      })
      .select("id, tenant_id, status")
      .single();
    if (error) {
      console.error(`Seed failed: ${error.message}`);
      process.exit(1);
    }
    studioInq = seeded;
    console.log(`  seeded id=${studioInq.id.slice(0, 8)}…`);
  }
  console.log(`studio inquiry:  ${studioInq.id.slice(0, 8)}…  status=${studioInq.status}\n`);

  // 3. Walk multiple personas. qa-admin is super_admin (intentionally
  //    cross-tenant) so we test 3 non-platform actors that should all be
  //    fenced to impronta:
  const personas = [
    { name: "client (pure)", email: "qa-client-1@impronta.test", pw: "Impronta-QA-Client-2026!" },
    { name: "coord (in impronta)", email: "qa-client-2@impronta.test", pw: "Impronta-QA-Client-2026!" },
    { name: "talent-coord hybrid", email: "tulum-talent-sofia@impronta.test", pw: "Impronta-Tulum-Talent-2026!" },
  ];

  for (const p of personas) {
    console.log(`\n--- Persona: ${p.name} ---`);
    const c = createClient(url, anon, { auth: { persistSession: false } });
    const { data: signed, error: signErr } = await c.auth.signInWithPassword({ email: p.email, password: p.pw });
    if (signErr) {
      console.log(`  sign-in failed: ${signErr.message}`);
      continue;
    }
    console.log(`  user_id=${signed.user.id.slice(0, 8)}…  email=${p.email}`);

    // [A] READ studio inquiry
    const { data: crossRead } = await c
      .from("inquiries")
      .select("id, tenant_id, contact_email, status")
      .eq("id", studioInq.id)
      .maybeSingle();
    console.log(`  [A] READ studio inquiry:        ${crossRead ? `❌ LEAK ${JSON.stringify(crossRead).slice(0, 80)}` : `✅ blocked`}`);

    // [B] UPDATE studio inquiry
    const { data: crossUpd } = await c
      .from("inquiries")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", studioInq.id)
      .select("id")
      .maybeSingle();
    console.log(`  [B] UPDATE studio inquiry:      ${crossUpd ? `❌ LEAK ${crossUpd.id.slice(0, 8)}…` : `✅ blocked`}`);

    // [C] INSERT message on studio inquiry
    const { data: crossMsg, error: crossMsgErr } = await c
      .from("inquiry_messages")
      .insert({
        inquiry_id: studioInq.id,
        tenant_id: studioInq.tenant_id,
        thread_type: "group",
        message_kind: "text",
        sender_user_id: signed.user.id,
        body: `qa-cross-tenant attack from ${p.name}`,
      })
      .select("id")
      .maybeSingle();
    if (crossMsgErr) console.log(`  [C] INSERT studio msg:          ✅ blocked  ${crossMsgErr.message.slice(0, 50)}`);
    else if (!crossMsg) console.log(`  [C] INSERT studio msg:          ✅ blocked (no row)`);
    else {
      console.log(`  [C] INSERT studio msg:          ❌ LEAK ${crossMsg.id.slice(0, 8)}…`);
      await admin.from("inquiry_messages").delete().eq("id", crossMsg.id);
    }

    // [D] Read home tenant inquiry as control
    const { data: ownRead } = await c
      .from("inquiries")
      .select("id, status")
      .eq("id", improntaInq.id)
      .maybeSingle();
    const expectedHome = p.name === "client (pure)"
      ? improntaInq.client_user_id === signed.user.id
      : true; // coord + talent-coord should see impronta inquiry via tenant_staff
    console.log(`  [D] READ home inquiry:          ${ownRead ? `✅ allowed (id=${ownRead.id.slice(0, 8)}…)` : `${expectedHome ? "❌" : "✅"} ${expectedHome ? "FAIL — should be visible" : "blocked"}`}`);
  }

  // 4. Cross-tenant guard on the engine-style filter
  console.log("\n--- Engine tenant_id filter (defense-in-depth) ---");
  const c0 = createClient(url, anon, { auth: { persistSession: false } });
  const { data: signed0 } = await c0.auth.signInWithPassword({
    email: "qa-client-2@impronta.test",
    password: "Impronta-QA-Client-2026!",
  });
  const { data: spoofUpd } = await c0
    .from("inquiries")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", studioInq.id)
    .eq("tenant_id", improntaAg.id) // falsified tenant_id
    .select("id")
    .maybeSingle();
  console.log(`  Spoof UPDATE (studio id, claim tenant=impronta): ${spoofUpd ? "❌ LEAK" : "✅ blocked"}`);

  console.log("\nDone.\n");
  void signed0;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
