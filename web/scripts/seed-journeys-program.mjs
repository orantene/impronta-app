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
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertIsolatedJourneysTarget, JOURNEYS_TENANT_ID } from "./isolated-target-guard.mjs";

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
    console.log("JOURNEYS_FIXTURE_READY remains unset until verify against this isolated DB.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
