#!/usr/bin/env node
/**
 * TUL-334 — delete undeletable qa-onb-choice test users on fxlank ONLY.
 *
 * Auth admin delete fails with "Database error deleting user" when talent
 * (and other) rows still reference the user. This script expands the real FK
 * graph from those users + their talent profiles + their qa-onb-% agencies,
 * then deletes children-first in one transaction, dry-run by default.
 *
 * Usage (from web/):
 *   JOURNEYS_ISOLATED=1 node --env-file=.env.capacity-isolated.local \
 *     scripts/cleanup/cleanup-qa-onb-choice-users.mjs
 *   … same … --apply --yes     # actually delete (requires backup-dir)
 *
 * Guards (any failure → exit 2, no writes):
 *   - isolated-target-guard (JOURNEYS_ISOLATED=1 + fxlank URL/ref)
 *   - explicit project-ref === fxlankepwnvelxjrahwk
 *   - email allow-list: /^qa-onb-choice([+._-]|$)/ @ impronta.test
 *   - FK closure must not leave the target set / must not touch Jorgelina
 *
 * Never production. Never db:push. PM / operator runs --apply on fxlank.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  assertIsolatedJourneysTarget,
  QA_JOURNEYS_PROJECT_REF,
} from "../isolated-target-guard.mjs";
import {
  FXLANK_PROJECT_REF,
  JORGELINA_TALENT_PROFILE_ID,
  JORGELINA_PROFILE_CODE,
  isQaOnbChoiceEmail,
  assertFxlankProjectRef,
  projectRefFromSupabaseUrl,
  closureSafetyViolations,
  deleteStatementsChildrenFirst,
} from "./cleanup-qa-onb-choice-users.lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes("--apply");
const YES = process.argv.includes("--yes");
const bdIdx = process.argv.indexOf("--backup-dir");
const BACKUP_DIR = bdIdx > -1 ? process.argv[bdIdx + 1] : null;

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  // Never load production Vercel dumps into a destructive script.
  if (path.endsWith(".env.vercel.local")) {
    console.error("[qa-onb-choice-cleanup] refusing to load .env.vercel.local");
    process.exit(2);
  }
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

// Prefer the isolated capacity env; fall back to .env.local only after that.
loadEnvFile(join(HERE, "..", "..", ".env.capacity-isolated.local"));
loadEnvFile(join(HERE, "..", "..", ".env.local"));

assertIsolatedJourneysTarget(process.env, { requireIsolatedFlag: true });

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const refFromUrl = projectRefFromSupabaseUrl(URL_);
const refCheck = assertFxlankProjectRef(refFromUrl);
if (!refCheck.ok) {
  console.error(
    `[qa-onb-choice-cleanup] refusing: project ref must be ${FXLANK_PROJECT_REF} (got ${refCheck.got ?? refCheck.reason}). Never production.`,
  );
  process.exit(2);
}
if ((process.env.SUPABASE_PROJECT_REF ?? "") && process.env.SUPABASE_PROJECT_REF !== FXLANK_PROJECT_REF) {
  console.error("[qa-onb-choice-cleanup] refusing: SUPABASE_PROJECT_REF is not fxlank.");
  process.exit(2);
}
if (refFromUrl !== QA_JOURNEYS_PROJECT_REF) {
  console.error("[qa-onb-choice-cleanup] refusing: URL host is not the qa-journeys project.");
  process.exit(2);
}

if (!TOKEN || !SERVICE || !URL_) {
  console.error(
    "[qa-onb-choice-cleanup] need SUPABASE_ACCESS_TOKEN + SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL (isolated env only).",
  );
  process.exit(1);
}

if (APPLY && !YES) {
  console.error("[qa-onb-choice-cleanup] --apply requires --yes (destructive). Dry-run is the default.");
  process.exit(2);
}
if (APPLY && !BACKUP_DIR) {
  console.error("[qa-onb-choice-cleanup] --apply requires --backup-dir <dir> (export rows before delete).");
  process.exit(2);
}

const REF = FXLANK_PROJECT_REF;

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
const q = (name) => name.split(".").map((p) => `"${p}"`).join(".");

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

// ---- discover targets -----------------------------------------------------
const listed = [];
for (let page = 1; page <= 20; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  const batch = data?.users ?? [];
  listed.push(...batch);
  if (batch.length < 200) break;
}

const targets = listed.filter((u) => isQaOnbChoiceEmail(u.email ?? ""));
const targetUserIds = targets.map((u) => u.id);
console.log(`[qa-onb-choice-cleanup] project=${REF} mode=${APPLY ? "APPLY" : "DRY-RUN"}`);
console.log(`[qa-onb-choice-cleanup] matched ${targets.length} qa-onb-choice auth user(s):`);
for (const u of targets) console.log(`  - ${u.id}  <${u.email}>`);

if (targets.length === 0) {
  console.log("[qa-onb-choice-cleanup] nothing to do.");
  process.exit(0);
}

const talentRows = await sql(`
  select id, user_id, profile_code
  from public.talent_profiles
  where user_id = any(${arr(targetUserIds)}::uuid[])
`);
for (const t of talentRows) {
  if (t.id === JORGELINA_TALENT_PROFILE_ID || t.profile_code === JORGELINA_PROFILE_CODE) {
    console.error("[qa-onb-choice-cleanup] ABORT: target set somehow includes Jorgelina");
    process.exit(2);
  }
}
const targetTalentIds = talentRows.map((t) => t.id);
console.log(`[qa-onb-choice-cleanup] talent_profiles owned by targets: ${targetTalentIds.length}`);

// Agencies the targets solely own, and only throwaway qa-onb-% slugs.
const agencyRows = targetUserIds.length
  ? await sql(`
      select a.id, a.slug, m.profile_id as owner_id
      from public.agencies a
      join public.agency_memberships m
        on m.tenant_id = a.id and m.role = 'owner' and m.status = 'active'
      where m.profile_id = any(${arr(targetUserIds)}::uuid[])
        and a.slug like 'qa-onb-%'
        and not exists (
          select 1 from public.agency_memberships o
          where o.tenant_id = a.id and o.status = 'active' and o.profile_id <> m.profile_id
        )
    `)
  : [];
const targetAgencyIds = agencyRows.map((a) => a.id);
console.log(`[qa-onb-choice-cleanup] sole-owned qa-onb-% agencies: ${targetAgencyIds.length}`);
for (const a of agencyRows) console.log(`  - ${a.id}  slug=${a.slug}`);

// ---- schema metadata + FK closure (same idea as qa-data-cleanup) ----------
const pkRows = await sql(`
  select n.nspname s, c.relname t, array_agg(a.attname::text order by x.ord) cols
  from pg_constraint k
  join pg_class c on c.oid = k.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral unnest(k.conkey) with ordinality x(attnum, ord)
  join pg_attribute a on a.attrelid = c.oid and a.attnum = x.attnum
  where k.contype = 'p' and n.nspname in ('public', 'auth')
  group by 1, 2`);
const PK = new Map(pkRows.map((r) => [`${r.s}.${r.t}`, r.cols]));

const fkRows = await sql(`
  select k.oid::int id, pn.nspname ps, pc.relname pt, cn.nspname cs, cc.relname ct, k.confdeltype del,
    (select array_agg(a.attname::text order by x.ord)
       from unnest(k.conkey) with ordinality x(attnum, ord)
       join pg_attribute a on a.attrelid = k.conrelid and a.attnum = x.attnum) ccols,
    (select array_agg(a.attname::text order by x.ord)
       from unnest(k.confkey) with ordinality x(attnum, ord)
       join pg_attribute a on a.attrelid = k.confrelid and a.attnum = x.attnum) pcols
  from pg_constraint k
  join pg_class pc on pc.oid = k.confrelid join pg_namespace pn on pn.oid = pc.relnamespace
  join pg_class cc on cc.oid = k.conrelid join pg_namespace cn on cn.oid = cc.relnamespace
  where k.contype = 'f'
    and pn.nspname in ('public', 'auth')
    and cn.nspname in ('public', 'auth')`);

const CHILD_FKS = new Map();
for (const f of fkRows) {
  // Skip SET NULL / SET DEFAULT — those do not block a parent delete.
  if (f.del === "n" || f.del === "d") continue;
  const p = `${f.ps}.${f.pt}`;
  if (!CHILD_FKS.has(p)) CHILD_FKS.set(p, []);
  CHILD_FKS.get(p).push(f);
}

const keyExpr = (tbl, alias) => {
  const cols = PK.get(tbl);
  if (!cols) return null;
  return `concat_ws('|', ${cols.map((c) => `${alias}."${c}"::text`).join(",")})`;
};

const roots = new Map();
const addRoot = (tbl, keys) => {
  if (!keys.length) return;
  if (!roots.has(tbl)) roots.set(tbl, new Set());
  keys.forEach((k) => roots.get(tbl).add(k));
};
addRoot("auth.users", targetUserIds);
addRoot("public.talent_profiles", targetTalentIds);
addRoot("public.agencies", targetAgencyIds);

const found = new Map();
const order = [];
const noPk = new Set();
let frontier = new Map();
for (const [t, ks] of roots) {
  if (!PK.has(t)) {
    noPk.add(t);
    continue;
  }
  found.set(t, new Set(ks));
  order.push(t);
  frontier.set(t, [...ks]);
}

while (frontier.size) {
  const next = new Map();
  for (const [ptbl, keys] of frontier) {
    const fks = CHILD_FKS.get(ptbl) || [];
    const parts = [];
    for (const f of fks) {
      const ctbl = `${f.cs}.${f.ct}`;
      const ck = keyExpr(ctbl, "c");
      if (!ck) {
        noPk.add(ctbl);
        continue;
      }
      const cc = f.ccols.map((c) => `c."${c}"`).join(",");
      const pc = f.pcols.map((c) => `p."${c}"`).join(",");
      parts.push(
        `select ${lit(ctbl)} t, ${ck} k from ${q(ctbl)} c where (${cc}) in (select ${pc} from ${q(ptbl)} p where ${keyExpr(ptbl, "p")} = any(${arr(keys)}))`,
      );
    }
    for (let i = 0; i < parts.length; i += 40) {
      const rows = await sql(parts.slice(i, i + 40).join(" union all "));
      for (const r of rows) {
        if (!found.has(r.t)) {
          found.set(r.t, new Set());
          order.push(r.t);
        }
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

const foundUserIds = [...(found.get("auth.users") || [])];
const foundTalentIds = [...(found.get("public.talent_profiles") || [])];
const foundAgencyIds = [...(found.get("public.agencies") || [])];
const violations = closureSafetyViolations({
  targetUserIds,
  targetTalentIds,
  targetAgencyIds,
  foundUserIds,
  foundTalentIds,
  foundAgencyIds,
});
if (violations.length) {
  console.error("[qa-onb-choice-cleanup] ABORT:\n  - " + violations.join("\n  - "));
  process.exit(2);
}

console.log("\nRows that would be deleted, per table (roots first):");
let total = 0;
for (const t of order) {
  const n = found.get(t).size;
  total += n;
  console.log(`  ${t.padEnd(48)} ${String(n).padStart(5)}${roots.has(t) ? "  (root)" : ""}`);
}
console.log(`  ${"TOTAL".padEnd(48)} ${String(total).padStart(5)}`);
if (noPk.size) {
  console.log("  tables without PK skipped (may block apply): " + [...noPk].join(", "));
}

if (!APPLY) {
  console.log("\nDry-run only. Re-run with --apply --yes --backup-dir <dir> on fxlank to delete.");
  process.exit(0);
}

// ---- backup then apply ----------------------------------------------------
mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
chmodSync(BACKUP_DIR, 0o700);
let backedUp = 0;
for (const t of order) {
  const keys = [...found.get(t)];
  const rows = [];
  for (let i = 0; i < keys.length; i += 200) {
    rows.push(
      ...(await sql(
        `select to_jsonb(c) as row from ${q(t)} c where ${keyExpr(t, "c")} = any(${arr(keys.slice(i, i + 200))})`,
      )),
    );
  }
  if (rows.length !== keys.length) {
    throw new Error(`backup mismatch for ${t}: ${rows.length}/${keys.length}; nothing deleted`);
  }
  writeFileSync(join(BACKUP_DIR, `${t}.json`), JSON.stringify(rows.map((r) => r.row)), { mode: 0o600 });
  backedUp += rows.length;
}
console.log(`\n[qa-onb-choice-cleanup] backed up ${backedUp} rows to ${BACKUP_DIR}`);

// Delete public dependents via SQL (children-first). Leave the entire auth.*
// schema to GoTrue's admin deleteUser — raw SQL there is unreliable.
const sqlOrder = order.filter((t) => !t.startsWith("auth."));
const sqlFound = new Map([...found].filter(([t]) => !t.startsWith("auth.")));
const stmts = deleteStatementsChildrenFirst(sqlOrder, sqlFound, keyExpr, q, arr);
await sql(stmts.join("\n"));
console.log("[qa-onb-choice-cleanup] public FK dependents deleted");

for (const u of targets) {
  const { error } = await admin.auth.admin.deleteUser(u.id);
  if (error && !/not.?found/i.test(error.message)) {
    console.error(`[qa-onb-choice-cleanup] auth.deleteUser ${u.email}: ${error.message}`);
    process.exit(1);
  }
  console.log(`[qa-onb-choice-cleanup] auth user removed: ${u.email}`);
}

console.log("\n[qa-onb-choice-cleanup] APPLIED on fxlank. Re-run dry-run to confirm zero matches.");
