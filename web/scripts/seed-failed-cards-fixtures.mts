/**
 * Failed-cards staging fixtures (inventory docs/plans/failed-cards-fixture-inventory-2026-10-19.md).
 * STAGING ONLY (fxlankepwnvelxjrahwk). Extends the Group-6 seed (scripts/seed-group6-staging-fixtures.mts,
 * which must be applied first) with NEW rows only, every id deterministic (`fcId(key)`), every slug
 * `qa-fixture-g6-*`, every mailbox `qa-fixture-g6-*@impronta.test` or `tulalaqa+qa-fixture-g6-*`.
 *
 * Fixtures: F1 F2 F3 F5 F6 F7 F8 F9 F10 F11 F12 F14 S5 S6 G1 G2 G3 G4 G5 (DB) and S2 S3 S4 S6 (Stripe TEST, --stripe).
 * G1-G5 (QA Conductor ask) sit on the F3 studio workspace (G5 adds a free-plan twin) and pull F3 in; see failed-cards-plan-g.mjs.
 * HELD (never run here): F13 shared-row edits (WAITING ON PM), S1 staging Stripe keys/webhook (PM dashboard).
 * Never writes TAL-93938; TAL-93940 is observe-only; refuses any production reference.
 *
 * Modes (default: read-only DRY RUN that writes nothing):
 *   (none)                 plan: target check, Group-6 present, ops per table, present/absent, schema + collision check
 *   --selftest             BEGIN; apply; read back every fixture id; cleanup; ROLLBACK; then re-check 0 rows left
 *   --apply --backup-file  write and COMMIT (re-run is a no-op); the backup records every pre-existing row changed
 *   --cleanup [--apply --backup-file]   delete ONLY this seed's rows (by fixture id, FK descendants first)
 *   --only F1,F3           limit the DB fixtures (F2 pulls in F3)
 *   --stripe S2,S3,S4,S6   with --apply: Stripe TEST steps (key: --stripe-key-file <mode-600 file> or STRIPE_SECRET_KEY;
 *                          MX: --stripe-mx-key-file or STRIPE_MX_SECRET_KEY_TEST). Without --apply: read-only preflight.
 * Env: DATABASE_URL from the process env or --env-file. QA_FIXTURE_PASSWORD (>= 12 chars) sets the fixture
 * logins' password; --apply refuses F8 without it (F8's unverified client must have a password).
 *
 * Run from web/: npx tsx scripts/seed-failed-cards-fixtures.mts --env-file <tmp> [--selftest | --apply --backup-file <f>]
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";

import { buildDefaultShellTree, buildStarterHomePageTree } from "../src/lib/talent-site/default-max-site-trees";
import { STAGING_MARKER_AGENCY_ID, checkKeyFileMode, checkStripeKey, parseEnvText, parseKeyFileText } from "./lib/group6-fixtures.mjs";
import { FORBIDDEN_PROFILE_CODES, HELD, checkFcTarget, fcId, parseFcArgs, summarisePlan } from "./lib/failed-cards-guards.mjs";
import { G6, G6_REQUIRED } from "./lib/failed-cards-ops.mjs";
import { FIXTURE_CARDS, buildPlan, resolveFixtures, verifyPlan } from "./lib/failed-cards-plan.mjs";
import { readBack } from "./lib/failed-cards-readback.mjs";

type Row = Record<string, unknown>;
type Op = { fx: string; kind: string; table: string; key: string; id: string | null; row?: Row; set?: Row; merge?: Row; conflict?: string[] | null; template?: Row; sql?: string; applyOnly?: boolean };
type PgClient = { connect(): Promise<void>; query(text: string, params?: unknown[]): Promise<{ rows: Row[]; rowCount: number | null }>; end(): Promise<void> };
const PG_MODULE = "pg";
const pgMod = (await import(PG_MODULE)) as { default: { Client: new (cfg: { connectionString?: string; ssl?: unknown }) => PgClient } };

const TAG = "[failed-cards-fixtures]";
function die(msg: string, code = 1): never {
  console.error(`${TAG} ${msg}`);
  process.exit(code);
}

// parseFcArgs is plain JS: its empty-array defaults infer as never[], so pin the shape here.
const args = parseFcArgs(process.argv.slice(2)) as Omit<ReturnType<typeof parseFcArgs>, "stripe" | "only"> & { stripe: string[]; only: string[] | null };
if (args.help) {
  console.log("usage: seed-failed-cards-fixtures.mts [--env-file p] [--only F1,..] [--selftest | --apply --backup-file p | --cleanup [--apply --backup-file p]] [--stripe S2,S3,S4,S6 [--stripe-key-file p] [--stripe-mx-key-file p]]");
  process.exit(0);
}
if (args.errors.length) die(args.errors.join("; "), 2);
if (args.backupFile && existsSync(args.backupFile)) die(`--backup-file ${args.backupFile} already exists; pass a new path (never overwritten)`, 2);

const env: Record<string, string | undefined> = { ...process.env };
if (args.envFile) Object.assign(env, parseEnvText(readFileSync(args.envFile, "utf8")));
const verdict = checkFcTarget(env);
if (!verdict.ok) die(`refusing to run:\n  - ${verdict.reasons.join("\n  - ")}`, 2);

function readKeyFile(path: string | null, fallback: string | undefined, label: string): string | null {
  if (!path) return fallback?.trim() || null;
  const p = path.replace(/^~(?=\/|$)/, homedir());
  let mode = 0;
  try {
    mode = statSync(p).mode;
  } catch {
    die(`${label}: cannot read ${p}`, 2);
  }
  const m = checkKeyFileMode(mode);
  if (!m.ok) die(`${label}: ${m.reason}`, 2);
  return parseKeyFileText(readFileSync(p, "utf8"));
}
let stripeKey: string | null = null;
let stripeMxKey: string | null = null;
if (args.stripe.length) {
  stripeKey = readKeyFile(args.stripeKeyFile, env.STRIPE_SECRET_KEY, "--stripe-key-file");
  stripeMxKey = readKeyFile(args.stripeMxKeyFile, env.STRIPE_MX_SECRET_KEY_TEST, "--stripe-mx-key-file");
  for (const [k, label] of [[stripeKey, "Stripe key"], [stripeMxKey, "MX Stripe key"]] as const) {
    if (k && !checkStripeKey(k).ok) die(`${label}: ${checkStripeKey(k).reason}`, 2);
  }
}

const fixtures = resolveFixtures(args.only);
const mode = args.cleanup ? (args.apply ? "cleanup-apply" : "cleanup-plan") : args.selftest ? "selftest" : args.apply ? "apply" : "plan";
let password = env.QA_FIXTURE_PASSWORD?.trim() || null;
if (password && password.length < 12) die("QA_FIXTURE_PASSWORD must be at least 12 characters", 2);
if (mode === "selftest") password = randomBytes(18).toString("base64url"); // rolled back; never printed

const client = new pgMod.default.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const q = (text: string, params: unknown[] = []) => client.query(text, params);
const J = (v: unknown) => JSON.stringify(v);

const created = new Set<string>();
const counts: Record<string, { created: number; existed: number; updated: number }> = {};
const bump = (t: string, k: "created" | "existed" | "updated") => ((counts[t] ??= { created: 0, existed: 0, updated: 0 })[k] += 1);
const backup: { target: string; mode: string; at: string; updated: Array<{ table: string; id: string; before: Row }>; deleted: Array<{ table: string; id: string; row: Row }> } = {
  target: "fxlankepwnvelxjrahwk", mode, at: new Date().toISOString(), updated: [], deleted: [],
};
const saveBackup = () => {
  if (args.backupFile) writeFileSync(args.backupFile, JSON.stringify(backup, null, 2), { mode: 0o600 });
};

// ------------------------------------------------------------------ context (read-only)
async function context() {
  const marker = await q("select 1 from public.agencies where id = $1", [STAGING_MARKER_AGENCY_ID]);
  if (!marker.rowCount) die("staging marker agency (qa-journeys) not found: not the staging database, refusing", 2);
  for (const [table, ids] of Object.entries(G6_REQUIRED)) {
    const r = await q(`select count(*)::int n from ${table} where id = any($1::uuid[])`, [ids]);
    if ((r.rows[0].n as number) !== ids.length) die(`Group-6 fixtures missing in ${table} (${r.rows[0].n}/${ids.length}): run seed-group6-staging-fixtures.mts --apply first`, 2);
  }
  const forbidden = await q("select id::text id, user_id::text uid from public.talent_profiles where profile_code = any($1)", [FORBIDDEN_PROFILE_CODES]);
  const forbiddenIds = forbidden.rows.flatMap((r) => [r.id, r.uid]).filter(Boolean) as string[];
  const tpl = await q("select payload from public.talent_theme_versions where design = 'minimal' and version = 1");
  if (!tpl.rowCount) die("theme template minimal v1 missing (F6 copies its payload)", 2);
  const hk = await q("select id::text id from public.taxonomy_terms where slug = 'housekeeping' and kind = 'tag' limit 1");
  return {
    forbiddenIds,
    ctx: {
      now: new Date(),
      trees: {
        shell: (displayName: string) => buildDefaultShellTree({ displayName }),
        home: (displayName: string, tagline: string) => buildStarterHomePageTree({ displayName, tagline }),
      },
      templatePayload: tpl.rows[0].payload as Row,
      housekeepingTermId: (hk.rows[0]?.id as string) ?? null,
    },
  };
}

// ------------------------------------------------------------------ executors
async function writableCols(table: string): Promise<string[]> {
  const [schema, name] = table.split(".");
  const r = await q("select column_name from information_schema.columns where table_schema = $1 and table_name = $2 and is_generated = 'NEVER' order by ordinal_position", [schema, name]);
  return r.rows.map((c) => c.column_name as string);
}

async function execInsert(op: Op) {
  const row = op.row as Row;
  const cols = Object.keys(row);
  const conflict = op.conflict ? `(${op.conflict.map((c) => `"${c}"`).join(",")})` : "";
  const r = await q(`insert into ${op.table} (${cols.map((c) => `"${c}"`).join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) on conflict ${conflict} do nothing`, cols.map((c) => row[c]));
  if ((r.rowCount ?? 0) > 0) {
    bump(op.table, "created");
    if (op.id) created.add(op.id);
  } else bump(op.table, "existed");
}

async function execClone(op: Op) {
  const tpl = op.template as { id?: string; whereInquiry?: string; patchJson?: { col: string; from: string; to: string } };
  const overrides: Row = { ...(op.row as Row) };
  const where = tpl.id ? "s.id = $1" : "s.inquiry_id = $1";
  const key = tpl.id ?? tpl.whereInquiry;
  if (tpl.patchJson) {
    const cur = await q(`select ${tpl.patchJson.col} v from ${op.table} where id = $1`, [tpl.id]);
    overrides[tpl.patchJson.col] = cur.rows[0]?.v == null ? null : JSON.parse(J(cur.rows[0].v).split(tpl.patchJson.from).join(tpl.patchJson.to));
  }
  const cols = (await writableCols(op.table)).map((c) => `"${c}"`).join(",");
  const r = await q(
    `insert into ${op.table} (${cols}) select ${cols} from (select r.* from ${op.table} s, ` +
      `json_populate_record(null::${op.table}, (to_jsonb(s) || $2::jsonb)::json) r where ${where} limit 1) t on conflict (id) do nothing`,
    [key, J(overrides)],
  );
  if ((r.rowCount ?? 0) > 0) {
    bump(op.table, "created");
    created.add(op.id as string);
  } else {
    const exists = await q(`select 1 from ${op.table} where id = $1`, [op.id]);
    if (!exists.rowCount) throw new Error(`${op.fx} ${op.table} ${op.key}: template ${key} not found, nothing inserted`);
    bump(op.table, "existed");
  }
}

async function execAuthUser(op: Op) {
  const r = op.row as { email: string; name: string; confirmed: boolean; needsPassword: boolean };
  if ((await q("select 1 from auth.users where id = $1", [op.id])).rowCount) {
    bump("auth.users", "existed");
    return;
  }
  if (r.needsPassword && !password) throw new Error(`${op.fx} ${op.key}: needs QA_FIXTURE_PASSWORD (>= 12 chars)`);
  const crypt = password ? "extensions.crypt($3::text, extensions.gen_salt('bf'))" : "''";
  await q(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
       created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, is_sso_user, is_anonymous)
     values ($1::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2::text, ${crypt}, ${r.confirmed ? "now()" : "null"},
       '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name',$4::text), now(), now(), '','','','',false,false)`,
    [op.id, r.email, password, r.name],
  );
  await q(
    `insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
     values (gen_random_uuid(), $1::uuid, $1::text, 'email', jsonb_build_object('sub',$1::text,'email',$2::text,'email_verified',$3::boolean), now(), now(), now())`,
    [op.id, r.email, r.confirmed],
  );
  bump("auth.users", "created");
  created.add(op.id as string);
}

/** Update one of THIS seed's rows; a row that existed before this run is backed up first. */
async function updateOwned(table: string, id: string, set: Row) {
  const cur = await q(`select to_jsonb(t) j from ${table} t where id = $1`, [id]);
  if (!cur.rowCount) throw new Error(`${table} ${id}: row to update is missing`);
  const before = cur.rows[0].j as Row;
  const differs = Object.entries(set).some(([k, v]) => J(before[k] ?? null) !== J(v ?? null));
  if (!differs) {
    bump(table, "existed");
    return;
  }
  if (!created.has(id)) {
    backup.updated.push({ table, id, before });
    saveBackup();
  }
  const cols = Object.keys(set);
  await q(`update ${table} set ${cols.map((c, i) => `"${c}" = $${i + 2}`).join(", ")} where id = $1`, [id, ...cols.map((c) => set[c])]);
  bump(table, "updated");
}

