#!/usr/bin/env node
/**
 * Staging seed for the Diego QA personas. STAGING ONLY (fxlankepwnvelxjrahwk).
 *
 *   qa-s2-terms       owner + talent   booking terms / policies set up (talent_policy_settings)
 *   qa-s2-collective  owner + member   friends-collective preset (work_model + a pending owner share)
 *   qa-s2-rent        owner + member   rental studio (work_model + a proposed studio_rent_plans row)
 *   qa-journeys       admin            an admin membership on the EXISTING qa-journeys workspace (TUL-1152)
 *
 * Modes:
 *   (default) / --dry-run   prints the plan and makes NO network call at all.
 *   --apply                 writes. Needs --creds-file <path> (appended, mode 600, "email password role").
 *
 * Env (from the process env or `node --env-file=<path>`):
 *   NEXT_PUBLIC_SUPABASE_URL   must contain the staging ref, else hard exit (pluhda = prod, refused by name)
 *   SUPABASE_SERVICE_ROLE_KEY  staging service role key
 *
 * Run from web/:
 *   node --env-file=<staging-env> scripts/qa/seed-diego-personas.mjs
 *   node --env-file=<staging-env> scripts/qa/seed-diego-personas.mjs --apply --creds-file ~/qa-diego-creds.txt
 *
 * Idempotent: users are looked up by email, workspaces by slug, other rows by their natural key; anything
 * found is reused. Never deletes or overwrites a row, and never touches TAL-93938 / TAL-93940.
 * Feature columns / tables that live in held migrations (work_model, owner_share_*, studio_rent_plans) are
 * written best-effort: if the staging schema lacks them the step is reported as skipped, not failed.
 */
