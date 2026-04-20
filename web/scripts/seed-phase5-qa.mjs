/**
 * Phase 5 QA harness — auth users + memberships provisioner.
 *
 * Scope: a bounded QA fixture, not product work. Pairs with
 *        `supabase/seed_phase5_qa.sql` (runs it for you before creating
 *        users, unless `--skip-sql` is passed).
 *
 * From `web/`:
 *   npm run seed:phase5-qa             # SQL + auth users + memberships
 *   npm run seed:phase5-qa -- --skip-sql
 *   npm run seed:phase5-qa -- --purge  # DELETE the five QA users + profiles
 *
 * Env (via --env-file=.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   DATABASE_URL                       # only needed when applying SQL
 *
 * Conventions:
 *   - Every QA identifier is namespaced so nothing here can be confused with
 *     live/demo/business data.
 *   - Auth emails end `@impronta.test` (RFC 2606 reserved).
 *   - Tenant UUID is hard-coded; matches `supabase/seed_phase5_qa.sql`.
 *
 * Idempotent: re-running resets passwords + re-syncs profile + membership
 * rows. No side-effects outside the QA tenant and QA users.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const { Client: PgClient } = pg;

// ---------------------------------------------------------------------------
// Locked QA identifiers — keep in sync with supabase/seed_phase5_qa.sql
// ---------------------------------------------------------------------------

const QA_TENANT_ID = "22222222-2222-2222-2222-222222222222";
const DEFAULT_PASSWORD = "Impronta-QA-P5-2026!";

/**
 * Five QA users for the Phase 5 walkthrough. Roles map:
 *
 *   Platform Admin  → profiles.app_role='super_admin'  (no membership)
 *   Agency Admin    → app_role='agency_staff' + memberships.role='owner'
 *                     (owner satisfies the one-owner-per-tenant index; the
 *                      M6 capability matrix treats owner and admin the same)
 *   Agency Editor   → app_role='agency_staff' + memberships.role='editor'
 *   QA Client       → app_role='client' (no membership)
 *   QA Talent       → app_role='talent' (no membership)
 */
const QA_USERS = [
  {
    slot: "platform-admin",
    email: "qa-p5-platform-admin@impronta.test",
    displayName: "QA Platform Admin (P5)",
    appRole: "super_admin",
    membership: null,
  },
  {
    slot: "agency-admin",
    email: "qa-p5-agency-admin@impronta.test",
    displayName: "QA Agency Admin (P5)",
    appRole: "agency_staff",
    membership: { role: "owner" },
  },
  {
    slot: "agency-editor",
    email: "qa-p5-agency-editor@impronta.test",
    displayName: "QA Agency Editor (P5)",
    appRole: "agency_staff",
    membership: { role: "editor" },
  },
  {
    slot: "client",
    email: "qa-p5-client@impronta.test",
    displayName: "QA Client (P5)",
    appRole: "client",
    membership: null,
  },
  {
    slot: "talent",
    email: "qa-p5-talent@impronta.test",
    displayName: "QA Talent (P5)",
    appRole: "talent",
    membership: null,
  },
];

// ---------------------------------------------------------------------------
// Env + args
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const databaseUrl = process.env.DATABASE_URL?.trim();
const password = process.env.QA_P5_PASSWORD?.trim() || DEFAULT_PASSWORD;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (use web/.env.local via --env-file).",
  );
  process.exit(1);
}

const ARGS = new Set(process.argv.slice(2));
const MODE = ARGS.has("--purge") ? "purge" : "seed";
const SKIP_SQL = ARGS.has("--skip-sql");

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function runSeedSql() {
  if (!databaseUrl) {
    console.error(
      "DATABASE_URL is not set; cannot apply supabase/seed_phase5_qa.sql. " +
        "Add it to .env.local (Supabase → Project Settings → Database → Connection string), " +
        "or re-run with --skip-sql after applying the SQL some other way.",
    );
    process.exit(1);
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const sqlPath = join(here, "..", "..", "supabase", "seed_phase5_qa.sql");
  const sql = readFileSync(sqlPath, "utf8");

  const needsTls = /supabase\.(co|com)/.test(databaseUrl);
  const client = new PgClient({
    connectionString: databaseUrl,
    ssl: needsTls ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    console.log(`Applying ${sqlPath} …`);
    await client.query(sql);
    console.log("SQL seed applied.");
  } finally {
    await client.end();
  }
}

async function getAuthUserByEmail(email) {
  const target = email.toLowerCase();
  let page = 1;
  // Listing 200 at a time is enough for any QA project size.
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === target);
    if (found) return found;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function ensureAuthUser({ email, displayName }) {
  let user = await getAuthUserByEmail(email);
  let createdAuth = false;
  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: displayName },
    });
    if (error) throw error;
    user = data.user;
    createdAuth = true;
  } else {
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password,
    });
    if (error) throw error;
  }
  return { user, createdAuth };
}

