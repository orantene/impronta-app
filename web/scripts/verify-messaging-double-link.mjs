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
    `select inquiry_id, record_kind, record_id, count(*)::int as n
       from public.conversation_records
      where unlinked_at is null
      group by 1, 2, 3
     having count(*) > 1`,
  );
  if (rows.length > 0) {
    console.error("FAIL double live link", rows[0]);
    process.exit(1);
  }
  console.log("PASS verify-messaging-double-link: at most one live link per record");
} finally {
  await client.end();
}