import { randomBytes } from "node:crypto";
import { appendFileSync, closeSync, existsSync, openSync, chmodSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

export const STAGING_REF = "fxlankepwnvelxjrahwk";
export const PROD_REF = "pluhdapdnuiulvxmyspd";
const PROD_MARKER = "pluhda";
const NEVER_TOUCH_CODES = ["TAL-93938", "TAL-93940"];
const JOURNEYS_SLUG = "qa-journeys";

/** Hard exit unless the URL is the staging project. Exported for the static test. */
export function assertStagingUrl(url) {
  const u = (url ?? "").trim().toLowerCase();
  if (!u) fail("NEXT_PUBLIC_SUPABASE_URL is not set. Refusing to run.");
  if (u.includes(PROD_MARKER)) fail("Refusing: this URL is the PRODUCTION project (pluhda). Staging only.");
  if (!u.includes(STAGING_REF)) fail(`Refusing: the URL does not contain the staging ref ${STAGING_REF}.`);
}

function fail(msg) {
  console.error(`[seed-diego-personas] ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------- the plan
const DOMAIN_ROOT = "tulala.digital";

const WORKSPACES = [
  { key: "terms", slug: "qa-s2-terms", name: "QA S2 Terms", workModel: null },
  { key: "collective", slug: "qa-s2-collective", name: "QA S2 Collective", workModel: "friends_collective" },
  { key: "rent", slug: "qa-s2-rent", name: "QA S2 Rent", workModel: "rental_studio" },
];

const USERS = [
  { email: "qa-s2-terms-owner@impronta.test", name: "QA S2 Terms Owner", appRole: "agency_staff", ws: "terms", membership: "owner" },
  { email: "qa-s2-terms-talent@impronta.test", name: "QA S2 Terms Talent", appRole: "talent", ws: "terms", talent: { code: "TAL-97110", first: "Terms" } },
  { email: "qa-s2-collective-owner@impronta.test", name: "QA S2 Collective Owner", appRole: "agency_staff", ws: "collective", membership: "owner" },
  { email: "qa-s2-collective-member@impronta.test", name: "QA S2 Collective Member", appRole: "talent", ws: "collective", talent: { code: "TAL-97111", first: "Collective" } },
  { email: "qa-s2-rent-owner@impronta.test", name: "QA S2 Rent Owner", appRole: "agency_staff", ws: "rent", membership: "owner" },
  { email: "qa-s2-rent-member@impronta.test", name: "QA S2 Rent Member", appRole: "talent", ws: "rent", talent: { code: "TAL-97112", first: "Rent" } },
  { email: "qa-journeys-admin@impronta.test", name: "QA Journeys Admin", appRole: "agency_staff", ws: JOURNEYS_SLUG, membership: "admin", existingWorkspace: true },
];

/** Late-cancel answers for the terms persona (shape: src/lib/talent-policies/answers.ts). */
const TERMS_ANSWERS = { late_cancel_refund: "half", late_tolerance_min: 15 };

function printPlan() {
  console.log("PLAN (dry-run: no network call made)\n");
  console.log("auth users (Admin API, email_confirm=true, a random strong secret each, lookup by email first):");
  for (const u of USERS) console.log(`  ${u.email}  app_role=${u.appRole}`);
  console.log("\nper user: profiles (app_role, display_name, is_test_account=true, onboarding done)");
  console.log("\nworkspaces (agencies, lookup by slug; plan_tier=free, talent_seat_limit=5, onboarding done):");
  for (const w of WORKSPACES) console.log(`  ${w.slug}${w.workModel ? `  work_model=${w.workModel} (skipped if column absent)` : ""}`);
  console.log(`  ${JOURNEYS_SLUG}  (EXISTING: looked up only, never created)`);
  console.log("\nagency_domains: <slug>." + DOMAIN_ROOT + " (kind subdomain, non-fatal) for the 3 new workspaces");
  console.log("agency_memberships (tenant_id, profile_id): owners -> owner, qa-journeys-admin -> admin (qa-journeys)");
  console.log("agency_branding: scaffold row per new workspace");
  console.log("talent_profiles (profile_kind person, approved, unlisted, is_test_account): " + USERS.filter((u) => u.talent).map((u) => u.talent.code).join(", "));
  console.log("agency_talent_roster (source_type agency_added, status active) for each talent in its workspace");
  console.log("\nfeature rows:");
  console.log(`  talent_policy_settings   qa-s2-terms-talent  answers=${JSON.stringify(TERMS_ANSWERS)}`);
  console.log("  agencies.work_model + default_coordinator_user_id=owner   collective, rent (held migration TUL-1374)");
  console.log("  agency_talent_roster.owner_share_* pending proposal 20% (pending_share_*)   qa-s2-collective-member");
  console.log("  studio_rent_plans (status proposed, 150000 MXN cents/month)   qa-s2-rent-member (held migration TUL-1376)");
  console.log("\nNothing is deleted or overwritten. Re-run with --apply --creds-file <path> to write.");
}

// ---------------------------------------------------------------- apply
function randomPassword() {
  // 24 random bytes -> 32 url-safe chars; the suffix guarantees upper/lower/digit/symbol classes.
  return randomBytes(24).toString("base64url") + "aZ9!";
}

const SCHEMA_ABSENT = new Set(["42703", "42P01", "PGRST204", "PGRST205", "PGRST200"]);
const isSchemaAbsent = (err) => Boolean(err && (SCHEMA_ABSENT.has(err.code) || /does not exist|schema cache|could not find/i.test(err.message ?? "")));

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const credsIdx = args.indexOf("--creds-file");
  const credsFile = credsIdx >= 0 ? args[credsIdx + 1] : null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  assertStagingUrl(url);
  console.log(`[seed-diego-personas] target OK (staging ${STAGING_REF}). mode=${apply ? "APPLY" : "dry-run"}`);

  if (!apply) {
    printPlan();
    return;
  }
  if (!credsFile) fail("--apply requires --creds-file <path>.");
  if (!serviceKey) fail("SUPABASE_SERVICE_ROLE_KEY is not set.");

  if (!existsSync(credsFile)) closeSync(openSync(credsFile, "a", 0o600));
  chmodSync(credsFile, 0o600);

  const sb = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const summary = [];
  const note = (kind, what, id) => summary.push(`${kind.padEnd(8)} ${what}${id ? `  ${id}` : ""}`);

  async function findAuthUser(email) {
    const target = email.toLowerCase();
    for (let page = 1; ; page++) {
      const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      const hit = data.users.find((u) => u.email?.toLowerCase() === target);
      if (hit) return hit;
      if (data.users.length < 200) return null;
    }
  }

  // 1. auth users + profiles
  const ids = {};
  for (const u of USERS) {
    let user = await findAuthUser(u.email);
    if (user) {
      note("reused", `auth user ${u.email}`, user.id);
    } else {
      const password = randomPassword();
      const { data, error } = await sb.auth.admin.createUser({
        email: u.email,
        password,
        email_confirm: true,
        user_metadata: { display_name: u.name, is_test_account: true },
      });
      if (error || !data?.user) fail(`createUser failed for ${u.email}: ${error?.message}`);
      user = data.user;
      appendFileSync(credsFile, `${u.email} ${password} ${u.appRole}\n`, { mode: 0o600 });
      note("created", `auth user ${u.email}`, user.id);
    }
    ids[u.email] = user.id;
    // The on_auth_user_created trigger creates the profiles row; make sure it is shaped for QA.
    const patch = {
      display_name: u.name,
      app_role: u.appRole,
      account_status: "active",
      is_test_account: true,
      onboarding_completed_at: new Date().toISOString(),
    };
    const { data: prof } = await sb.from("profiles").select("id").eq("id", user.id).maybeSingle();
    if (prof) {
      const { error } = await sb.from("profiles").update(patch).eq("id", user.id);
      if (error) fail(`profiles update failed for ${u.email}: ${error.message}`);
    } else {
      const { error } = await sb.from("profiles").insert({ id: user.id, ...patch });
      if (error) fail(`profiles insert failed for ${u.email}: ${error.message}`);
      note("created", `profile ${u.email}`, user.id);
    }
  }

  // 2. workspaces
  const tenant = {};
  const now = new Date().toISOString();
  for (const w of WORKSPACES) {
    const { data: existing } = await sb.from("agencies").select("id").eq("slug", w.slug).maybeSingle();
    if (existing) {
      tenant[w.key] = existing.id;
      note("reused", `workspace ${w.slug}`, existing.id);
      continue;
    }
    const { data, error } = await sb
      .from("agencies")
      .insert({
        slug: w.slug,
        display_name: w.name,
        kind: "agency",
        status: "active",
        template_key: "default",
        supported_locales: ["en"],
        onboarding_completed_at: now,
        plan_tier: "free",
        talent_seat_limit: 5,
      })
      .select("id")
      .single();
    if (error || !data) fail(`agencies insert failed for ${w.slug}: ${error?.message}`);
    tenant[w.key] = data.id;
    note("created", `workspace ${w.slug}`, data.id);
    const host = `${w.slug}.${DOMAIN_ROOT}`;
    const { data: dom } = await sb.from("agency_domains").select("id").eq("hostname", host).maybeSingle();
    if (!dom) {
      const { error: dErr } = await sb
        .from("agency_domains")
        .insert({ tenant_id: data.id, hostname: host, kind: "subdomain", status: "active", is_primary: true });
      note(dErr ? "skipped" : "created", `agency_domains ${host}`, dErr?.message);
    }
    await sb.from("agency_branding").upsert({ tenant_id: data.id, theme_json: {} }, { onConflict: "tenant_id", ignoreDuplicates: true });
  }
  const { data: jw } = await sb.from("agencies").select("id").eq("slug", JOURNEYS_SLUG).maybeSingle();
  if (!jw) fail(`the existing ${JOURNEYS_SLUG} workspace was not found on staging; seed it first (seed-journeys-program).`);
  tenant[JOURNEYS_SLUG] = jw.id;
  note("reused", `workspace ${JOURNEYS_SLUG}`, jw.id);

  // 3. memberships (owners + the qa-journeys admin)
  for (const u of USERS.filter((x) => x.membership)) {
    const tenantId = tenant[u.ws];
    const profileId = ids[u.email];
    const { data: mem } = await sb.from("agency_memberships").select("id, role").eq("tenant_id", tenantId).eq("profile_id", profileId).maybeSingle();
    if (mem) {
      note("reused", `membership ${u.email} (${mem.role})`, mem.id);
      continue;
    }
    // A workspace seeded earlier (stage-2) already has its one owner: this persona joins as admin.
    let role = u.membership;
    if (role === "owner") {
      const { data: existingOwner } = await sb.from("agency_memberships").select("id").eq("tenant_id", tenantId).eq("role", "owner").limit(1).maybeSingle();
      if (existingOwner) role = "admin";
    }
    const { data, error } = await sb
      .from("agency_memberships")
      .insert({ tenant_id: tenantId, profile_id: profileId, role, status: "active", accepted_at: now })
      .select("id")
      .single();
    if (error) fail(`membership insert failed for ${u.email}: ${error.message}`);
    note("created", `membership ${u.email} -> ${role}`, data.id);
  }

  // 4. talents + roster
  const talentId = {};
  for (const u of USERS.filter((x) => x.talent)) {
    if (NEVER_TOUCH_CODES.includes(u.talent.code)) fail("refusing: profile code is on the never-touch list.");
    const { data: tp } = await sb.from("talent_profiles").select("id, profile_code").eq("user_id", ids[u.email]).maybeSingle();
    let tid = tp?.id;
    if (tid) {
      note("reused", `talent_profile ${u.email} (${tp.profile_code})`, tid);
    } else {
      const { data, error } = await sb
        .from("talent_profiles")
        .insert({
          user_id: ids[u.email],
          profile_code: u.talent.code,
          public_slug_part: u.talent.code,
          display_name: u.name,
          first_name: u.talent.first,
          profile_kind: "person",
          short_bio: "QA persona (Diego, stage 2).",
          preferred_locale: "en",
          default_currency: "MXN",
          talent_plan_key: "talent_portfolio",
          workflow_status: "approved",
          visibility: "public",
          is_publicly_listed: false,
          is_discoverable: false,
          is_publicly_hidden: false,
          is_test_account: true,
          updated_at: now,
        })
        .select("id")
        .single();
      if (error || !data) fail(`talent_profiles insert failed for ${u.email}: ${error?.message}`);
      tid = data.id;
      note("created", `talent_profile ${u.talent.code}`, tid);
    }
    talentId[u.email] = tid;
    const tenantId = tenant[u.ws];
    const { data: r } = await sb
      .from("agency_talent_roster")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("talent_profile_id", tid)
      .in("status", ["pending", "active", "inactive"])
      .maybeSingle();
    if (r) {
      note("reused", `roster ${u.email}`, r.id);
    } else {
      const { data, error } = await sb
        .from("agency_talent_roster")
        .insert({ tenant_id: tenantId, talent_profile_id: tid, source_type: "agency_added", status: "active", agency_visibility: "roster_only" })
        .select("id")
        .single();
      if (error) fail(`roster insert failed for ${u.email}: ${error.message}`);
      note("created", `roster ${u.email}`, data.id);
    }
  }

  // 5. feature rows (best-effort where the schema lives in a held migration)
  // 5a. terms: the talent's booking policy answers
  {
    const tid = talentId["qa-s2-terms-talent@impronta.test"];
    const { data: cur } = await sb.from("talent_policy_settings").select("talent_profile_id").eq("talent_profile_id", tid).maybeSingle();
    if (cur) note("reused", "talent_policy_settings terms talent", tid);
    else {
      const { error } = await sb.from("talent_policy_settings").insert({ talent_profile_id: tid, answers: TERMS_ANSWERS });
      note(error ? "skipped" : "created", "talent_policy_settings terms talent", error?.message ?? tid);
    }
  }
  // 5b. work_model on collective + rent (only while it is still unset)
  for (const w of WORKSPACES.filter((x) => x.workModel)) {
    const ownerId = ids[`qa-s2-${w.key}-owner@impronta.test`];
    const { data: ag, error: rErr } = await sb.from("agencies").select("work_model").eq("id", tenant[w.key]).maybeSingle();
    if (rErr) {
      note("skipped", `work_model ${w.slug}`, isSchemaAbsent(rErr) ? "column absent (migration TUL-1374 not applied)" : rErr.message);
      continue;
    }
    if (ag?.work_model) {
      note("reused", `work_model ${w.slug} = ${ag.work_model}`);
      continue;
    }
    const { error } = await sb.from("agencies").update({ work_model: w.workModel, default_coordinator_user_id: ownerId }).eq("id", tenant[w.key]);
    note(error ? "skipped" : "created", `work_model ${w.slug} = ${w.workModel}`, error?.message);
  }
  // 5c. collective: a pending owner-share proposal on the member (the screen the member answers)
  {
    const email = "qa-s2-collective-member@impronta.test";
    const tid = talentId[email];
    const { data: row, error: rErr } = await sb
      .from("agency_talent_roster")
      .select("pending_share_kind, owner_share_kind")
      .eq("tenant_id", tenant.collective)
      .eq("talent_profile_id", tid)
      .maybeSingle();
    if (rErr) note("skipped", "collective owner-share proposal", isSchemaAbsent(rErr) ? "columns absent (migration TUL-1374 not applied)" : rErr.message);
    else if (row?.pending_share_kind || row?.owner_share_kind) note("reused", "collective owner-share proposal", tid);
    else {
      const { error } = await sb
        .from("agency_talent_roster")
        .update({ pending_share_kind: "percent", pending_share_bps: 2000, pending_share_proposed_at: now })
        .eq("tenant_id", tenant.collective)
        .eq("talent_profile_id", tid);
      note(error ? "skipped" : "created", "collective owner-share proposal 20%", error?.message ?? tid);
    }
  }
  // 5d. rent: a proposed plan for the member (they accept or decline it)
  {
    const tid = talentId["qa-s2-rent-member@impronta.test"];
    const { data: plan, error: rErr } = await sb
      .from("studio_rent_plans")
      .select("id, status")
      .eq("tenant_id", tenant.rent)
      .eq("talent_profile_id", tid)
      .in("status", ["proposed", "active", "paused"])
      .maybeSingle();
    if (rErr) note("skipped", "studio_rent_plans", isSchemaAbsent(rErr) ? "table absent (migration TUL-1376 not applied)" : rErr.message);
    else if (plan) note("reused", `studio_rent_plans (${plan.status})`, plan.id);
    else {
      const startsOn = new Date().toISOString().slice(0, 10);
      const { data, error } = await sb
        .from("studio_rent_plans")
        .insert({
          tenant_id: tenant.rent,
          talent_profile_id: tid,
          monthly_rent_cents: 150000,
          currency: "MXN",
          starts_on: startsOn,
          status: "proposed",
          proposed_by: ids["qa-s2-rent-owner@impronta.test"],
        })
        .select("id")
        .single();
      note(error ? "skipped" : "created", "studio_rent_plans proposed 1500.00 MXN/month", error?.message ?? data?.id);
    }
  }

  console.log("\nSUMMARY");
  for (const l of summary) console.log("  " + l);
  console.log(`\ncredentials appended to ${credsFile} (mode 600) for newly created users only.`);
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error("[seed-diego-personas] failed:", err?.message ?? err);
    process.exit(1);
  });
}