/**
 * Additive jsonb merge on one of THIS seed's rows (G7: agencies.settings.display_currency). Only the named keys
 * are set; every other key in the blob is kept. A row that existed before this run is backed up first
 * (the backup holds the whole pre-image, so the key can be undone by hand); a no-op when the keys already match.
 */
async function mergeOwned(table: string, id: string, merge: Row) {
  const cur = await q(`select to_jsonb(t) j from ${table} t where id = $1`, [id]);
  if (!cur.rowCount) throw new Error(`${table} ${id}: row to merge into is missing`);
  const before = cur.rows[0].j as Row;
  const next: Row = {};
  let differs = false;
  for (const [col, patch] of Object.entries(merge)) {
    const base = (before[col] && typeof before[col] === "object" && !Array.isArray(before[col]) ? before[col] : {}) as Row;
    next[col] = { ...base, ...(patch as Row) };
    if (J(next[col]) !== J(before[col] ?? {})) differs = true;
  }
  if (!differs) {
    bump(table, "existed");
    return;
  }
  if (!created.has(id)) {
    backup.updated.push({ table, id, before });
    saveBackup();
  }
  const cols = Object.keys(next);
  await q(`update ${table} set ${cols.map((c, i) => `"${c}" = $${i + 2}::jsonb`).join(", ")} where id = $1`, [id, ...cols.map((c) => J(next[c]))]);
  bump(table, "updated");
}

