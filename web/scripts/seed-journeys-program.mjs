#!/usr/bin/env node
/**
 * P0-06 — apply the journeys fixture tenant.
 *
 * From `web/`:
 *   npm run seed:journeys-program
 *
 * Env (via --env-file=.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   DATABASE_URL
 *
 * Refuses to run against Impronta. Apply is local-only.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client: PgClient } = pg;
const here = dirname(fileURLToPath(import.meta.url));

const JOURNEYS_TENANT_ID = "33333333-3333-4333-8333-333333333333";
const IMPRONTA_ID = "00000000-0000-0000-0000-000000000001";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("seed:journeys-program needs DATABASE_URL. Local-only. Mark awaiting if missing.");
    process.exit(2);
  }
  if (databaseUrl.includes("impronta") && !process.env.JOURNEYS_ALLOW_SHARED_PROJECT) {
    console.error("Refusing a URL that looks like the live Impronta project. Use an isolated DB.");
    process.exit(2);
  }

  const sqlPath = join(here, "..", "..", "supabase", "seed_journeys_program.sql");
  const sql = readFileSync(sqlPath, "utf8");
  const client = new PgClient({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query("select id, slug from public.agencies where id = $1", [IMPRONTA_ID]);
    if (rows[0]?.slug === "impronta") {
      // Same project may host many tenants. We never UPDATE the Impronta row.
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
    console.log("seeded qa-journeys", check.rows[0].id);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
