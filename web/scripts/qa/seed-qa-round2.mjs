#!/usr/bin/env node
/**
 * Staging seed, QA round 2 (go1847). STAGING ONLY (fxlankepwnvelxjrahwk). Same guards as seed-diego-personas.mjs.
 *
 *   qa-fixture-g6-client2@impronta.test  client (mirrors client1; reused when it exists)         TUL-782
 *   qa-norole@impronta.test              auth user + profile with NO app_role, onboarding not done  TUL-780 / 772
 *   qa-onb-fresh-owner@impronta.test     owner of a brand-new workspace whose onboarding is NOT done  TUL-1442
 *
 * Modes: (default) / --dry-run prints the plan, makes NO network call. --apply needs --creds-file <path>
 * (appended, mode 600, "email password role"; only for newly created users).
 * Env: NEXT_PUBLIC_SUPABASE_URL (must contain the staging ref), SUPABASE_SERVICE_ROLE_KEY.
 * Idempotent (lookup by email / slug), never deletes or overwrites a row.
 */
import { randomBytes } from "node:crypto";
import { appendFileSync, closeSync, existsSync, openSync, chmodSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

export const STAGING_REF = "fxlankepwnvelxjrahwk";
const PROD_MARKER = "pluhda";
const FRESH_SLUG = "qa-onb-fresh-1442";

export function assertStagingUrl(url) {
  const u = (url ?? "").trim().toLowerCase();
  if (!u) fail("NEXT_PUBLIC_SUPABASE_URL is not set. Refusing to run.");
  if (u.includes(PROD_MARKER)) fail("Refusing: this URL is the PRODUCTION project (pluhda). Staging only.");
  if (!u.includes(STAGING_REF)) fail(`Refusing: the URL does not contain the staging ref ${STAGING_REF}.`);
}
function fail(msg) {
  console.error(`[seed-qa-round2] ${msg}`);
  process.exit(1);
}

const USERS = [
  { email: "qa-fixture-g6-client2@impronta.test", name: "qa-fixture Cliente Pagado", appRole: "client", onboarded: true },
  { email: "qa-norole@impronta.test", name: "QA No Role", appRole: null, onboarded: false },
  { email: "qa-onb-fresh-owner@impronta.test", name: "QA Fresh Owner", appRole: "agency_staff", onboarded: false, owns: FRESH_SLUG },
];

const randomPassword = () => randomBytes(24).toString("base64url") + "aZ9!";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const ci = args.indexOf("--creds-file");
  const credsFile = ci >= 0 ? args[ci + 1] : null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  assertStagingUrl(url);
  console.log(`[seed-qa-round2] target OK (staging ${STAGING_REF}). mode=${apply ? "APPLY" : "dry-run"}`);
  if (!apply) {
    console.log("PLAN (dry-run: no network call made)");
    for (const u of USERS) console.log(`  auth user ${u.email} app_role=${u.appRole ?? "NULL"} onboarded=${u.onboarded}${u.owns ? ` owner of NEW workspace ${u.owns} (onboarding_completed_at NULL)` : ""}`);
    return;
  }
  if (!credsFile) fail("--apply requires --creds-file <path>.");
  if (!key) fail("SUPABASE_SERVICE_ROLE_KEY is not set.");
  if (!existsSync(credsFile)) closeSync(openSync(credsFile, "a", 0o600));
  chmodSync(credsFile, 0o600);
  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const out = [];

  async function findAuthUser(email) {
    for (let page = 1; ; page++) {
      const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      const hit = data.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
      if (hit) return hit;
      if (data.users.length < 200) return null;
    }
  }

  const ids = {};
  for (const u of USERS) {
    let user = await findAuthUser(u.email);
    if (user) out.push(`reused  ${u.email} ${user.id}`);
    else {
      const password = randomPassword();
      const { data, error } = await sb.auth.admin.createUser({ email: u.email, password, email_confirm: true, user_metadata: { display_name: u.name, is_test_account: true } });
      if (error || !data?.user) fail(`createUser failed for ${u.email}: ${error?.message}`);
      user = data.user;
      appendFileSync(credsFile, `${u.email} ${password} ${u.appRole ?? "no-role"}\n`, { mode: 0o600 });
      out.push(`created ${u.email} ${user.id}`);
      // profile only shaped for NEW users: never rewrite an existing persona's profile
      const patch = { display_name: u.name, app_role: u.appRole, account_status: "active", is_test_account: true, onboarding_completed_at: u.onboarded ? new Date().toISOString() : null };
      const { data: prof } = await sb.from("profiles").select("id").eq("id", user.id).maybeSingle();
      const { error: pErr } = prof ? await sb.from("profiles").update(patch).eq("id", user.id) : await sb.from("profiles").insert({ id: user.id, ...patch });
      if (pErr) fail(`profile write failed for ${u.email}: ${pErr.message}`);
    }
    ids[u.email] = user.id;
  }

  // brand-new un-onboarded workspace (TUL-1442)
  const owner = USERS.find((x) => x.owns);
  const { data: ex } = await sb.from("agencies").select("id").eq("slug", FRESH_SLUG).maybeSingle();
  let tenantId = ex?.id;
  if (tenantId) out.push(`reused  workspace ${FRESH_SLUG} ${tenantId}`);
  else {
    const { data, error } = await sb.from("agencies").insert({
      slug: FRESH_SLUG, display_name: "QA Fresh Workspace", kind: "agency", status: "active", template_key: "default",
      supported_locales: ["en"], onboarding_completed_at: null, plan_tier: "free", talent_seat_limit: 5,
    }).select("id").single();
    if (error || !data) fail(`agencies insert failed: ${error?.message}`);
    tenantId = data.id;
    out.push(`created workspace ${FRESH_SLUG} ${tenantId}`);
  }
  const { data: mem } = await sb.from("agency_memberships").select("id").eq("tenant_id", tenantId).eq("profile_id", ids[owner.email]).maybeSingle();
  if (mem) out.push(`reused  membership ${mem.id}`);
  else {
    const { data: ow } = await sb.from("agency_memberships").select("id").eq("tenant_id", tenantId).eq("role", "owner").limit(1).maybeSingle();
    if (ow) out.push("skipped membership: workspace already has an owner");
    else {
      const { data, error } = await sb.from("agency_memberships").insert({ tenant_id: tenantId, profile_id: ids[owner.email], role: "owner", status: "active", accepted_at: new Date().toISOString() }).select("id").single();
      if (error) fail(`membership insert failed: ${error.message}`);
      out.push(`created membership owner ${data.id}`);
    }
  }
  console.log("SUMMARY\n  " + out.join("\n  "));
  console.log(`credentials for newly created users appended to ${credsFile} (mode 600).`);
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) main().catch((e) => { console.error("[seed-qa-round2] failed:", e?.message ?? e); process.exit(1); });
