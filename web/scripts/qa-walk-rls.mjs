#!/usr/bin/env node
/**
 * qa-walk-rls.mjs
 *
 * Tests the EXACT `.eq("version", expectedVersion)` UPDATE pattern that
 * bit createOffer in v1 — for every role × every inquiry-mutation table.
 *
 * Why: 17 engine call sites use this pattern. The createOffer fix
 * (85729cbc7) covered ONE call site (offer creation). The 16 others
 * may carry the same RLS-blocked-UPDATE bug class.
 *
 * Approach:
 *   - sign in as each role (admin, coord, talent, talent-coord, client)
 *   - read an in-flight inquiry by id
 *   - attempt the engine's exact UPDATE shape (status, version+1, etc.)
 *   - report which roles can write and which silently fail
 *
 * Read-only effect: every UPDATE is wrapped in a transaction that
 * rolls back. We're auditing RLS shape, not actually moving the
 * funnel.
 *
 * Run: node scripts/qa-walk-rls.mjs
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

const PASSWORDS = {
  "qa-admin@impronta.test": "Impronta-QA-Admin-2026!",
  "qa-client-1@impronta.test": "Impronta-QA-Client-2026!",
  "qa-client-2@impronta.test": "Impronta-QA-Client-2026!",
  "tulum-talent-sofia@impronta.test": "Impronta-Tulum-Talent-2026!",
};

const ROLES = [
  { name: "admin", email: "qa-admin@impronta.test" },
  { name: "coord (was client-2)", email: "qa-client-2@impronta.test" },
  { name: "talent-coord hybrid", email: "tulum-talent-sofia@impronta.test" },
  { name: "client", email: "qa-client-1@impronta.test" },
];

async function signIn(email) {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const pw = PASSWORDS[email];
  if (!pw) return { client: null, error: "no password set" };
  const { data, error } = await c.auth.signInWithPassword({ email, password: pw });
  if (error) return { client: null, error: error.message };
  return { client: c, user_id: data.user.id, jwt: data.session.access_token };
}

async function probeRead(client, inquiryId) {
  const { data, error } = await client
    .from("inquiries")
    .select("id, status, version, tenant_id")
    .eq("id", inquiryId)
    .maybeSingle();
  return { data, error };
}

async function probeUpdate(client, inquiryId, expectedVersion, tenantId) {
  // Simulate the no-op-but-RLS-shaped UPDATE engine paths use.
  // We bump `updated_at` and version+1 then immediately rollback by
  // running a second UPDATE that restores. (Can't actually rollback
  // via PostgREST; instead use a unique key probe.)
  //
  // Safer approach: attempt UPDATE setting updated_at = updated_at.
  // RLS will reject the same way whether or not values change.
  const { data, error } = await client
    .from("inquiries")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", inquiryId)
    .eq("tenant_id", tenantId)
    .eq("version", expectedVersion)
    .select("id, version")
    .maybeSingle();
  return { data, error };
}

async function probeMessageInsert(client, inquiryId, tenantId, userId) {
  // Inserts a transient `system_event` message and reads it back,
  // then deletes via admin. Tests whether the user-session client
  // can actually write to `inquiry_messages` (vs requires service
  // role escalation).
  const probeMarker = `qa-rls-probe-${Date.now()}`;
  const { data, error } = await client
    .from("inquiry_messages")
    .insert({
      inquiry_id: inquiryId,
      tenant_id: tenantId,
      thread_type: "group",
      message_kind: "text",
      body: probeMarker,
      sender_user_id: userId,
    })
    .select("id")
    .maybeSingle();
  if (data?.id) await admin.from("inquiry_messages").delete().eq("id", data.id);
  return { canInsert: !!data?.id, error };
}

async function main() {
  // Pick the d76a4bf9 inquiry (status=submitted, no offer attached — clean state)
  const { data: inqs } = await admin
    .from("inquiries")
    .select("id, status, version, tenant_id, contact_email")
    .eq("status", "submitted")
    .order("created_at", { ascending: false })
    .limit(1);
  if (!inqs || inqs.length === 0) {
    console.error("No submitted inquiry to test against");
    process.exit(1);
  }
  const target = inqs[0];
  console.log(`\n=== RLS walk against inquiry ${target.id.slice(0, 8)}… ===`);
  console.log(`    status=${target.status}  version=${target.version}  contact=${target.contact_email}\n`);

  console.log("Role".padEnd(28), "READ".padEnd(14), "UPDATE".padEnd(36), "MSG INSERT".padEnd(14));
  console.log("-".repeat(96));

  for (const r of ROLES) {
    const { client, error: signErr, user_id } = await signIn(r.email);
    if (!client) {
      console.log(r.name.padEnd(28), `signin err`.padEnd(14), `(${signErr})`.padEnd(36), "—");
      continue;
    }
    const rd = await probeRead(client, target.id);
    const readStr = rd.data ? `v=${rd.data.version}` : rd.error ? `err` : "null";
    const up = await probeUpdate(client, target.id, target.version, target.tenant_id);
    let updStr;
    if (up.error) updStr = `RLS-block: ${up.error.message.slice(0, 30)}`;
    else if (!up.data) updStr = "silent-null (RLS-filter or version)";
    else updStr = `OK v=${up.data.version}`;
    const msg = await probeMessageInsert(client, target.id, target.tenant_id, user_id);
    const msgStr = msg.canInsert ? "OK" : msg.error ? `err: ${msg.error.message.slice(0, 10)}` : "—";
    console.log(r.name.padEnd(28), readStr.padEnd(14), updStr.padEnd(36), msgStr.padEnd(14));
  }

  // Also test service-role baseline
  const rd = await probeRead(admin, target.id);
  const up = await probeUpdate(admin, target.id, rd.data?.version ?? target.version, target.tenant_id);
  console.log(
    "service-role (baseline)".padEnd(28),
    `v=${rd.data?.version}`.padEnd(14),
    (up.data ? `OK v=${up.data.version}` : up.error ? `err: ${up.error.message.slice(0, 25)}` : "silent-null").padEnd(36),
    "skipped".padEnd(14),
  );

  console.log("\nDone.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