async function runOps(ops: Op[]) {
  for (const op of ops) {
    if (op.kind === "insert") await execInsert(op);
    else if (op.kind === "clone") await execClone(op);
    else if (op.kind === "authUser") await execAuthUser(op);
    else if (op.kind === "update" && op.merge) await mergeOwned(op.table, op.id as string, op.merge);
    else if (op.kind === "update") await updateOwned(op.table, op.id as string, op.set as Row);
    else if (op.kind === "call") {
      if (mode === "apply") await q(op.sql as string);
      else console.log(`${TAG} selftest: skipped ${op.key} (a global matview refresh; runs on --apply only)`);
    }
  }
}

// ------------------------------------------------------------------ cleanup (FK descendants of fixture ids only)
let purged = 0;
const visited = new Set<string>();
/** Subdomain rows refuse a direct delete; they go with their agency (ON DELETE CASCADE). */
const NO_DESCENT = new Set(["agency_domains", "public.agency_domains"]);
async function purge(table: string, col: string, ids: string[], depth = 0, record = false): Promise<void> {
  if (!ids.length || depth > 8) return;
  const hasId = (await q("select 1 from information_schema.columns where table_schema = split_part($1,'.',1) and table_name = split_part($1,'.',2) and column_name = 'id'", [table.includes(".") ? table : `public.${table}`])).rowCount;
  const rows = hasId ? (await q(`select id::text id, to_jsonb(t) j from ${table} t where ${col}::text = any($1::text[])`, [ids])).rows : [];
  if (record) for (const r of rows) backup.deleted.push({ table, id: r.id as string, row: r.j as Row });
  if (rows.length) {
    const fks = await q(
      `select c.conrelid::regclass::text t, a.attname col, fa.attname refcol from pg_constraint c
         join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
         join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = c.confkey[1]
        where c.contype = 'f' and c.confrelid = $1::regclass and array_length(c.conkey, 1) = 1`,
      [table],
    );
    const rowIds = rows.map((r) => r.id as string);
    for (const fk of fks.rows as Array<{ t: string; col: string; refcol: string }>) {
      if (fk.refcol !== "id" || NO_DESCENT.has(fk.t)) continue;
      const k = `${fk.t}.${fk.col}:${rowIds.join(",")}`;
      if (visited.has(k)) continue;
      visited.add(k);
      await purge(fk.t, fk.col, rowIds, depth + 1);
    }
  }
  const del = await q(`delete from ${table} where ${col}::text = any($1::text[])`, [ids]);
  purged += del.rowCount ?? 0;
}

