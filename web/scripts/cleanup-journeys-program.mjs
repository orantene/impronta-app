#!/usr/bin/env node
/**
 * Remove the journeys fixture tenants from the isolated target only.
 *
 *   JOURNEYS_ISOLATED=1 npm run cleanup:journeys-program
 *
 * Refuses production, Impronta, and .env.vercel.local.
 */
import pg from "pg";
import {
  assertIsolatedJourneysTarget,
  JOURNEYS_TENANT_ID,
  IMPRONTA_TENANT_ID,
} from "./isolated-target-guard.mjs";

const { Client: PgClient } = pg;
const SECOND = "33333333-3333-4333-8333-333333333334";

async function main() {
  assertIsolatedJourneysTarget(process.env, { requireIsolatedFlag: true });
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("cleanup:journeys-program needs DATABASE_URL. Isolated only.");
    process.exit(2);
  }
  const client = new PgClient({ connectionString: databaseUrl });
  await client.connect();
  try {
    const imprinta = await client.query("select id from public.agencies where id = $1", [IMPRONTA_TENANT_ID]);
    if (impronta.rows[0]) {
      console.log("impronta tenant present — leaving it untouched");
    }
    await client.query("delete from public.agencies where id = any($1::uuid[])", [[JOURNEYS_TENANT_ID, SECOND]]);
    console.log("removed qa-journeys fixture tenants");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
