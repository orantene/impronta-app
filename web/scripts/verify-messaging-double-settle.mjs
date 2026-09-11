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
  const tenant = process.env.JOURNEYS_TENANT_ID ?? "33333333-3333-4333-8333-333333333333";
  const { rows: links } = await client.query(
    `select id, reservation_id, status, operation_key
       from public.payment_links
      where tenant_id = $1
      order by created_at desc
      limit 5`,
    [tenant],
  );
  if (links.length === 0) {
    console.log("PASS verify-messaging-double-settle: no links to race (empty isolated tenant)");
    process.exit(0);
  }
  const link = links[0];
  const first = await client.query(
    `select public.messaging_recover_from_snapshot($1, $2, $3) as r`,
    [tenant, "00000000-0000-4000-8000-000000000000", link.id],
  );
  const reason = first.rows[0]?.r?.reason ?? first.rows[0]?.r?.ok;
  if (reason === true) {
    console.error("FAIL recover_from_snapshot wrote without a snapshot");
    process.exit(1);
  }
  const { rows: paid } = await client.query(
    `select count(*)::int as n from public.payment_links
      where tenant_id = $1 and operation_key = $2 and status = 'paid'`,
    [tenant, link.operation_key],
  );
  if (paid[0].n > 1) {
    console.error("FAIL double settle on operation_key", link.operation_key);
    process.exit(1);
  }
  console.log("PASS verify-messaging-double-settle: one paid row per operation_key");
} finally {
  await client.end();
}