async function ensureProfileRow({ userId, displayName, appRole }) {
  const { data: existing, error: selErr } = await supabase
    .from("profiles")
    .select("id, app_role, account_status, display_name")
    .eq("id", userId)
    .maybeSingle();
  if (selErr) throw selErr;

  if (!existing) {
    const { error: insErr } = await supabase.from("profiles").insert({
      id: userId,
      display_name: displayName,
      app_role: appRole,
      account_status: "active",
      onboarding_completed_at: new Date().toISOString(),
    });
    if (insErr) throw insErr;
    return "created";
  }

  const { error: upErr } = await supabase
    .from("profiles")
    .update({
      display_name: existing.display_name?.trim()
        ? existing.display_name
        : displayName,
      app_role: appRole,
      account_status: "active",
      onboarding_completed_at:
        existing.account_status === "active"
          ? existing.onboarding_completed_at ?? new Date().toISOString()
          : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (upErr) throw upErr;
  return "updated";
}

async function ensureMembership({ profileId, role }) {
  // One live membership per (tenant, profile) enforced by unique partial
  // index agency_memberships_tenant_profile_live_uniq. We upsert-by-lookup
  // rather than ON CONFLICT because that index is partial.
  const { data: existing, error: selErr } = await supabase
    .from("agency_memberships")
    .select("id, role, status")
    .eq("tenant_id", QA_TENANT_ID)
    .eq("profile_id", profileId)
    .in("status", [
      "invited",
      "pending_acceptance",
      "active",
      "suspended",
      "expired_invite",
    ])
    .maybeSingle();
  if (selErr) throw selErr;

  if (!existing) {
    const { error: insErr } = await supabase.from("agency_memberships").insert({
      tenant_id: QA_TENANT_ID,
      profile_id: profileId,
      role,
      status: "active",
      accepted_at: new Date().toISOString(),
    });
    if (insErr) throw insErr;
    return "created";
  }

  if (existing.role !== role || existing.status !== "active") {
    const { error: upErr } = await supabase
      .from("agency_memberships")
      .update({
        role,
        status: "active",
        accepted_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (upErr) throw upErr;
    return "updated";
  }
  return "unchanged";
}

async function deleteMembership(profileId) {
  const { error } = await supabase
    .from("agency_memberships")
    .delete()
    .eq("tenant_id", QA_TENANT_ID)
    .eq("profile_id", profileId);
  if (error) throw error;
}

async function deleteProfile(profileId) {
  const { error } = await supabase
    .from("profiles")
    .delete()
    .eq("id", profileId);
  if (error) throw error;
}

async function deleteAuthUser(userId) {
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

async function seed() {
  if (!SKIP_SQL) {
    await runSeedSql();
  } else {
    console.log("--skip-sql → skipping supabase/seed_phase5_qa.sql");
  }

  console.log("");
  console.log("Provisioning QA users…");

  const results = [];
  for (const spec of QA_USERS) {
    const { user, createdAuth } = await ensureAuthUser(spec);
    const profileState = await ensureProfileRow({
      userId: user.id,
      displayName: spec.displayName,
      appRole: spec.appRole,
    });
    let membershipState = "none";
    if (spec.membership) {
      membershipState = await ensureMembership({
        profileId: user.id,
        role: spec.membership.role,
      });
    }
    results.push({
      slot: spec.slot,
      email: spec.email,
      id: user.id,
      appRole: spec.appRole,
      membership: spec.membership?.role ?? null,
      createdAuth,
      profileState,
      membershipState,
    });
  }

  console.log("");
  console.log("--- Phase 5 QA harness ready ---");
  console.log(`Tenant:   QA Agency (Phase 5 Fixture)`);
  console.log(`Tenant id:${QA_TENANT_ID}`);
  console.log(`Password: ${password}  (same for every user)`);
  console.log("");
  console.log(
    "slot              email                                    app_role        membership   auth    profile    membership-state",
  );
  for (const r of results) {
    console.log(
      [
        r.slot.padEnd(18),
        r.email.padEnd(41),
        r.appRole.padEnd(15),
        (r.membership ?? "-").padEnd(12),
        (r.createdAuth ? "created" : "exists").padEnd(8),
        r.profileState.padEnd(10),
        r.membershipState,
      ].join(" "),
    );
  }

  console.log("");
  console.log("/etc/hosts (one-time, for dev storefront access):");
  console.log("  127.0.0.1  qa-agency.local");
  console.log("");
  console.log("URLs (after sign-in):");
  console.log("  Admin (tenant-scoped once switched in the workspace picker):");
  console.log("    /admin");
  console.log("    /admin/site-settings");
  console.log("    /admin/site-settings/identity");
  console.log("    /admin/site-settings/branding");
  console.log("    /admin/site-settings/design");
  console.log("    /admin/site-settings/navigation");
  console.log("    /admin/site-settings/pages");
  console.log("    /admin/site-settings/sections");
  console.log("    /admin/site-settings/structure");
  console.log("    /admin/site-settings/seo");
  console.log("    /admin/site-settings/audit");
  console.log("  Storefront:");
  console.log("    http://qa-agency.local:4000/");
  console.log("    http://qa-agency.local:4000/about");
  console.log("    http://qa-agency.local:4000/es");
  console.log("");
  console.log("Sign in at http://app.local:4000/login (or your app host).");
}

async function purge() {
  console.log("Purging QA users (auth + profiles + memberships)…");
  for (const spec of QA_USERS) {
    const user = await getAuthUserByEmail(spec.email);
    if (!user) {
      console.log(`  ${spec.email}: not present.`);
      continue;
    }
    await deleteMembership(user.id);
    await deleteProfile(user.id);
    await deleteAuthUser(user.id);
    console.log(`  ${spec.email}: deleted (id=${user.id}).`);
  }
  console.log("");
  console.log(
    "QA tenant + content NOT deleted. To scrub completely, run:\n" +
      `  DELETE FROM public.agencies WHERE id = '${QA_TENANT_ID}';\n` +
      "(requires a privileged SQL session — cascades wipe all QA child rows).",
  );
}

(async () => {
  try {
    if (MODE === "purge") {
      await purge();
    } else {
      await seed();
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
