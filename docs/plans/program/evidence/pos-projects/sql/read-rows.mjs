// Runs one SQL statement against the ISOLATED branch only; refuses production. No secret is printed.
// usage (from web/, isolated env exported): SQL="select ..." node --input-type=module -e "$(cat ../docs/plans/program/evidence/pos-projects/sql/read-rows.mjs)"
import pg from "pg";
const url = process.env.DATABASE_URL ?? "";
if (url.includes("pluhdapdnuiulvxmyspd")) throw new Error("refusing production");
if (!url.includes("fxlankepwnvelxjrahwk") && !/pooler\.supabase\.com/.test(url)) throw new Error("not the isolated url");
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query(process.env.SQL);
console.log(JSON.stringify(r.rows, null, 1));
await c.end();
