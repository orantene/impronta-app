import { assertIsolatedJourneysTarget } from "./isolated-target-guard.mjs";

assertIsolatedJourneysTarget(process.env, { requireIsolatedFlag: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(2);
}

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  const { rows } = await client.query(
    `select id, version from public.orders
      where source_channel = 'messages' and status = 'draft'
      limit 1`,
  );
  if (rows.length === 0) {
    console.log("PASS verify-messaging-concurrent-draft: no messages drafts to race");
    process.exit(0);
  }
  const order = rows[0];
  const stale = await client.query(
    `update public.orders set version = version + 1
      where id = $1 and version = $2
      returning id`,
    [order.id, order.version + 50],
  );
  if (stale.rowCount !== 0) {
    console.error("FAIL stale version write landed");
    process.exit(1);
  }
  console.log("PASS verify-messaging-concurrent-draft: stale version refused");
} finally {
  await client.end();
}
