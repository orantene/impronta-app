/**
 * Staging demo hosts (TUL-890; TUL-537 row GRK-089). STAGING ONLY (fxlankepwnvelxjrahwk).
 *
 * karla-beltran-demo / saul-tapia-ortega-demo (and the held mateo-ferrer, alba, linh hosts) answer
 * "Domain not connected" on *.staging.tulala.digital because staging has no published demo site
 * with that slug: `talent_site_subdomain_lookup` needs talent_profiles (is_demo) + a published
 * talent_sites row (see scripts/lib/staging-demo-hosts.mjs for why agency_domains is not it).
 *
 * Modes (default: read-only DRY RUN that writes nothing):
 *   (none)                     target check, per-host diff (resolves / missing / held / blocked), ops count
 *   --selftest                 BEGIN; insert; check the lookup RPC resolves each seeded host; cleanup;
 *                              check zero rows left; ROLLBACK (nothing persists)
 *   --apply --backup-file <f>  insert and COMMIT (new rows only, ON CONFLICT DO NOTHING; re-run is a no-op)
 *   --cleanup [--apply --backup-file <f>]   delete ONLY this seed's rows (deterministic ids), FK descendants first
 *   --link-accounts [--apply --backup-file <f>]   give each seeded profile a demo login account
 *                              (demo-<slug>@impronta.test, no password, app_metadata.demo_batch = DEMO_BATCH as the
 *                              demo pipeline's guard requires, app_metadata.seed = staging-demo-hosts) and turn on
 *                              English (secondary_locales) where the host is flagged `english`. Needs
 *                              NEXT_PUBLIC_SUPABASE_URL (fxlank) + SUPABASE_SERVICE_ROLE_KEY in the env file. This is
 *                              what lets `npm run demos:rebuild -- --only <code>` build the real demo site.
 *   --only karla-beltran,...   limit the seeded hosts
 * Held hosts are reported, never written: their canonical profile code belongs to another staging talent.
 * Shared fxlank rows: note the PM before any --apply (feedback rule 2026-10-08).
 *
 * Run from web/: npx tsx scripts/seed-staging-demo-hosts.mts --env-file <tmp> [--selftest | --apply --backup-file <f>]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { buildDefaultShellTree, buildStarterHomePageTree } from "../src/lib/talent-site/default-max-site-trees";
import { DEMO_BATCH } from "../src/lib/talent-site/theme-catalog/demo-account";
import { STAGING_MARKER_AGENCY_ID, checkDbTarget, parseEnvText } from "./lib/group6-fixtures.mjs";
import { CHECK_ONLY_LABELS, DEMO_HOSTS, accountFor, checkApiTarget, diffLines, ownsAccount, hostOps, parseArgs, sdhId, selectHosts, verifyOps } from "./lib/staging-demo-hosts.mjs";

type Row = Record<string, unknown>;
type Op = { kind: string; table: string; key: string; id: string; row: Row; conflict: string[] };
type Host = (typeof DEMO_HOSTS)[number];
type PgClient = { connect(): Promise<void>; query(text: string, params?: unknown[]): Promise<{ rows: Row[]; rowCount: number | null }>; end(): Promise<void> };
const PG_MODULE = "pg";
const pgMod = (await import(PG_MODULE)) as { default: { Client: new (cfg: { connectionString?: string; ssl?: unknown }) => PgClient } };

const TAG = "[staging-demo-hosts]";
function die(msg: string, code = 1): never {
  console.error(`${TAG} ${msg}`);
  process.exit(code);
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("usage: seed-staging-demo-hosts.mts [--env-file p] [--only k1,k2] [--selftest | --apply --backup-file p | --cleanup [--apply --backup-file p]]");
  process.exit(0);
}
if (args.errors.length) die(args.errors.join("; "), 2);
if (args.backupFile && existsSync(args.backupFile)) die(`--backup-file ${args.backupFile} already exists; pass a new path (never overwritten)`, 2);

const env: Record<string, string | undefined> = { ...process.env };
if (args.envFile) Object.assign(env, parseEnvText(readFileSync(args.envFile, "utf8")));
const verdict = checkDbTarget(env);
if (!verdict.ok) die(`refusing to run:\n  - ${verdict.reasons.join("\n  - ")}`, 2);

const mode = args.linkAccounts
  ? (args.apply ? "link-apply" : "link-plan")
  : args.cleanup ? (args.apply ? "cleanup-apply" : "cleanup-plan") : args.selftest ? "selftest" : args.apply ? "apply" : "plan";
// Auth admin creates (link) or deletes (cleanup) demo login accounts; it refuses anything but fxlank.
function authApi() {
  const api = checkApiTarget(env);
  if (!api.ok) die(`refusing to run:\n  - ${api.reasons.join("\n  - ")}`, 2);
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).auth.admin;
}
const authAdmin = mode === "link-apply" ? authApi() : null;
const hosts = selectHosts(args.only) as Host[];
const client = new pgMod.default.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const q = (text: string, params: unknown[] = []) => client.query(text, params);

const backup: {
  target: string; mode: string; at: string;
  created: Array<{ table: string; id: string }>; deleted: Array<{ table: string; id: string; row: Row }>;
  accounts: Array<{ email: string; userId: string; action: "created" | "reused" | "deleted"; profileBefore?: Row }>;
} = { target: "fxlankepwnvelxjrahwk", mode, at: new Date().toISOString(), created: [], deleted: [], accounts: [] };
const saveBackup = () => {
  if (args.backupFile) writeFileSync(args.backupFile, JSON.stringify(backup, null, 2), { mode: 0o600 });
};

// ------------------------------------------------------------------ read-only observation
async function resolveLabel(label: string): Promise<string | null> {
  const r = await q("select site_slug from public.talent_site_subdomain_lookup($1) limit 1", [label]);
  return (r.rows[0]?.site_slug as string) ?? null;
}

async function observe() {
  const labels = [...DEMO_HOSTS.flatMap((h) => h.labels), ...CHECK_ONLY_LABELS];
  const resolved: Record<string, string | null> = {};
  for (const l of labels) resolved[l] = await resolveLabel(l);
  const codeOwner: Record<string, { demo: boolean; own: boolean } | null> = {};
  const slugTaken: Record<string, boolean> = {};
  const ownRows: Record<string, number> = {};
  for (const h of DEMO_HOSTS) {
    const c = await q("select id::text id, is_demo from public.talent_profiles where profile_code = $1", [h.code]);
    codeOwner[h.code] = c.rowCount ? { demo: Boolean(c.rows[0].is_demo), own: c.rows[0].id === sdhId(`talent:${h.key}`) } : null;
    const s = await q("select talent_profile_id::text tid from public.talent_sites where lower(site_slug) = $1", [h.baseSlug]);
    slugTaken[h.baseSlug] = Boolean(s.rowCount) && s.rows[0].tid !== sdhId(`talent:${h.key}`);
    ownRows[h.key] = (await ownRowIds(h)).length;
  }
  return { resolved, codeOwner, slugTaken, ownRows };
}

const OWN_TABLES = ["public.talent_pages", "public.talent_sites", "public.talent_profiles"] as const;
function ownIds(h: Host): Record<(typeof OWN_TABLES)[number], string> {
  return {
    "public.talent_pages": sdhId(`page:${h.key}:home`),
    "public.talent_sites": sdhId(`site:${h.key}`),
    "public.talent_profiles": sdhId(`talent:${h.key}`),
  };
}
async function ownRowIds(h: Host): Promise<string[]> {
  const out: string[] = [];
  for (const [table, id] of Object.entries(ownIds(h))) if ((await q(`select 1 from ${table} where id = $1`, [id])).rowCount) out.push(id);
  return out;
}

async function themeVersion(design: string): Promise<number | null> {
  const r = await q("select max(version)::int v from public.talent_theme_versions where design = $1", [design]);
  return (r.rows[0]?.v as number) ?? null;
}

// ------------------------------------------------------------------ writes
async function insertOps(ops: Op[]) {
  let created = 0;
  for (const op of ops) {
    const cols = Object.keys(op.row);
    const r = await q(
      `insert into ${op.table} (${cols.map((c) => `"${c}"`).join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) on conflict (${op.conflict.map((c) => `"${c}"`).join(",")}) do nothing`,
      cols.map((c) => op.row[c]),
    );
    if ((r.rowCount ?? 0) > 0) {
      created += 1;
      backup.created.push({ table: op.table, id: op.id });
      saveBackup();
    }
  }
  return created;
}

/** Delete rows that point at `ids` through single-column FKs (e.g. the hub roster row the insert trigger adds), then the rows. */
async function purge(table: string, ids: string[], depth = 0): Promise<number> {
  if (!ids.length || depth > 4) return 0;
  let n = 0;
  const fks = await q(
    `select c.conrelid::regclass::text t, a.attname col from pg_constraint c
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f' and c.confrelid = $1::regclass and array_length(c.conkey, 1) = 1`,
    [table],
  );
  for (const fk of fks.rows as Array<{ t: string; col: string }>) {
    if (OWN_TABLES.includes(fk.t as (typeof OWN_TABLES)[number]) || OWN_TABLES.includes(`public.${fk.t}` as (typeof OWN_TABLES)[number])) continue;
    const hasId = (await q("select 1 from information_schema.columns where table_schema||'.'||table_name = $1 and column_name = 'id'", [fk.t.includes(".") ? fk.t : `public.${fk.t}`])).rowCount;
    if (hasId) {
      const kids = await q(`select id::text id from ${fk.t} where "${fk.col}"::text = any($1::text[])`, [ids]);
      n += await purge(fk.t, kids.rows.map((r) => r.id as string), depth + 1);
    }
    const rows = await q(`delete from ${fk.t} where "${fk.col}"::text = any($1::text[]) returning to_jsonb(${fk.t.split(".").pop()}) j`, [ids]);
    for (const r of rows.rows) backup.deleted.push({ table: fk.t, id: String((r.j as Row).id ?? ""), row: r.j as Row });
    n += rows.rowCount ?? 0;
  }
  return n;
}

