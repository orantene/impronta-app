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
//         "Tip Oferta"/"To", or email ends @impronta.test
//         (+ their threads/messages/offers/etc. and user_notifications raised by them)
//       - her talent_client_records / customers (customers.owner_talent_profile_id
//         = her, NOTHING else: the hub tenant is shared with 306 talents) that
//         match the same patterns
//       Her profile, services, site, settings and every non-matching client are
//       never selected. EXCLUDE_IDS (Oran's orantenemx@gmail.com test thread:
//       inquiry f138f2e8..., customer 961e18ff...) are never roots and the run
//       aborts if the closure reaches them. Her "Ana ..." inquiries are printed
//       under "Proposed: test data" and are NEVER deleted by --apply.
//   (a2) EXPLICIT_HUB_ROOTS: two hub-tenant rows deliberately requested by Oran
//       (agency_bookings QA Test TUL-92, one order); each is verified to exist first.
//   (b) throwaway accounts: TAL-93937 (qa-fresh-20261004-e@impronta.test),
//       TAL-93943 (orantene+tulafresh1007@gmail.com), workspace qa-fresh-studio-2
//       (orantene+tulabiz1007@gmail.com): auth users, profiles, sites, domains,
//       memberships and everything hanging off them.
//
// How deletion works: the root rows above are expanded through the database's
// real foreign-key graph (rows that would be deleted by cascade, or that block
// the delete via NO ACTION/RESTRICT, are included; SET NULL links are left).
// --apply sends ONE script (BEGIN ... DELETE children-first ... COMMIT); any error
// rolls everything back. Safety guards (abort, exit 2, even in dry-run): the
// expansion reaches Jorgelina's profile/user/workspace or an EXCLUDE_IDS row, any
// root resolves to an owner that is not Jorgelina or a throwaway account (except
// EXPLICIT_HUB_ROOTS), or the closure touches a talent profile / customer /
// agency outside the throwaway set. Dry-run sends read_only:true on every call.
// NOT covered: Storage files (images) and Vercel/DNS domains; remove by hand.
// ============================================================================