/**
 * G4's event is published, and a published event cannot be hard-deleted (events_block_destructive_delete).
 * More importantly, the generic purge below deletes FK descendants, which would erase any QA sale made on the
 * fixtures. So cleanup REFUSES when sales history hangs off a fixture row (orders, tickets, redemptions,
 * committed seats): cancel the event in the app instead; this seed never deletes what people bought.
 */
async function assertNoSalesHistory(ops: Op[]) {
  const ids = (table: string) => ops.filter((o) => o.table === table && o.kind !== "update" && o.id).map((o) => o.id as string);
  const checks: Array<[string, string, string[]]> = [
    ["order lines", "select count(*)::int n from public.order_lines where offering_id = any($1::uuid[])", ids("public.talent_offerings")],
    ["tickets (admissions)", "select count(*)::int n from public.admissions where session_id = any($1::uuid[])", ids("public.sessions")],
    ["promo redemptions", "select count(*)::int n from public.tenant_promo_redemptions where promo_code_id = any($1::uuid[])", ids("public.tenant_promo_codes")],
    ["committed seats/units", "select count(*)::int n from public.capacity_allocations where pool_id = any($1::uuid[]) and state = 'committed'", ids("public.capacity_pools")],
  ];
  const found: string[] = [];
  for (const [label, sql, list] of checks) {
    if (!list.length) continue;
    const n = (await q(sql, [list])).rows[0].n as number;
    if (n) found.push(`${n} ${label}`);
  }
  if (found.length) throw new Error(`cleanup refused: sales history hangs off fixture rows (${found.join(", ")}). Cancel the event / refund in the app; this seed never deletes sales.`);
}