async function cleanup(selected: Host[]): Promise<number> {
  let n = 0;
  for (const table of OWN_TABLES) {
    const ids = selected.map((h) => ownIds(h)[table]);
    const present = (await q(`select id::text id from ${table} where id = any($1::uuid[])`, [ids])).rows.map((r) => r.id as string);
    if (!present.length) continue;
    n += await purge(table, present);
    const rows = await q(`delete from ${table} t where id = any($1::uuid[]) returning to_jsonb(t) j`, [present]);
    for (const r of rows.rows) backup.deleted.push({ table, id: String((r.j as Row).id), row: r.j as Row });
    n += rows.rowCount ?? 0;
    saveBackup();
  }
  return n;
}

// ------------------------------------------------------------------ demo login accounts
async function authUserByEmail(email: string): Promise<{ id: string; app_metadata: Row } | null> {
  const r = await q("select id::text id, raw_app_meta_data m from auth.users where lower(email) = lower($1)", [email]);
  return r.rowCount ? { id: r.rows[0].id as string, app_metadata: (r.rows[0].m ?? {}) as Row } : null;
}

/** Plan or link one demo login account per selected host whose profile row this seed owns. */
async function linkAccounts(selected: Host[], apply: boolean): Promise<number> {
  let n = 0;
  for (const h of selected) {
    const tid = ownIds(h)["public.talent_profiles"];
    const tp = await q("select user_id::text uid, secondary_locales sl from public.talent_profiles where id = $1", [tid]);
    if (!tp.rowCount) { console.log(`${TAG} ${h.key}: no seeded profile row (run --apply first); skipped`); continue; }
    const acct = accountFor(h, DEMO_BATCH);
    const existing = await authUserByEmail(acct.email);
    if (existing && !ownsAccount({ app_metadata: existing.app_metadata })) die(`${acct.email} exists and was not made by this seed; refusing`, 2);
    const linkedTo = tp.rows[0].uid as string | null;
    if (linkedTo && linkedTo !== existing?.id) die(`${h.key}: profile already linked to another account; refusing`, 2);
    console.log(`${TAG} ${h.key.padEnd(20)} ${acct.email.padEnd(44)} ${existing ? "account exists (this seed's)" : "create account"}; link profile; secondary_locales=${JSON.stringify(acct.secondaryLocales)}`);
    if (!apply) continue;
    let userId = existing?.id ?? null;
    if (!userId) {
      const { data, error } = await authAdmin!.createUser({ email: acct.email, email_confirm: true, user_metadata: acct.userMetadata, app_metadata: acct.appMetadata });
      if (error || !data.user) throw new Error(`createUser ${acct.email}: ${error?.message ?? "no user"}`);
      userId = data.user.id;
      backup.accounts.push({ email: acct.email, userId, action: "created" });
    } else backup.accounts.push({ email: acct.email, userId, action: "reused" });
    saveBackup();
    await q("begin");
    // The auth insert trigger made a public.profiles row (role client, onboarding); make it the demo talent's, as demo-talents/seed.mts does.
    await q("update public.profiles set display_name = $2, app_role = 'talent', account_status = 'active', onboarding_completed_at = coalesce(onboarding_completed_at, now()), updated_at = now() where id = $1", [userId, h.display]);
    const up = await q("update public.talent_profiles set user_id = $2, secondary_locales = $3::text[], updated_at = now() where id = $1 and (user_id is null or user_id = $2)", [tid, userId, acct.secondaryLocales]);
    if (up.rowCount !== 1) throw new Error(`${h.key}: profile link updated ${up.rowCount} rows, expected 1`);
    await q("commit");
    n += 1;
  }
  return n;
}

