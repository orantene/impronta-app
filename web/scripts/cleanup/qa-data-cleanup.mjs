#!/usr/bin/env node
// ============================================================================
// qa-data-cleanup.mjs  (TUL-3)  -- remove QA test data. DRY-RUN BY DEFAULT.
// ============================================================================
//
// README (for Oran)
// -----------------
//   cd web
//   node scripts/cleanup/qa-data-cleanup.mjs            # dry-run: counts + ids, deletes NOTHING
//   node scripts/cleanup/qa-data-cleanup.mjs --apply    # really deletes (one transaction, all-or-nothing)
//
// Needs SUPABASE_ACCESS_TOKEN + NEXT_PUBLIC_SUPABASE_URL (read from web/.env.local
// automatically; keys are never printed). Talks to the DB through the Supabase
// Management API SQL endpoint (same pattern as apply-migration.mjs), so it works
// without IPv6.
//
// What it targets
//   (a) Jorgelina (TAL-93938, profile f048e578-...), ONLY:
//       - 5 cancelled test bookings (ids starting e3a272da, 6fc83d42, 7ff1b34e,
//         61a33e00, 7d479e6b; must be status=cancelled, hers)
//       - inquiries linked to her where contact name starts with "QA " or equals
//         "Tip Oferta"/"To", or email is orantenemx@gmail.com or ends @impronta.test
//         (+ their threads/messages/offers/etc. and user_notifications raised by them)
//       - her talent_client_records / customers that match the same patterns
//       Her profile, services, site, settings and every non-matching client are
//       never selected. Inquiries from other names (e.g. "Ana Prueba") are listed
//       as "NOT TOUCHED" so you can decide.
//   (b) throwaway accounts: TAL-93937 (qa-fresh-20261004-e@impronta.test),
//       TAL-93943 (orantene+tulafresh1007@gmail.com), workspace qa-fresh-studio-2
//       (orantene+tulabiz1007@gmail.com): auth users, profiles, sites, domains,
//       memberships and everything hanging off them.
//
// How deletion works: the root rows above are expanded through the database's
// real foreign-key graph (rows that would be deleted by cascade, or that block
// the delete via NO ACTION/RESTRICT, are included; SET NULL links are left).
// --apply sends ONE script (BEGIN ... DELETE children-first ... COMMIT); any error
// rolls everything back. Safety guard: it aborts if the expansion would reach
// Jorgelina's profile, her auth user, or her workspace.
// NOT covered: Storage files (images) and Vercel/DNS domains; remove by hand.
// ============================================================================

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const envFile = join(HERE, "..", "..", ".env.local");
if (existsSync(envFile)) {
  for (const l of readFileSync(envFile, "utf8").split("\n")) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const APPLY = process.argv.includes("--apply");
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!TOKEN || !URL_) {
  console.error("[qa-cleanup] missing SUPABASE_ACCESS_TOKEN / NEXT_PUBLIC_SUPABASE_URL (web/.env.local)");
  process.exit(1);
}
const REF = new URL(URL_).hostname.split(".")[0];

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`SQL failed (${r.status}): ${t.slice(0, 600)}`);
  return JSON.parse(t);
}
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const arr = (ids) => `array[${ids.map(lit).join(",")}]::text[]`;

// ---- constants ------------------------------------------------------------
const JOR = "f048e578-cbae-45db-9a3b-34239abea136";
const BOOKING_PREFIXES = ["e3a272da", "6fc83d42", "7ff1b34e", "61a33e00", "7d479e6b"];
const NAME_RE = `(contact_name ~* '^QA ' or contact_name in ('Tip Oferta','To') or lower(contact_email) = 'orantenemx@gmail.com' or lower(contact_email) like '%@impronta.test')`;
const THROWAWAY = [
  { code: "TAL-93937", email: "qa-fresh-20261004-e@impronta.test" },
  { code: "TAL-93943", email: "orantene+tulafresh1007@gmail.com" },
];
const WS_SLUG = "qa-fresh-studio-2";
const WS_EMAIL = "orantene+tulabiz1007@gmail.com";

// ---- schema metadata ------------------------------------------------------
const pkRows = await sql(`
  select n.nspname s, c.relname t, array_agg(a.attname::text order by x.ord) cols
  from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
  cross join lateral unnest(k.conkey) with ordinality x(attnum,ord)
  join pg_attribute a on a.attrelid=c.oid and a.attnum=x.attnum
  where k.contype='p' and n.nspname in ('public','auth') group by 1,2`);
