const fs = require('fs');
const { Client } = require('pg');

(async () => {
  const sql = fs.readFileSync('/Users/oranpersonal/Desktop/impronta-app/supabase/migrations/20260911000000_user_prefs.sql', 'utf8');
  // Use pooler URL — direct DB has IPv6-only since 2025; pooler is IPv4 reachable.
  const POOLER_URL = "postgresql://postgres.pluhdapdnuiulvxmyspd:0eQIqWCVeiHtbBP2.@aws-0-us-east-1.pooler.supabase.com:5432/postgres";
  const client = new Client({ connectionString: POOLER_URL, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    console.log("Connected via pooler.");
    const exists = await client.query("SELECT to_regclass('public.user_prefs') AS t");
    console.log("Exists?", exists.rows[0]);
    if (exists.rows[0].t) {
      console.log("Already exists — nothing to do.");
      await client.end();
      process.exit(0);
    }
    console.log("Applying migration...");
    await client.query(sql);
    console.log("Applied.");
    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log("Schema reload notified.");
  } catch (e) {
    console.error("Error:", e.message, e.code);
    process.exit(1);
  } finally {
    try { await client.end(); } catch {}
  }
})();
