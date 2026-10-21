/**
 * Demo alt_i18n repair (Refs TUL-1792). STAGING ONLY (fxlankepwnvelxjrahwk).
 *
 * Seeded demo photos keep an English description only in media_assets.alt and have no per-language
 * alt. This writes `media_assets.metadata.alt_i18n = { es, en }` (the shape resolvePortfolioAlt reads in
 * src/lib/site-admin/builder-node/portfolio-i18n.ts) for the photos of the seeded DEMO talents.
 *
 * WRITES: table public.media_assets, column metadata ONLY, rows owned by an allow-listed demo talent
 * (allow-list derived from code: demo-alt-allowlist.ts). Additive jsonb merge: every other metadata key
 * is kept; an existing non-empty alt_i18n locale is never overwritten unless --force-locale names it.
 * Never TAL-93938 / TAL-93940. Strings are generated deterministically (no machine translation).
 *
 * Modes (default: read-only DRY RUN, the whole run is inside BEGIN READ ONLY):
 *   (none)                           plan per talent per photo: current alt, planned es/en, already set / will set / skipped
 *   --selftest                       BEGIN; apply; re-plan (must be 0); restore; verify; ROLLBACK; re-check nothing persisted
 *   --apply --backup-file <new>      write and COMMIT (idempotent: a second run plans 0); backup = pre-image of every metadata changed
 *   --restore <backup> [--apply --backup-file <new>]   put the recorded `before` back (only where metadata still equals the recorded `after`)
 *   --only TAL-93005,TAL-93006       narrow to these demo talents (never widens the allow-list)
 *   --force-locale es,en             also overwrite an existing value for these locales
 * Env: DATABASE_URL from the process env or --env-file.
 *
 * Run from web/ (QA Conductor):
 *   NODE_PATH=scripts/demo-talents/stubs NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *     npx tsx --tsconfig scripts/demo-talents/tsconfig.json scripts/demo-talents/repair-demo-alt-i18n.mts --env-file <f> [flags]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { STAGING_MARKER_AGENCY_ID, parseEnvText } from "../lib/group6-fixtures.mjs";
import {
  FORBIDDEN_PROFILE_CODES, TARGET_REF, buildBackup, changesOf, checkBackup, checkTarget, checkWritePlan, formatPlanLine,
  narrowAllowList, parseArgs, planAll, planRestore, sameJson, summarise,
} from "../lib/demo-alt-i18n.mjs";
import { demoAltAllowList } from "./demo-alt-allowlist";

type Row = Record<string, unknown>;
type PgClient = { connect(): Promise<void>; query(text: string, params?: unknown[]): Promise<{ rows: Row[]; rowCount: number | null }>; end(): Promise<void> };
const PG_MODULE = "pg";
const pgMod = (await import(PG_MODULE)) as { default: { Client: new (cfg: { connectionString?: string; ssl?: unknown }) => PgClient } };

const TAG = "[demo-alt-i18n]";
function die(msg: string, code = 1): never {
  console.error(`${TAG} ${msg}`);
  process.exit(code);
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("usage: repair-demo-alt-i18n.mts [--env-file p] [--only TAL-93005,..] [--force-locale es,en] [--selftest | --apply --backup-file p | --restore backup [--apply --backup-file p]]");
  process.exit(0);
}
if (args.errors.length) die(args.errors.join("; "), 2);
if (args.backupFile && existsSync(args.backupFile)) die(`--backup-file ${args.backupFile} already exists; pass a new path (never overwritten)`, 2);

const env: Record<string, string | undefined> = { ...process.env };
if (args.envFile) Object.assign(env, parseEnvText(readFileSync(args.envFile, "utf8")));
const verdict = checkTarget(env);
if (!verdict.ok) die(`refusing to run:\n  - ${verdict.reasons.join("\n  - ")}`, 2);

const derived = demoAltAllowList();
const narrowed = narrowAllowList(derived.allowed, args.only);
if (narrowed.errors.length) die(narrowed.errors.join("; "), 2);
const allowed = narrowed.allowed;
if (!allowed.size) die("empty demo allow-list", 2);
const allowedList = [...allowed].sort();

const mode = args.restore ? (args.apply ? "restore-apply" : "restore-plan") : args.selftest ? "selftest" : args.apply ? "apply" : "plan";
const client = new pgMod.default.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const q = (text: string, params: unknown[] = []) => client.query(text, params);

const SELECT = `
  select m.id::text id, m.owner_talent_profile_id::text owner_talent_profile_id, tp.profile_code, tp.display_name,
         tp.home_city_text city, m.variant_kind::text variant_kind, m.sort_order, m.alt, m.metadata,
         (select t.name_en from public.talent_profile_taxonomy x join public.taxonomy_terms t on t.id = x.taxonomy_term_id
           where x.talent_profile_id = tp.id and x.is_primary order by x.display_order limit 1) trade_en,
         (select t.name_es from public.talent_profile_taxonomy x join public.taxonomy_terms t on t.id = x.taxonomy_term_id
           where x.talent_profile_id = tp.id and x.is_primary order by x.display_order limit 1) trade_es
    from public.media_assets m
    join public.talent_profiles tp on tp.id = m.owner_talent_profile_id
   where tp.profile_code = any($1) and m.deleted_at is null
   order by tp.profile_code, m.variant_kind, m.sort_order, m.id`;

async function loadRows() {
  return (await q(SELECT, [allowedList])).rows;
}

async function preflight() {
  const marker = await q("select 1 from public.agencies where id = $1", [STAGING_MARKER_AGENCY_ID]);
  if (!marker.rowCount) die("staging marker agency (qa-journeys) not found: not the staging database, refusing", 2);
  const f = await q("select id::text id, user_id::text uid from public.talent_profiles where profile_code = any($1)", [FORBIDDEN_PROFILE_CODES]);
  return f.rows.flatMap((r) => [r.id, r.uid]).filter(Boolean) as string[];
}

// The ONLY write statements in this file. Both touch media_assets.metadata and nothing else, and both
// re-assert the owner is an allow-listed demo talent and the row is exactly what was planned.
const UPDATE_MERGE = `
  update public.media_assets
     set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('alt_i18n',
           (case when jsonb_typeof(coalesce(metadata, '{}'::jsonb) -> 'alt_i18n') = 'object' then metadata -> 'alt_i18n' else '{}'::jsonb end) || $3::jsonb)
   where id = $1::uuid and owner_talent_profile_id = $2::uuid and deleted_at is null
     and coalesce(metadata, '{}'::jsonb) = $4::jsonb
     and owner_talent_profile_id in (select id from public.talent_profiles where profile_code = any($5))`;
const UPDATE_RESTORE = `
  update public.media_assets set metadata = $3::jsonb
   where id = $1::uuid and owner_talent_profile_id = $2::uuid and deleted_at is null
     and coalesce(metadata, '{}'::jsonb) = $4::jsonb
     and owner_talent_profile_id in (select id from public.talent_profiles where profile_code = any($5))`;

const J = (v: unknown) => JSON.stringify(v);

function printPlan(plans: ReturnType<typeof planAll>) {
  let last = "";
  for (const p of plans) {
    if (p.profile_code !== last) {
      console.log(`\n== ${p.profile_code}`);
      last = p.profile_code;
    }
    console.log(`  ${formatPlanLine(p)}`);
  }
  const s = summarise(plans);
  console.log("\nper talent:");
  for (const [code, t] of Object.entries(s.byTalent)) console.log(`  ${code}: photos=${t.photos} will-set=${t["will-set"]} already-set=${t["already-set"]} skipped=${t.skipped}`);
  console.log(`totals: photos=${s.totals.photos} will-set=${s.totals["will-set"]} already-set=${s.totals["already-set"]} skipped=${s.totals.skipped}`);
  const skipped = plans.filter((p) => p.status === "skipped");
  if (skipped.length) console.log(`skipped reasons: ${[...new Set(skipped.map((p) => p.reason))].join(" | ")}`);
}

async function planNow(forbiddenIds: string[]) {
  const rows = await loadRows();
  const plans = planAll(rows as never[], { allowed, forceLocales: args.forceLocales });
  const changes = changesOf(plans);
  const chk = checkWritePlan(changes, { allowed, forbiddenIds });
  if (!chk.ok) die(`write plan refused:\n  - ${chk.problems.join("\n  - ")}`, 2);
  return { plans, changes };
}

async function applyChanges(changes: ReturnType<typeof changesOf>) {
  for (const c of changes) {
    const r = await q(UPDATE_MERGE, [c.id, c.owner_talent_profile_id, J(c.set), J(c.before), allowedList]);
    if (r.rowCount !== 1) throw new Error(`media_assets ${c.id}: expected 1 row updated, got ${r.rowCount} (row changed under us or is not an allow-listed demo photo)`);
  }
}

async function readBackAfter(changes: ReturnType<typeof changesOf>) {
  const live = new Map((await loadRows()).map((r) => [r.id as string, r.metadata]));
  const bad = changes.filter((c) => !sameJson(live.get(c.id), c.after)).map((c) => c.id);
  if (bad.length) throw new Error(`read-back mismatch on ${bad.length} row(s): ${bad.slice(0, 5).join(", ")}`);
}

async function liveMetadataById(ids: string[]) {
  const r = await q(
    `select m.id::text id, m.metadata, tp.profile_code from public.media_assets m join public.talent_profiles tp on tp.id = m.owner_talent_profile_id
      where m.id = any($1::uuid[]) and m.deleted_at is null and tp.profile_code = any($2)`,
    [ids, allowedList],
  );
  return new Map(r.rows.map((x) => [x.id as string, x as Row]));
}

async function restoreFrom(backup: ReturnType<typeof buildBackup>, write: boolean) {
  const live = await liveMetadataById(backup.updated.map((u: { id: string }) => u.id));
  const plan = planRestore(backup, live as never);
  for (const p of plan) console.log(`  ${p.profile_code} ${p.id}: ${p.status}${p.reason ? ` (${p.reason})` : ""}`);
  const todo = plan.filter((p) => p.status === "will-restore");
  if (write) {
    for (const p of todo) {
      const r = await q(UPDATE_RESTORE, [p.id, p.owner_talent_profile_id, J(p.before), J(p.after), allowedList]);
      if (r.rowCount !== 1) throw new Error(`restore ${p.id}: expected 1 row updated, got ${r.rowCount}`);
    }
  }
  return { plan, todo };
}

async function main() {
  const forbiddenIds = await preflight();
  console.log(`${TAG} mode=${mode} target=${TARGET_REF} demo talents=${allowedList.length}${args.only ? " (narrowed by --only)" : ""} force-locale=${args.forceLocales.join(",") || "none"}`);
  if (derived.dropped.length) console.log(`${TAG} allow-list dropped: ${derived.dropped.join("; ")}`);

  if (args.restore) {
    const backup = JSON.parse(readFileSync(args.restore, "utf8"));
    const chk = checkBackup(backup, { allowed: new Set(derived.allowed) });
    if (!chk.ok) die(`backup refused:\n  - ${chk.problems.join("\n  - ")}`, 2);
    if (!args.apply) {
      await q("begin read only");
      const { todo } = await restoreFrom(backup, false);
      await q("rollback");
      console.log(`\nDRY RUN: would restore ${todo.length} row(s). Nothing written.`);
      return;
    }
    await q("begin");
    try {
      const live = await liveMetadataById(backup.updated.map((u: { id: string }) => u.id));
      const pre = planRestore(backup, live as never).filter((p) => p.status === "will-restore");
      const inverse = buildBackup({
        mode, at: new Date().toISOString(),
        changes: pre.map((p) => ({ id: p.id, profile_code: p.profile_code, owner_talent_profile_id: p.owner_talent_profile_id, before: p.after, after: p.before })),
      });
      writeFileSync(args.backupFile as string, JSON.stringify(inverse, null, 2), { mode: 0o600, flag: "wx" });
      const { todo } = await restoreFrom(backup, true);
      await q("commit");
      console.log(`\nRESTORED ${todo.length} row(s). Inverse pre-image: ${args.backupFile}`);
    } catch (e) {
      await q("rollback");
      throw e;
    }
    return;
  }

  if (mode === "plan") {
    await q("begin read only");
    const { plans } = await planNow(forbiddenIds);
    await q("rollback");
    printPlan(plans);
    console.log("\nDRY RUN: nothing written (transaction was READ ONLY).");
    return;
  }

  if (mode === "selftest") {
    await q("begin");
    try {
      const first = await planNow(forbiddenIds);
      printPlan(first.plans);
      await applyChanges(first.changes);
      await readBackAfter(first.changes);
      const second = await planNow(forbiddenIds);
      const again = second.changes.length;
      console.log(`\nselftest: applied ${first.changes.length} change(s); second pass plans ${again} (must be 0)`);
      if (again !== 0) throw new Error("not idempotent: second pass still plans changes");
      const backup = buildBackup({ mode, at: new Date().toISOString(), forceLocales: args.forceLocales, changes: first.changes });
      const restored = await restoreFrom(backup, true);
      const live = new Map((await loadRows()).map((r) => [r.id as string, r.metadata]));
      const wrong = first.changes.filter((c) => !sameJson(live.get(c.id), c.before));
      if (wrong.length) throw new Error(`restore did not return ${wrong.length} row(s) to their pre-image`);
      console.log(`selftest: restore returned ${restored.todo.length} row(s) to their pre-image`);
      await q("rollback");
      const after = await planNow(forbiddenIds);
      if (after.changes.length !== first.changes.length) throw new Error("rollback did not leave the database as it was");
      console.log(`selftest PASS: rolled back, ${after.changes.length} change(s) still pending, nothing persisted.`);
    } catch (e) {
      await q("rollback").catch(() => {});
      throw e;
    }
    return;
  }

  // apply
  await q("begin");
  try {
    const { plans, changes } = await planNow(forbiddenIds);
    printPlan(plans);
    const backup = buildBackup({ mode, at: new Date().toISOString(), forceLocales: args.forceLocales, changes });
    writeFileSync(args.backupFile as string, JSON.stringify(backup, null, 2), { mode: 0o600, flag: "wx" });
    await applyChanges(changes);
    await readBackAfter(changes);
    const verify = await planNow(forbiddenIds);
    if (verify.changes.length !== 0) throw new Error("post-write re-plan is not empty");
    await q("commit");
    console.log(`\nAPPLIED ${changes.length} media_assets.metadata update(s). Backup: ${args.backupFile}. Re-run plans 0.`);
  } catch (e) {
    await q("rollback");
    console.error(`${TAG} rolled back; nothing committed (the backup file, if written, describes changes that did NOT land).`);
    throw e;
  }
}

try {
  await main();
} catch (e) {
  console.error(`${TAG} FAILED: ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