/** Accounts linked to this seed's profiles (or carrying its email) that this seed made. */
async function seedAccounts(selected: Host[]): Promise<Array<{ email: string; id: string }>> {
  const out: Array<{ email: string; id: string }> = [];
  for (const h of selected) {
    const u = await authUserByEmail(accountFor(h, DEMO_BATCH).email);
    if (u && ownsAccount({ app_metadata: u.app_metadata })) out.push({ email: accountFor(h, DEMO_BATCH).email, id: u.id });
  }
  return out;
}

// ------------------------------------------------------------------ main
async function buildOps(selected: Host[]): Promise<Op[]> {
  const trees = {
    shell: (displayName: string) => buildDefaultShellTree({ displayName }),
    home: (displayName: string, tagline: string) => buildStarterHomePageTree({ displayName, tagline }),
  };
  const ops: Op[] = [];
  for (const h of selected) ops.push(...(hostOps(h, { trees, now: new Date(), themeVersion: await themeVersion(h.theme) }) as Op[]));
  const v = verifyOps(ops);
  if (!v.ok) die(`plan failed its guards:\n  - ${v.problems.join("\n  - ")}`, 2);
  return ops;
}

try {
  const marker = await q("select 1 from public.agencies where id = $1", [STAGING_MARKER_AGENCY_ID]);
  if (!marker.rowCount) die("staging marker agency (qa-journeys) not found: not the staging database, refusing", 2);

  if (mode === "plan" || mode === "cleanup-plan") {
    await q("begin read only");
    const obs = await observe();
    const lines = diffLines(obs);
    for (const l of lines) console.log(`${TAG} ${l.host.padEnd(48)} ${l.card.padEnd(16)} ${l.action}${l.resolvesTo ? ` -> ${l.resolvesTo}` : ""}`);
    const ops = await buildOps(hosts);
    const missing = lines.filter((l) => l.action.startsWith("MISSING ->")).length;
    console.log(`${TAG} summary: ${lines.length} hosts, ${lines.filter((l) => l.action.startsWith("OK")).length} resolve, ${missing} missing (seedable), ${lines.filter((l) => l.action.startsWith("HELD")).length} held, ${lines.filter((l) => l.action.startsWith("BLOCKED")).length} blocked`);
    console.log(`${TAG} --apply would insert ${ops.length} rows (${hosts.length} hosts x profile/site/home page); own rows present now: ${Object.values(obs.ownRows).reduce((a, b) => a + b, 0)}`);
    if (mode === "cleanup-plan") {
      console.log(`${TAG} --cleanup --apply would delete this seed's rows only (ids above) plus their FK descendants`);
      for (const a of await seedAccounts(hosts)) console.log(`${TAG} --cleanup --apply would also delete demo login account ${a.email} (${a.id}) and its public.profiles row`);
    }
    await q("rollback");
    console.log(`${TAG} DRY RUN: nothing written`);
  } else if (mode === "selftest") {
    await q("begin");
    const ops = await buildOps(hosts);
    const created = await insertOps(ops);
    for (const h of hosts) for (const label of h.labels) {
      const got = await resolveLabel(label);
      if (got !== h.baseSlug) throw new Error(`selftest: ${label} resolves to ${got ?? "nothing"}, expected ${h.baseSlug}`);
    }
    const removed = await cleanup(hosts);
    const left = (await Promise.all(hosts.map(ownRowIds))).flat().length;
    if (left) throw new Error(`selftest: ${left} seed rows left after cleanup`);
    await q("rollback");
    console.log(`${TAG} SELFTEST PASS: inserted ${created}, every seeded host resolved, cleanup removed ${removed}, 0 left; ROLLED BACK`);
  } else if (mode === "apply") {
    const obs = await observe();
    const blocked = diffLines(obs).filter((l) => l.action.startsWith("BLOCKED") && hosts.some((h) => h.labels.some((x) => l.host.startsWith(`${x}.`))));
    if (blocked.length) die(`refusing --apply: ${blocked.map((b) => `${b.host}: ${b.action}`).join("; ")}`, 2);
    await q("begin");
    const created = await insertOps(await buildOps(hosts));
    await q("commit");
    console.log(`${TAG} APPLIED: ${created} rows created (backup ${args.backupFile})`);
  } else if (mode === "link-plan" || mode === "link-apply") {
    const n = await linkAccounts(hosts, mode === "link-apply");
    console.log(mode === "link-apply" ? `${TAG} LINKED: ${n} demo login accounts (backup ${args.backupFile})` : `${TAG} DRY RUN: nothing written (add --apply --backup-file <f>)`);
  } else if (mode === "cleanup-apply") {
    const accounts = await seedAccounts(hosts);
    const cleanupAdmin = accounts.length ? authApi() : null; // check the API target BEFORE any delete
    await q("begin");
    const removed = await cleanup(hosts);
    // Then the accounts' public.profiles rows (FK descendants first), all in the same transaction.
    const pids = accounts.map((a) => a.id);
    let removedProfiles = 0;
    if (pids.length) {
      removedProfiles += await purge("public.profiles", pids);
      const rows = await q("delete from public.profiles t where id = any($1::uuid[]) returning to_jsonb(t) j", [pids]);
      for (const r of rows.rows) backup.deleted.push({ table: "public.profiles", id: String((r.j as Row).id), row: r.j as Row });
      removedProfiles += rows.rowCount ?? 0;
    }
    await q("commit");
    saveBackup();
    for (const a of accounts) {
      const { error } = await cleanupAdmin!.deleteUser(a.id);
      if (error) throw new Error(`deleteUser ${a.email}: ${error.message}`);
      backup.accounts.push({ email: a.email, userId: a.id, action: "deleted" });
      saveBackup();
    }
    console.log(`${TAG} accounts: ${accounts.length} demo login accounts deleted (${removedProfiles} profile rows)`);
    console.log(`${TAG} CLEANUP APPLIED: ${removed} rows deleted (backup ${args.backupFile})`);
  }
} catch (e) {
  await q("rollback").catch(() => undefined);
  die(e instanceof Error ? e.message : String(e));
} finally {
  await client.end();
}