async function cleanup(ops: Op[], record: boolean) {
  await assertNoSalesHistory(ops);
  const eventIds = ops.filter((o) => o.table === "public.events" && o.kind !== "update").map((o) => o.id as string);
  if (eventIds.length) await q("update public.events set status = 'draft', published_at = null where id = any($1::uuid[])", [eventIds]); // draft-only delete rule; zero admissions proven above
  const inquiryIds = ops.filter((o) => o.table === "public.inquiries" && o.kind !== "update").map((o) => o.id);
  await q("update public.inquiries set status = 'closed', current_offer_id = null where id = any($1::uuid[])", [inquiryIds]);
  const designs = ops.filter((o) => o.table === "public.talent_theme_versions").map((o) => (o.row as Row).design);
  await q("delete from public.talent_theme_drafts where design = any($1::text[])", [designs]);
  const roots = [...ops].reverse().filter((o) => o.id && (o.kind === "insert" || o.kind === "clone") && o.table !== "public.talent_bookings" && !NO_DESCENT.has(o.table));
  const seen = new Set<string>();
  for (const o of roots) {
    if (seen.has(o.id as string)) continue;
    seen.add(o.id as string);
    await purge(o.table, "id", [o.id as string], 0, record);
  }
  const tb = ops.filter((o) => o.table === "public.talent_bookings").map((o) => o.id as string);
  await purge("public.talent_bookings", "id", tb, 0, record);
  const vers = await q("delete from public.talent_theme_versions where design = any($1::text[])", [designs]);
  purged += vers.rowCount ?? 0;
  const users = ops.filter((o) => o.kind === "authUser").map((o) => o.id as string);
  await purge("public.profiles", "id", users, 0, record);
  const u = await q("delete from auth.users where id = any($1::uuid[])", [users]);
  purged += u.rowCount ?? 0;
  console.log(`${TAG} cleanup deleted ${purged} rows (fixture ids and their FK descendants only)`);
}

async function presentCount(ops: Op[]): Promise<{ total: number; present: number; byTable: Record<string, string> }> {
  const byTable: Record<string, { n: number; of: number }> = {};
  for (const op of ops) {
    if (!op.id || op.kind === "update") continue;
    const table = op.kind === "authUser" ? "auth.users" : op.table;
    const r = await q(`select count(*)::int n from ${table} where id = $1`, [op.id]);
    const t = (byTable[table] ??= { n: 0, of: 0 });
    t.of += 1;
    t.n += r.rows[0].n as number;
  }
  const out: Record<string, string> = {};
  let total = 0;
  let present = 0;
  for (const [t, v] of Object.entries(byTable)) {
    out[t] = `${v.n}/${v.of}`;
    total += v.of;
    present += v.n;
  }
  return { total, present, byTable: out };
}

