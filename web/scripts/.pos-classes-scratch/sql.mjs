// Run one SQL statement against the isolated qa-journeys branch. Usage: node --env-file=<env> sql.mjs "<sql>"
import pg from "pg";
const cs = process.env.DATABASE_URL;
if (!cs) { console.error("no connection string"); process.exit(2); }
if (!/fxlankepwnvelxjrahwk/.test(cs) && !/fxlankepwnvelxjrahwk/.test(process.env.NEXT_PUBLIC_SUPABASE_URL || "")) { console.error("refusing: not the isolated branch"); process.exit(3); }
const c = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  const r = await c.query(process.argv[2]);
  const rows = Array.isArray(r) ? r.flatMap(x => x.rows) : r.rows;
  console.log(JSON.stringify(rows, null, 1));
} finally { await c.end(); }