const PK = new Map(pkRows.map((r) => [`${r.s}.${r.t}`, r.cols]));
const fkRows = await sql(`
  select k.oid::int id, pn.nspname ps, pc.relname pt, cn.nspname cs, cc.relname ct, k.confdeltype del,
    (select array_agg(a.attname::text order by x.ord) from unnest(k.conkey) with ordinality x(attnum,ord) join pg_attribute a on a.attrelid=k.conrelid and a.attnum=x.attnum) ccols,
    (select array_agg(a.attname::text order by x.ord) from unnest(k.confkey) with ordinality x(attnum,ord) join pg_attribute a on a.attrelid=k.confrelid and a.attnum=x.attnum) pcols
  from pg_constraint k join pg_class pc on pc.oid=k.confrelid join pg_namespace pn on pn.oid=pc.relnamespace
  join pg_class cc on cc.oid=k.conrelid join pg_namespace cn on cn.oid=cc.relnamespace
  where k.contype='f' and pn.nspname in ('public','auth') and cn.nspname in ('public','auth')`);
const CHILD_FKS = new Map(); // parent -> fks (excluding SET NULL / SET DEFAULT)
for (const f of fkRows) {
  if (f.del === "n" || f.del === "d") continue;
  const p = `${f.ps}.${f.pt}`;
  if (!CHILD_FKS.has(p)) CHILD_FKS.set(p, []);
  CHILD_FKS.get(p).push(f);
}
const q = (name) => name.split(".").map((p) => `"${p}"`).join(".");
const keyExpr = (tbl, alias) => {
  const cols = PK.get(tbl);
  if (!cols) return null;
  return `concat_ws('|', ${cols.map((c) => `${alias}."${c}"::text`).join(",")})`;
};

// ---- roots ----------------------------------------------------------------
const roots = new Map(); // table -> Set(key)
const notes = [];
const addRoot = (tbl, keys) => {
  if (!keys.length) return;
  if (!roots.has(tbl)) roots.set(tbl, new Set());
  keys.forEach((k) => roots.get(tbl).add(k));
};
const ids = (rows, c = "id") => rows.map((r) => r[c]);

// (a) Jorgelina
const jor = (await sql(`select user_id, created_by_agency_id, profile_code from talent_profiles where id=${lit(JOR)}`))[0];
if (!jor || jor.profile_code !== "TAL-93938") throw new Error("Jorgelina profile not found / code mismatch; aborting");
const bk = await sql(`select id, status, client_label from talent_bookings where talent_profile_id=${lit(JOR)} and left(id::text,8) = any(${arr(BOOKING_PREFIXES)}) and status='cancelled'`);
addRoot("public.talent_bookings", ids(bk));
notes.push(`bookings matched: ${bk.length}/5 (${bk.map((b) => b.id.slice(0, 8)).join(", ")})`);

const inqSel = `from inquiries where ${NAME_RE} and id in (select inquiry_id from inquiry_participants where talent_profile_id=${lit(JOR)})`;
const inq = await sql(`select id, contact_name, customer_id ${inqSel}`);
addRoot("public.inquiries", ids(inq));
const other = await sql(`select id, contact_name from inquiries where not ${NAME_RE} and id in (select inquiry_id from inquiry_participants where talent_profile_id=${lit(JOR)})`);
notes.push(`inquiries matched: ${inq.length}; NOT TOUCHED (her other inquiries): ${other.length} [${[...new Set(other.map((o) => o.contact_name))].join(", ")}]`);

const tcr = await sql(`select id from talent_client_records where talent_profile_id=${lit(JOR)} and (name ~* '^QA ' or name in ('Tip Oferta','To') or lower(email)='orantenemx@gmail.com' or lower(email) like '%@impronta.test')`);
addRoot("public.talent_client_records", ids(tcr));
const cust = await sql(`select id from customers where (tenant_id=${lit(jor.created_by_agency_id)} or owner_talent_profile_id=${lit(JOR)}) and (display_name ~* '^QA ' or display_name in ('Tip Oferta','To') or lower(email)='orantenemx@gmail.com' or lower(email) like '%@impronta.test')`);
addRoot("public.customers", ids(cust));
const un = await sql(`select id from user_notifications where origin_inquiry_id = any(${arr(ids(inq))}::uuid[]) or (user_id=${lit(jor.user_id)} and (coalesce(title,'')||' '||coalesce(body,'')) ~* '(^|[^a-z])QA ')`);
addRoot("public.user_notifications", ids(un));