const COUNT_TABLES = [
  "auth.users", "auth.identities", "public.profiles", "public.client_profiles", "public.talent_profiles", "public.talent_sites", "public.talent_pages",
  "public.talent_booking_hours", "public.talent_profile_taxonomy", "public.agency_talent_roster", "public.agencies", "public.agency_memberships",
  "public.agency_business_identity", "public.agency_branding", "public.agency_domains", "public.media_assets", "public.talent_offerings",
  "public.talent_offering_media", "public.talent_offering_variants", "public.capacity_pools", "public.events", "public.sessions", "public.venues", "public.venue_service_rules", "public.venue_service_windows", "public.space_groups", "public.tenant_promo_codes", "public.talent_theme_catalog", "public.talent_theme_versions",
  "public.talent_theme_releases", "public.talent_theme_drafts", "public.taxonomy_terms", "public.inquiries", "public.inquiry_requirement_groups",
  "public.inquiry_participants", "public.inquiry_offers", "public.inquiry_offer_line_items", "public.inquiry_messages", "public.guest_sessions",
  "public.agency_bookings", "public.talent_bookings", "public.booking_talent", "public.workspace_subscriptions",
];
async function tableCounts() {
  const out: Record<string, number> = {};
  for (const t of COUNT_TABLES) out[t] = (await q(`select count(*)::int n from ${t}`)).rows[0].n as number;
  return out;
}

// ------------------------------------------------------------------ plan-mode checks (read-only)
async function schemaAndCollisions(ops: Op[]) {
  let problems = 0;
  const colsByTable: Record<string, Set<string>> = {};
  for (const op of ops) if (op.row && op.kind !== "authUser") for (const c of Object.keys(op.row)) (colsByTable[op.table] ??= new Set()).add(c);
  for (const [table, cols] of Object.entries(colsByTable)) {
    const have = new Set(await writableCols(table));
    const gone = have.size ? [...cols].filter((c) => !have.has(c)) : ["(table missing)"];
    if (gone.length) {
      problems += gone.length;
      console.log(`  SCHEMA MISSING ${table}: ${gone.join(", ")}`);
    }
  }
  // Natural-key collisions with rows that are NOT this seed's (would make an insert fail).
  const checks: Array<[string, string, string]> = [
    ["public.talent_profiles", "profile_code", "id"], ["public.agencies", "slug", "id"], ["public.agency_domains", "hostname", "id"],
    ["public.talent_sites", "site_slug", "id"], ["public.events", "slug", "id"], ["public.taxonomy_terms", "slug", "id"], ["public.talent_theme_catalog", "slug", "id"],
  ];
  for (const [table, col] of checks) {
    for (const op of ops.filter((o) => o.table === table && o.row?.[col])) {
      const r = await q(`select id::text id from ${table} where ${col} = $1`, [op.row?.[col]]);
      const other = r.rows.find((x) => x.id !== op.id);
      if (other) {
        problems += 1;
        console.log(`  COLLISION ${table}.${col} = ${String(op.row?.[col])} is held by a non-fixture row`);
      }
    }
  }
  for (const op of ops.filter((o) => o.kind === "authUser")) {
    const r = await q("select id::text id from auth.users where lower(email) = lower($1)", [(op.row as Row).email]);
    if (r.rows.find((x) => x.id !== op.id)) {
      problems += 1;
      console.log(`  COLLISION auth.users email ${(op.row as Row).email} is held by a non-fixture user`);
    }
  }
  for (const op of ops.filter((o) => o.table === "public.tenant_promo_codes" && o.row?.event_id && o.row?.code)) {
    const r = await q("select id::text id from public.tenant_promo_codes where tenant_id = $1 and upper(code) = upper($2)", [op.row?.tenant_id, op.row?.code]);
    if (r.rows.find((x) => x.id !== op.id)) {
      problems += 1;
      console.log(`  COLLISION promo code ${String(op.row?.code)} is held by a non-fixture promo in this workspace`);
    }
  }
  // One default venue per workspace (idx_venues_one_default_per_tenant): G7's insert would fail if the studio already has another.
  for (const op of ops.filter((o) => o.table === "public.venues" && o.row?.is_default)) {
    const r = await q("select id::text id from public.venues where tenant_id = $1 and is_default", [op.row?.tenant_id]);
    if (r.rows.find((x) => x.id !== op.id)) {
      problems += 1;
      console.log("  COLLISION the studio already has a default venue that is not this seed's");
    }
  }
  const qa20 = await q("select talent_profile_id::text t from public.tenant_promo_codes where tenant_id = '00000000-0000-0000-0000-000000000002' and upper(code) = 'QA20'");
  if (qa20.rows.find((x) => x.t !== ops.find((o) => o.key === "promo:t1-code")?.row?.talent_profile_id)) {
    problems += 1;
    console.log("  COLLISION hub promo code QA20 is held by another talent");
  }
  return problems;
}