import { readFileSync, existsSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
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
// PHASE 1 (approved 2026-10-07): Jorgelina's QA rows + the 8 approved "Ana" test inquiries + the two
// explicit hub roots. Throwaway accounts/workspace are NOT included (held for TUL-77 / TUL-157).
const PHASE1 = process.argv.includes("--phase1");
const bdIdx = process.argv.indexOf("--backup-dir");
const BACKUP_DIR = bdIdx > -1 ? process.argv[bdIdx + 1] : null;
if (APPLY && !PHASE1) { console.error("[qa-cleanup] --apply requires --phase1 (phase 2, the throwaway accounts, is held until TUL-77 and TUL-157 are Done)"); process.exit(2); }
if (APPLY && !BACKUP_DIR) { console.error("[qa-cleanup] --apply requires --backup-dir <dir> (rows are exported before any delete)"); process.exit(2); }
const APPROVED_ANA = [
  "0243b469-402e-432f-a54f-786b38724dd9", "ae711bc6-9220-4c26-9777-f6d4cd390d0a", "ea651ce7-b062-4d23-ad76-7105ebd571d9",
  "23c6ff93-86bf-449b-b054-e537a30cd560", "f4cc49ed-b552-4cbd-b293-8f22a0d445c1", "ed789bb0-a428-41ce-8147-ea2921b82973",
  "9b5e47e7-2e35-472c-ac1e-4d0cab4c5965", "dd3ff652-38bb-4efe-869c-ea85c8771534",
];
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
    body: JSON.stringify(APPLY ? { query } : { query, read_only: true }),
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
const NAME_RE = `(contact_name ~* '^QA ' or contact_name in ('Tip Oferta','To') or lower(contact_email) like '%@impronta.test')`;// Oran's own orantenemx@gmail.com test thread: kept for verifying an inbox fix.
const EXCLUDE_IDS = new Set(["f138f2e8-d0ae-4ca2-a07b-38186565e412", "961e18ff-2b94-40a2-8d1c-d4539b51cf76"]);
const EXCL = `${arr([...EXCLUDE_IDS])}::uuid[]`;
// Hub-tenant rows Oran asked for by id (exempt from the owner check; existence verified first).
const EXPLICIT_HUB_ROOTS = [
  { table: "public.agency_bookings", id: "f2aab6ed-9bcf-4a5c-905e-e41e01625f1a", what: "agency_bookings QA Test TUL-92" },
  { table: "public.orders", id: "5f190eb7-c0da-4da6-b4d4-2c902be748eb", what: "orders (QA order)" },
];
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

const inqSel = `from inquiries where ${NAME_RE} and id <> all(${EXCL}) and id in (select inquiry_id from inquiry_participants where talent_profile_id=${lit(JOR)})`;
const inq = await sql(`select id, contact_name, customer_id ${inqSel}`);
addRoot("public.inquiries", ids(inq));
const other = await sql(`select id, contact_name from inquiries where not ${NAME_RE} and id <> all(${EXCL}) and id in (select inquiry_id from inquiry_participants where talent_profile_id=${lit(JOR)})`);
// Proposed (NOT roots): her "Ana ..." test inquiries. Printed in the report, never deleted.
const proposed = await sql(`select id, contact_name, contact_email, created_at from inquiries where contact_name ~* '^Ana ' and not ${NAME_RE} and id <> all(${EXCL}) and id in (select inquiry_id from inquiry_participants where talent_profile_id=${lit(JOR)}) order by created_at`);
notes.push(`inquiries matched: ${inq.length}; NOT TOUCHED (her other inquiries): ${other.length} [${[...new Set(other.map((o) => o.contact_name))].join(", ")}]`);

const tcr = await sql(`select id from talent_client_records where talent_profile_id=${lit(JOR)} and (name ~* '^QA ' or name in ('Tip Oferta','To') or lower(email) like '%@impronta.test')`);
addRoot("public.talent_client_records", ids(tcr));
const cust = await sql(`select id from customers where owner_talent_profile_id=${lit(JOR)} and id <> all(${EXCL}) and (display_name ~* '^QA ' or display_name in ('Tip Oferta','To') or lower(email) like '%@impronta.test')`);
addRoot("public.customers", ids(cust));
const un = await sql(`select id from user_notifications where not coalesce(origin_inquiry_id = any(${EXCL}), false) and (origin_inquiry_id = any(${arr(ids(inq))}::uuid[]) or (user_id=${lit(jor.user_id)} and (coalesce(title,'')||' '||coalesce(body,'')) ~* '(^|[^a-z])QA '))`);
addRoot("public.user_notifications", ids(un));
// PHASE 1 approved test data: Jorgelina's "Ana ..." inquiries (+ notifications raised by them).
if (PHASE1) {
  const ana = await sql(`select id, contact_name from inquiries where id = any(${arr(APPROVED_ANA)}::uuid[]) and contact_name ~* '^Ana ' and id <> all(${EXCL}) and id in (select inquiry_id from inquiry_participants where talent_profile_id=${lit(JOR)})`);
  notes.push(`approved Ana inquiries found: ${ana.length}/${APPROVED_ANA.length}`);
  addRoot("public.inquiries", ids(ana));
  if (ana.length) addRoot("public.user_notifications", ids(await sql(`select id from user_notifications where origin_inquiry_id = any(${arr(ids(ana))}::uuid[]) and origin_inquiry_id <> all(${EXCL})`)));
  notes.push("PHASE 1: throwaway accounts and workspace NOT included (held for TUL-77 / TUL-157)");
}

// (b) throwaway accounts
const throwUsers = [];
const throwProfiles = [];
if (!PHASE1) for (const t of THROWAWAY) {
  const p = (await sql(`select tp.id, tp.user_id, u.email from talent_profiles tp left join auth.users u on u.id=tp.user_id where tp.profile_code=${lit(t.code)}`))[0];
  if (!p) { notes.push(`${t.code}: profile not found (already gone?)`); continue; }
  if ((p.email || "").toLowerCase() !== t.email) throw new Error(`${t.code} owner email mismatch; aborting`);
  addRoot("public.talent_profiles", [p.id]);
  throwProfiles.push(p.id);
  addRoot("auth.users", [p.user_id]);
  throwUsers.push(p.user_id);
}
const ws = PHASE1 ? undefined : (await sql(`select id from agencies where slug=${lit(WS_SLUG)}`))[0];
const wsUser = PHASE1 ? undefined : (await sql(`select id from auth.users where lower(email)=${lit(WS_EMAIL)}`))[0];
if (ws) addRoot("public.agencies", [ws.id]); else if (!PHASE1) notes.push("workspace qa-fresh-studio-2: not found");
if (wsUser) { addRoot("auth.users", [wsUser.id]); throwUsers.push(wsUser.id); } else if (!PHASE1) notes.push("business admin auth user: not found");
const extraTalent = throwUsers.length ? await sql(`select id from talent_profiles where user_id = any(${arr(throwUsers)}::uuid[])`) : [];
addRoot("public.talent_profiles", ids(extraTalent));
throwProfiles.push(...ids(extraTalent));

// (c) explicit hub-tenant roots (verified to exist; skipped with a note if gone)
const explicitIds = new Set(EXPLICIT_HUB_ROOTS.map((e) => e.id));
for (const e of EXPLICIT_HUB_ROOTS) {
  const r = await sql(`select id from ${q(e.table)} where id=${lit(e.id)}`);
  if (r.length) addRoot(e.table, [e.id]); else notes.push(`explicit hub root ${e.what} ${e.id}: not found (already gone), skipped`);
}

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
for (const [t, ks] of found) for (const id of EXCLUDE_IDS) if (ks.has(id)) bad.push(`excluded row ${t} ${id}`);
if (found.get("public.talent_profiles")?.has(JOR)) bad.push("Jorgelina profile");
if (found.get("auth.users")?.has(jor.user_id)) bad.push("Jorgelina auth user");
if (found.get("public.agencies")?.has(jor.created_by_agency_id)) bad.push("Jorgelina workspace");
// Owner resolution for every root (EXPLICIT_HUB_ROOTS exempt): must be Jorgelina or a throwaway.
const okProfiles = [JOR, ...throwProfiles];
const okUsers = [jor.user_id, ...throwUsers];
const rootKeys = (t) => [...(roots.get(t) || [])].filter((k) => !explicitIds.has(k));
const strays = async (label, query, keys) => {
  if (!keys.length) return;
  const rows = await sql(query);
  for (const r of rows) bad.push(`${label} ${r.id} owned by ${r.owner ?? "unresolved"}`);
};
const A = (xs) => `${arr(xs)}::uuid[]`;
await strays("inquiries", `select i.id, p.talent_profile_id::text owner from inquiries i left join inquiry_participants p on p.inquiry_id=i.id where i.id=any(${A(rootKeys("public.inquiries"))}) and (p.talent_profile_id is not null and p.talent_profile_id <> all(${A(okProfiles)}))`, rootKeys("public.inquiries"));
await strays("talent_bookings", `select id, talent_profile_id::text owner from talent_bookings where id=any(${A(rootKeys("public.talent_bookings"))}) and (talent_profile_id is null or talent_profile_id <> all(${A(okProfiles)}))`, rootKeys("public.talent_bookings"));
await strays("talent_client_records", `select id, talent_profile_id::text owner from talent_client_records where id=any(${A(rootKeys("public.talent_client_records"))}) and talent_profile_id <> all(${A(okProfiles)})`, rootKeys("public.talent_client_records"));
await strays("customers", `select id, owner_talent_profile_id::text owner from customers where id=any(${A(rootKeys("public.customers"))}) and (owner_talent_profile_id is null or owner_talent_profile_id <> all(${A(okProfiles)}))`, rootKeys("public.customers"));
await strays("user_notifications", `select id, user_id::text owner from user_notifications where id=any(${A(rootKeys("public.user_notifications"))}) and user_id <> all(${A(okUsers)}) and not coalesce(origin_inquiry_id = any(${A(rootKeys("public.inquiries"))}), false)`, rootKeys("public.user_notifications"));
for (const id of rootKeys("public.talent_profiles")) if (!okProfiles.includes(id)) bad.push(`talent_profiles ${id} not a throwaway`);
for (const id of rootKeys("auth.users")) if (!okUsers.includes(id)) bad.push(`auth.users ${id} not a throwaway`);
for (const id of rootKeys("public.agencies")) if (id !== ws?.id) bad.push(`agencies ${id} not the throwaway workspace`);
for (const t of roots.keys()) {
  if (!["public.inquiries","public.talent_bookings","public.talent_client_records","public.customers","public.user_notifications","public.talent_profiles","auth.users","public.agencies"].includes(t) && rootKeys(t).length) bad.push(`root table ${t} has no owner check`);
}
// FK closure assertions
for (const id of found.get("public.talent_profiles") || []) if (!throwProfiles.includes(id)) bad.push(`closure talent_profiles ${id} is not a throwaway profile`);
for (const id of found.get("public.customers") || []) if (!(roots.get("public.customers") || new Set()).has(id)) bad.push(`closure customers ${id} is not a root`);
for (const id of found.get("public.agencies") || []) if (id !== ws?.id) bad.push(`closure agencies ${id} is not the throwaway workspace`);
if (bad.length) { console.error("[qa-cleanup] ABORT:\n  - " + bad.join("\n  - ")); process.exit(2); }

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
console.log("\nRoot rows (full ids):");
const LABEL = {
  "public.inquiries": `select id, contact_name a, contact_email b from inquiries`,
  "public.customers": `select id, display_name a, email::text b from customers`,
  "public.talent_bookings": `select id, client_label a, null b from talent_bookings`,
  "public.agency_bookings": `select id, to_jsonb(x)->>'title' a, null b from agency_bookings x`,
  "public.orders": `select id, status::text a, total_cents::text b from orders`,
};
for (const [t, ks] of roots) {
  console.log(`  ${t}:`);
  const lab = new Map();
  if (LABEL[t]) for (const r of await sql(`${LABEL[t]} where id::text = any(${arr([...ks])})`)) lab.set(r.id, r);
  for (const k of ks) {
    const r = lab.get(k);
    const extra = r ? `  ${r.a ?? ""}${r.b ? "  <" + r.b + ">" : ""}` : "";
    console.log(`    ${k}${extra}${explicitIds.has(k) ? "  (explicit hub root)" : ""}`);
  }
}
console.log(`\nProposed: test data (NOT roots, never deleted by --apply): ${proposed.length}`);
for (const r of proposed) console.log(`    ${r.id}  ${r.contact_name}  <${r.contact_email ?? ""}>  ${r.created_at}`);
console.log(`\nExcluded (kept): ${[...EXCLUDE_IDS].join(", ")}`);
console.log("touches other talents: 0");

if (!APPLY) { console.log("\nDry-run only. Re-run with --apply to delete."); process.exit(0); }

// ---- backup: export every row to be deleted (JSON per table) before any delete ----
mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
chmodSync(BACKUP_DIR, 0o700);
let backedUp = 0;
for (const t of order) {
  const keys = [...found.get(t)];
  const rows = [];
  for (let i = 0; i < keys.length; i += 200) {
    rows.push(...(await sql(`select to_jsonb(c) as row from ${q(t)} c where ${keyExpr(t, "c")} = any(${arr(keys.slice(i, i + 200))})`)));
  }
  if (rows.length !== keys.length) throw new Error(`backup mismatch for ${t}: ${rows.length}/${keys.length}; nothing deleted`);
  writeFileSync(join(BACKUP_DIR, `${t}.json`), JSON.stringify(rows.map((r) => r.row)), { mode: 0o600 });
  backedUp += rows.length;
}
console.log(`\n[qa-cleanup] backed up ${backedUp} rows to ${BACKUP_DIR}`);

// ---- apply: children first, one transaction -------------------------------
const stmts = ["begin;"];
// Deleting an offer SET-NULLs inquiries.current_offer_id, which the enforce_inquiry_status_offer_pair
// trigger rejects for offer_pending/approved/booked/converted. These inquiries are deleted in this same
// transaction, so close them first (still all-or-nothing).
const inqKeys = [...(found.get("public.inquiries") || [])];
if (inqKeys.length) stmts.push(`update public.inquiries set current_offer_id = null, status = 'closed' where id = any(${arr(inqKeys)}::uuid[]) and current_offer_id is not null;`);
for (const t of [...order].reverse()) {
  stmts.push(`delete from ${q(t)} c where ${keyExpr(t, "c")} = any(${arr([...found.get(t)])});`);
}
stmts.push("commit;");
await sql(stmts.join("\n"));
console.log("\n[qa-cleanup] APPLIED. Re-run (dry-run) to confirm zero rows remain.");
