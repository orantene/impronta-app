// usage: node sql.mjs "<sql>"  — runs against the ISOLATED branch only; refuses production.
import pg from "pg";
const url = process.env.DATABASE_URL ?? "";
if (!url.includes("fxlankepwnvelxjrahwk") && !/pooler\.supabase\.com/.test(url)) throw new Error("not the isolated url");
if (url.includes("pluhdapdnuiulvxmyspd")) throw new Error("refusing production");
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const ref = await c.query("select current_setting('request.jwt.claims', true) as j, current_database() as db, inet_server_addr()::text as addr");
const r = await c.query(process.argv[2]);
console.log(JSON.stringify(r.rows, null, 1));
await c.end();
