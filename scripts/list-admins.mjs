// Lists every admin/owner/staff and the agency (tenant) they're admin for.
// Reads DATABASE_URL from web/.env.local.
import { readFileSync } from "node:fs";
import pg from "pg";

const env = Object.fromEntries(
  readFileSync("web/.env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);

const client = new pg.Client({ connectionString: env.DATABASE_URL });
await client.connect();

const memberships = await client.query(`
  SELECT a.name AS agency_name,
         a.slug AS agency_slug,
         m.role,
         m.status,
         p.email,
         p.display_name,
         p.app_role
  FROM public.agency_memberships m
  JOIN public.agencies a ON a.id = m.tenant_id
  JOIN public.profiles p ON p.id = m.profile_id
  WHERE m.status = 'active'
  ORDER BY a.name, m.role, p.display_name;
`);

const supers = await client.query(`
  SELECT email, display_name, app_role, account_status
  FROM public.profiles
  WHERE app_role = 'super_admin'
  ORDER BY display_name;
`);

console.log("\n=== PLATFORM-LEVEL super_admins (admin of everything) ===");
for (const r of supers.rows) {
  console.log(`  ${r.display_name ?? "(no name)"} <${r.email}>  [${r.account_status ?? "?"}]`);
}

console.log("\n=== AGENCY MEMBERSHIPS (active) ===");
let last = "";
for (const r of memberships.rows) {
  const head = `${r.agency_name} (${r.agency_slug})`;
  if (head !== last) {
    console.log(`\n${head}`);
    last = head;
  }
  console.log(
    `  ${r.role.padEnd(11)} — ${(r.display_name ?? "(no name)").padEnd(28)} <${r.email}>  app_role=${r.app_role ?? "-"}`
  );
}

await client.end();