// (b) throwaway accounts
const throwUsers = [];
for (const t of THROWAWAY) {
  const p = (await sql(`select tp.id, tp.user_id, u.email from talent_profiles tp left join auth.users u on u.id=tp.user_id where tp.profile_code=${lit(t.code)}`))[0];
  if (!p) { notes.push(`${t.code}: profile not found (already gone?)`); continue; }
  if ((p.email || "").toLowerCase() !== t.email) throw new Error(`${t.code} owner email mismatch; aborting`);
  addRoot("public.talent_profiles", [p.id]);
  addRoot("auth.users", [p.user_id]);
  throwUsers.push(p.user_id);
}
const ws = (await sql(`select id from agencies where slug=${lit(WS_SLUG)}`))[0];
const wsUser = (await sql(`select id from auth.users where lower(email)=${lit(WS_EMAIL)}`))[0];
if (ws) addRoot("public.agencies", [ws.id]); else notes.push("workspace qa-fresh-studio-2: not found");
if (wsUser) { addRoot("auth.users", [wsUser.id]); throwUsers.push(wsUser.id); } else notes.push("business admin auth user: not found");
const extraTalent = throwUsers.length ? await sql(`select id from talent_profiles where user_id = any(${arr(throwUsers)}::uuid[])`) : [];
addRoot("public.talent_profiles", ids(extraTalent));

// ---- FK closure -----------------------------------------------------------
const found = new Map(); // table -> Set(key)   (also records discovery order)
const order = [];
const noPk = new Set();
let frontier = new Map();
for (const [t, ks] of roots) {
  if (!PK.has(t)) { noPk.add(t); continue; }
  found.set(t, new Set(ks)); order.push(t); frontier.set(t, [...ks]);
}
while (frontier.size) {
  const next = new Map();
  for (const [ptbl, keys] of frontier) {
    const fks = CHILD_FKS.get(ptbl) || [];
    const parts = [];
    for (const f of fks) {
      const ctbl = `${f.cs}.${f.ct}`;
      const ck = keyExpr(ctbl, "c");
      if (!ck) { noPk.add(ctbl); continue; }
      const cc = f.ccols.map((c) => `c."${c}"`).join(",");
      const pc = f.pcols.map((c) => `p."${c}"`).join(",");
      parts.push(`select ${lit(ctbl)} t, ${ck} k from ${q(ctbl)} c where (${cc}) in (select ${pc} from ${q(ptbl)} p where ${keyExpr(ptbl, "p")} = any(${arr(keys)}))`);
    }
    for (let i = 0; i < parts.length; i += 40) {
      const rows = await sql(parts.slice(i, i + 40).join(" union all "));
      for (const r of rows) {
        if (!found.has(r.t)) { found.set(r.t, new Set()); order.push(r.t); }
        if (!found.get(r.t).has(r.k)) {
          found.get(r.t).add(r.k);
          if (!next.has(r.t)) next.set(r.t, []);
          next.get(r.t).push(r.k);
        }
      }
    }
  }
  frontier = next;
}

// ---- safety guard ---------------------------------------------------------
const bad = [];
if (found.get("public.talent_profiles")?.has(JOR)) bad.push("Jorgelina profile");
if (found.get("auth.users")?.has(jor.user_id)) bad.push("Jorgelina auth user");
if (found.get("public.agencies")?.has(jor.created_by_agency_id)) bad.push("Jorgelina workspace");
if (bad.length) { console.error("[qa-cleanup] ABORT, closure reaches: " + bad.join(", ")); process.exit(2); }

// ---- report ---------------------------------------------------------------
console.log(`[qa-cleanup] mode: ${APPLY ? "APPLY" : "DRY-RUN (no changes)"}`);
for (const n of notes) console.log("  - " + n);
if (noPk.size) console.log("  - tables without primary key skipped (a delete may fail and roll back): " + [...noPk].join(", "));
console.log("\nRows that would be deleted, per table (roots first):");
let total = 0;
for (const t of order) {
  const n = found.get(t).size; total += n;
  const isRoot = roots.has(t);
  console.log(`  ${t.padEnd(46)} ${String(n).padStart(5)}${isRoot ? "  (root)" : ""}`);
}
console.log(`  ${"TOTAL".padEnd(46)} ${String(total).padStart(5)}`);
console.log("\nRoot ids:");
for (const [t, ks] of roots) console.log(`  ${t}: ${[...ks].map((k) => k.slice(0, 8)).join(", ")}`);

if (!APPLY) { console.log("\nDry-run only. Re-run with --apply to delete."); process.exit(0); }

// ---- apply: children first, one transaction -------------------------------
const stmts = ["begin;"];
for (const t of [...order].reverse()) {
  stmts.push(`delete from ${q(t)} c where ${keyExpr(t, "c")} = any(${arr([...found.get(t)])});`);
}
stmts.push("commit;");
await sql(stmts.join("\n"));
console.log("\n[qa-cleanup] APPLIED. Re-run (dry-run) to confirm zero rows remain.");