function printPlan(ops: Op[]) {
  console.log(`${TAG} fixtures: ${fixtures.join(", ")} | held: ${Object.keys(HELD).join(", ")}`);
  for (const f of fixtures) {
    const mine = ops.filter((o) => o.fx === f);
    console.log(`  ${f.padEnd(4)} ${String(mine.length).padStart(3)} ops  cards ${(FIXTURE_CARDS as Record<string, string[]>)[f]?.join(" ") ?? ""}`);
  }
  console.log(`${TAG} rows by table (insert / update):`);
  for (const [t, v] of Object.entries(summarisePlan(ops))) console.log(`  ${t.padEnd(38)} ${String(v.insert).padStart(3)} / ${v.update}`);
}

// ------------------------------------------------------------------ main
async function main() {
  console.log(`${TAG} target OK (staging fxlankepwnvelxjrahwk). mode=${mode}`);
  // selftest: REPEATABLE READ so the row-count drift check ignores other sessions' commits during the run.
  await q(mode === "plan" || mode === "cleanup-plan" ? "begin read only" : mode === "selftest" ? "begin isolation level repeatable read" : "begin");
  const { forbiddenIds, ctx } = await context();
  const ops = buildPlan(fixtures, ctx) as Op[];
  const v = verifyPlan(ops, forbiddenIds);
  if (!v.ok) throw new Error(`plan refused:\n  - ${v.problems.join("\n  - ")}`);
  console.log(`${TAG} plan guards OK: ${ops.length} ops, forbidden talents resolved on staging: ${forbiddenIds.length / 2}`);

  if (mode === "plan" || mode === "cleanup-plan") {
    printPlan(ops);
    const p = await presentCount(ops);
    console.log(`${TAG} fixture rows already present: ${p.present}/${p.total}`);
    for (const [t, s] of Object.entries(p.byTable)) console.log(`  ${t.padEnd(38)} ${s}`);
    const problems = await schemaAndCollisions(ops);
    console.log(`${TAG} schema + collision check: ${problems === 0 ? "OK" : `${problems} PROBLEM(S)`}`);
    if (args.stripe.length) await stripePreflight();
    await q("rollback");
    console.log(mode === "plan" ? `${TAG} DRY RUN: nothing written.` : `${TAG} cleanup plan only: nothing deleted.`);
    if (problems) process.exitCode = 1;
    return;
  }
  try {
    if (mode === "cleanup-apply") {
      await cleanup(ops, true);
      saveBackup();
      const left = await presentCount(ops);
      if (left.present) throw new Error(`${left.present} fixture rows remain after cleanup`);
      await q("commit");
      console.log(`${TAG} cleanup committed; deleted-row images in the backup file`);
      return;
    }
    const before = mode === "selftest" ? await tableCounts() : null;
    const startedClean = (await presentCount(ops)).present === 0;
    await runOps(ops);
    console.log(`${TAG} rows (created / already present / updated):`);
    for (const [t, c] of Object.entries(counts)) console.log(`  ${t.padEnd(38)} ${c.created} / ${c.existed} / ${c.updated}`);
    if (before) {
      // Every row the run adds, including trigger side effects (profiles, identities, hub roster auto-enroll).
      const mid = await tableCounts();
      console.log(`${TAG} selftest: table row deltas after the writes (incl. trigger side effects):`);
      for (const t of COUNT_TABLES) if (mid[t] !== before[t]) console.log(`  ${t.padEnd(38)} +${mid[t] - before[t]}`);
    }
    const after = await presentCount(ops);
    console.log(`${TAG} read-back: ${after.present}/${after.total} fixture ids present`);
    for (const [t, s] of Object.entries(after.byTable)) console.log(`  ${t.padEnd(38)} ${s}`);
    const rb = await readBack(q, fixtures);
    for (const line of rb.lines) console.log(`  ${line}`);
    if (after.present !== after.total || rb.failures) throw new Error(`read-back failed (${after.total - after.present} ids missing, ${rb.failures} checks failed)`);
    if (mode === "selftest" && before) {
      await cleanup(ops, false);
      const end = await tableCounts();
      const drift = startedClean ? COUNT_TABLES.filter((t) => before[t] !== end[t]).map((t) => `${t} ${before[t]} -> ${end[t]}`) : [];
      const left = (await presentCount(ops)).present;
      console.log(`${TAG} selftest: cleanup left ${left} fixture rows; row-count drift: ${drift.length ? drift.join("; ") : startedClean ? "none" : "skipped (fixtures were already committed)"}`);
      await q("rollback");
      await q("begin read only");
      const post = (await presentCount(ops)).present;
      await q("rollback");
      console.log(`${TAG} selftest: after ROLLBACK, fixture rows on staging: ${post} (expected ${startedClean ? 0 : "unchanged"})`);
      if (left || drift.length || (startedClean && post)) process.exitCode = 1;
      else console.log(`${TAG} selftest OK; everything rolled back, nothing persisted`);
      return;
    }
    saveBackup();
    await q("commit");
    console.log(`${TAG} COMMITTED. backup: ${args.backupFile} (${backup.updated.length} pre-existing rows changed)`);
    if (args.stripe.length) await stripeApply();
  } catch (e) {
    await q("rollback").catch(() => undefined);
    throw e;
  }
}

