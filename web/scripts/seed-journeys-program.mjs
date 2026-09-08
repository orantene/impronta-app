#!/usr/bin/env node
/**
 * P0-06 — apply the journeys fixture tenant.
 *
 * From `web/`:
 *   JOURNEYS_ISOLATED=1 npm run seed:journeys-program
 *
 * Env (via --env-file=.env.capacity-isolated.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   DATABASE_URL
 *
 * Refuses production, Impronta, and .env.vercel.local.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertIsolatedJourneysTarget, JOURNEYS_TENANT_ID } from "./isolated-target-guard.mjs";

const SECOND_TENANT_ID = "33333333-3333-4333-8333-333333333334";
const FIXTURE_USERS = [
  { email: "qa-journeys-owner@impronta.test", displayName: "QA Journeys Owner", appRole: "agency_staff", tenantId: JOURNEYS_TENANT_ID, membership: "owner" },
  { email: "qa-journeys-viewer@impronta.test", displayName: "QA Journeys Viewer", appRole: "agency_staff", tenantId: JOURNEYS_TENANT_ID, membership: "viewer" },
  { email: "qa-journeys-b-owner@impronta.test", displayName: "QA Journeys B Owner", appRole: "agency_staff", tenantId: SECOND_TENANT_ID, membership: "owner" },
  { email: "qa-journeys-customer@impronta.test", displayName: "QA Journeys Customer", appRole: "client", tenantId: null, membership: null },
  { email: "qa-journeys-talent@impronta.test", displayName: "QA Journeys Talent", appRole: "talent", tenantId: JOURNEYS_TENANT_ID, membership: null },
];

const { Client: PgClient } = pg;
const here = dirname(fileURLToPath(import.meta.url));
const IMPRONTA_ID = "00000000-0000-0000-0000-000000000001";

async function main() {
  assertIsolatedJourneysTarget(process.env, { requireIsolatedFlag: true });
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("seed:journeys-program needs DATABASE_URL. Isolated only. Mark awaiting if missing.");
    process.exit(2);
  }

  const sqlPath = join(here, "..", "..", "supabase", "seed_journeys_program.sql");
  const sql = readFileSync(sqlPath, "utf8");
  const client = new PgClient({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query("select id, slug from public.agencies where id = $1", [IMPRONTA_ID]);
    if (rows[0]?.slug === "impronta") {
      console.log("impronta tenant present — leaving it untouched");
    }
    await client.query(sql);
    const check = await client.query("select id, slug from public.agencies where id = $1", [JOURNEYS_TENANT_ID]);
    if (!check.rows[0] || check.rows[0].slug !== "qa-journeys") {
      throw new Error("fixture tenant missing after apply");
    }
    if (check.rows[0].id === IMPRONTA_ID) {
      throw new Error("refusing: fixture collided with Impronta");
    }
    const second = await client.query(
      "select slug from public.agencies where id = '33333333-3333-4333-8333-333333333334'",
    );
    if (second.rows[0]?.slug !== "qa-journeys-b") {
      throw new Error("second fixture workspace missing after apply");
    }
    const pool = await client.query(
      "select units_total from public.capacity_pools where id = '33330020-0000-4000-8000-000000000001'",
    );
    if (Number(pool.rows[0]?.units_total) !== 12) {
      throw new Error("12-place session_tier pool missing after apply");
    }
    const catalog = await client.query(
      "select count(*)::int as n from public.talent_offerings where tenant_id = $1",
      [JOURNEYS_TENANT_ID],
    );
    if ((catalog.rows[0]?.n ?? 0) < 3) {
      throw new Error("fixture catalog missing after apply");
    }
    console.log("seeded qa-journeys", check.rows[0].id);
    await provisionFixtureUsers();
    console.log("JOURNEYS_FIXTURE_READY remains unset until verify against this isolated DB.");
  } finally {
    await client.end();
  }
}

async function provisionFixtureUsers() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log("fixture auth users skipped — set isolated URL + service_role");
    return;
  }
  const password = process.env.JOURNEYS_FIXTURE_PASSWORD;
  if (!password) {
    console.log("fixture auth users skipped — set JOURNEYS_FIXTURE_PASSWORD");
    return;
  }
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const slot of FIXTURE_USERS) {
    const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listed.error) throw listed.error;
    let user = listed.data.users.find((u) => u.email?.toLowerCase() === slot.email);
    if (!user) {
      const created = await supabase.auth.admin.createUser({
        email: slot.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: slot.displayName },
      });
      if (created.error) throw created.error;
      user = created.data.user;
    }
    if (!user) throw new Error(`missing auth user ${slot.email}`);
    const { error: profileErr } = await supabase.from("profiles").upsert({
      id: user.id,
      display_name: slot.displayName,
      app_role: slot.appRole,
      account_status: "active",
      onboarding_completed_at: new Date().toISOString(),
    });
    if (profileErr) throw profileErr;
    if (slot.tenantId && slot.membership) {
      const { data: existing, error: memErr } = await supabase
        .from("agency_memberships")
        .select("id")
        .eq("tenant_id", slot.tenantId)
        .eq("profile_id", user.id)
        .in("status", ["invited", "pending_acceptance", "active", "suspended"])
        .maybeSingle();
      if (memErr) throw memErr;
      if (!existing) {
        const { error: insErr } = await supabase.from("agency_memberships").insert({
          tenant_id: slot.tenantId,
          profile_id: user.id,
          role: slot.membership,
          status: "active",
          accepted_at: new Date().toISOString(),
        });
        if (insErr) throw insErr;
      }
    }
    console.log("fixture user", slot.email, slot.membership ?? slot.appRole);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