// ------------------------------------------------------------------ Stripe TEST (separate flags; --apply only writes)
async function stripeClients() {
  const { default: Stripe } = await import("stripe");
  const { openTestStripe } = await import("./lib/failed-cards-stripe.mjs");
  const us = stripeKey ? await openTestStripe(Stripe, stripeKey) : null;
  const mx = stripeMxKey ? await openTestStripe(Stripe, stripeMxKey) : null;
  return { us, mx };
}

async function stripePreflight() {
  const { describeStripeSteps, QA20_CODE, QA20_COUPON_ID, STUDIO_LOOKUP } = await import("./lib/failed-cards-stripe.mjs");
  if (!stripeKey) {
    // No key: Stripe-side existence is unknown (prices/coupons are looked up at --apply); DB-side facts are real.
    const t1 = await q("select 1 from public.talent_subscriptions where stripe_subscription_id is not null and talent_profile_id = $1", [G6.t1]);
    console.log(`${TAG} Stripe preflight: no TEST key given; plan only (Stripe objects are looked up first at --apply):`);
    for (const l of describeStripeSteps(args.stripe, { studioPrice: true, t1Sub: Boolean(t1.rowCount), mxKey: Boolean(stripeMxKey) })) console.log(`  ${l}`);
    return;
  }
  const { us } = await stripeClients();
  const s = us as NonNullable<typeof us>;
  const t1Sub = await q("select stripe_subscription_id from public.talent_subscriptions where stripe_subscription_id is not null and talent_profile_id = $1", [G6.t1]);
  const have = {
    coupon: Boolean(await s.coupons.retrieve(QA20_COUPON_ID).catch(() => null)),
    qa20: Boolean((await s.promotionCodes.list({ code: QA20_CODE, limit: 1 })).data[0]),
    studioPrice: Boolean((await s.prices.list({ lookup_keys: [STUDIO_LOOKUP], limit: 1 })).data[0]),
    wsSub: false,
    portal: false,
    t1Sub: Boolean(t1Sub.rowCount),
    mxKey: Boolean(stripeMxKey),
  };
  console.log(`${TAG} Stripe preflight (read-only; key is sk_test_ and /v1/balance livemode=false):`);
  for (const l of describeStripeSteps(args.stripe, have)) console.log(`  ${l}`);
}

async function stripeApply() {
  const mod = await import("./lib/failed-cards-stripe.mjs");
  const { us, mx } = await stripeClients();
  if (!us) die("--stripe needs a TEST key (--stripe-key-file or STRIPE_SECRET_KEY)", 2);
  const log = (m: string) => console.log(`${TAG} ${m}`);
  const tx = async (fn: () => Promise<void>) => {
    await q("begin");
    try {
      await fn();
      saveBackup();
      await q("commit");
    } catch (e) {
      await q("rollback");
      throw e;
    }
  };
  if (args.stripe.includes("S2")) {
    const { PLANNED_COUPONS } = await import("./seed-stripe-test-coupons.mjs");
    await mod.stepS2(us, PLANNED_COUPONS, log);
  }
  if (args.stripe.includes("S3")) {
    const studioId = fcId("workspace:f3");
    if (!(await q("select 1 from public.agencies where id = $1", [studioId])).rowCount) die("S3 needs the F3 studio workspace applied first", 2);
    await tx(() => mod.stepS3(us, { q, studioId, insertRow: (table: string, row: Row) => execInsert({ fx: "S3", kind: "insert", table, key: "s3", id: row.id as string, row, conflict: ["id"] }), log }));
  }
  if (args.stripe.includes("S4")) {
    const portal = await import("./seed-stripe-portal-config.mjs");
    await mod.stepS4(us, { q, buildPortalConfiguration: portal.buildPortalConfiguration, PORTAL_SEED_TAG: portal.SEED_TAG, LOOKUP_KEYS: portal.LOOKUP_KEYS, log });
  }
  if (args.stripe.includes("S6")) await tx(() => mod.stepS6({ us, mx }, { q, updateOwned, log }));
}

try {
  await main();
} catch (e) {
  console.error(`${TAG} FAILED (rolled back): ${e instanceof Error ? e.message : "unknown error"}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
