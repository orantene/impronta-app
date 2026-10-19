/**
 * function-execute-guard-cli.mjs: the I/O half of the new-function EXECUTE
 * guard (TUL-1269 #6 systemic, package I2). PUBLIC SCHEMA ONLY. Pure
 * judgement lives in function-execute-guard.mjs.
 *
 * Entry point: `node web/scripts/check-anon-function-grants.mjs --local-pg`
 * in the "Local Supabase + migration chain" job, AFTER the migration replay.
 * It reads the job's local Postgres through `psql` with the PG* env vars the
 * job already sets (PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE). No token, no
 * remote project, no npm dependency.
 *
 * `--rows <file.json>` replaces the psql read with a saved result (used to
 * validate the guard against a staging read without a local database).
 *
 * ─── WARN-ONLY UNTIL THE BASELINE IS COMMITTED ─────────────────────────────
 * The baseline (what is executable today) can only be measured on a replayed
 * schema, which exists only inside CI. So the first runs are WARN-ONLY: exit
 * 0, a big annotation, and the full current list printed as a copyable JSON
 * block (job log group + step summary). To arm the guard:
 *   1. copy that block into web/scripts/function-execute-baseline.json
 *   2. set FUNCTION_EXECUTE_GUARD_ENFORCE = true below
 * in ONE PR. From then on, in the public schema, the job fails on
 *   - a NEW (role, signature) pair executable by anon or authenticated whose
 *     SIGNATURE is not reviewed in web/scripts/function-execute-allowlist.json
 *     (policy helpers may be reviewed for authenticated only), and
 *   - a NEW function used in a policy or column default that authenticated
 *     cannot execute (runtime "permission denied for function").
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildBaseline,
  compareExecutable,
  decideOutcome,
  normaliseRows,
  parseReviewedAllowList,
  parseSurfaceModule,
  reviewedFromSources,
} from "./function-execute-guard.mjs";

/** THE SWITCH. false = WARN-ONLY (exit 0). true = blocking. See header. */
export const FUNCTION_EXECUTE_GUARD_ENFORCE = false;

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = join(HERE, "..");
const SURFACE_TS = join(SCRIPTS, "..", "src", "lib", "saas", "public-surface-functions.ts");
const ALLOWLIST_JSON = join(SCRIPTS, "function-execute-allowlist.json");
const BASELINE_JSON = join(SCRIPTS, "function-execute-baseline.json");

/**
 * PUBLIC SCHEMA ONLY. Every non-extension, non-trigger function in `public`
 * that anon or authenticated can EXECUTE (directly or through PUBLIC), PLUS
 * every one a policy or column default depends on (pg_depend), so a helper
 * nobody can execute still shows up. Extension functions (pg_trgm, vector,
 * citext, btree_gist) are excluded: we do not own their grants. The signature
 * uses argument TYPES only, with a fixed search_path so type names print the
 * same on every run.
 *   usedInPolicy:  a policy that applies to authenticated or PUBLIC uses it.
 *   usedInDefault: a column default on a table authenticated can INSERT into.
 */
export const AUDIT_SQL = `
with policy_refs as (
  select distinct d.refobjid as fn
    from pg_depend d
    join pg_policy pol on d.classid = 'pg_policy'::regclass and d.objid = pol.oid
   where d.refclassid = 'pg_proc'::regclass
     and (pol.polroles = '{0}' or 'authenticated'::regrole::oid = any(pol.polroles))
), default_refs as (
  select distinct d.refobjid as fn
    from pg_depend d
    join pg_attrdef ad on d.classid = 'pg_attrdef'::regclass and d.objid = ad.oid
   where d.refclassid = 'pg_proc'::regclass
     and has_table_privilege('authenticated', ad.adrelid, 'INSERT')
)
select coalesce(json_agg(json_build_object(
         'signature', format('%s(%s)', p.proname, oidvectortypes(p.proargtypes)),
         'name', p.proname,
         'secdef', p.prosecdef,
         'anon', has_function_privilege('anon', p.oid, 'EXECUTE'),
         'authenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
         'usedInPolicy', p.oid in (select fn from policy_refs),
         'usedInDefault', p.oid in (select fn from default_refs)
       ) order by p.proname, oidvectortypes(p.proargtypes)), '[]'::json)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prokind = 'f'
   and p.prorettype <> 'trigger'::regtype
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
   and (has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or p.oid in (select fn from policy_refs)
        or p.oid in (select fn from default_refs))
`;

function readRows(argv) {
  const i = argv.indexOf("--rows");
  if (i >= 0) return JSON.parse(readFileSync(argv[i + 1], "utf8"));
  const out = execFileSync(
    "psql",
    ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-c", "set search_path to public, extensions", "-c", AUDIT_SQL],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return JSON.parse(out.trim());
}

function summary(text) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
}

const oneLine = (s) => s.replace(/\r?\n/g, " ");

/** Returns the process exit code. Never throws for a measurement failure: it reports and returns 1. */
export async function runLocalGuard(argv) {
  let rows;
  let reviewed;
  let baseline = null;
  try {
    rows = normaliseRows(readRows(argv));
    const surface = parseSurfaceModule(readFileSync(SURFACE_TS, "utf8"));
    const jsonEntries = parseReviewedAllowList(JSON.parse(readFileSync(ALLOWLIST_JSON, "utf8")));
    reviewed = reviewedFromSources(surface, jsonEntries);
    if (existsSync(BASELINE_JSON)) baseline = JSON.parse(readFileSync(BASELINE_JSON, "utf8"));
  } catch (err) {
    // "Could not measure" must never share an exit code with "measured, clean".
    console.error(`::error title=Function EXECUTE guard: NOT MEASURED::${oneLine(String(err?.message ?? err))}`);
    return 1;
  }

  const { unreviewed, missingGrant, staleBaseline } = compareExecutable({ rows, reviewed, baseline });
  const outcome = decideOutcome({
    enforce: FUNCTION_EXECUTE_GUARD_ENFORCE,
    baselinePresent: baseline !== null,
    findingCount: unreviewed.length + missingGrant.length,
  });

  const anonCount = rows.filter((r) => r.anon).length;
  const authCount = rows.filter((r) => r.authenticated).length;
  console.log(
    `[function-execute-guard] public functions executable: anon ${anonCount}, authenticated ${authCount} ` +
      `(${rows.filter((r) => r.secdef).length} SECURITY DEFINER). Unreviewed: ${unreviewed.length}. ` +
      `Policy/default helpers without an authenticated grant: ${missingGrant.length}. ` +
      `Baseline: ${baseline ? "committed" : "MISSING"}. Mode: ${FUNCTION_EXECUTE_GUARD_ENFORCE ? "ENFORCE" : "WARN-ONLY"}.`,
  );

  const annotate = outcome.level === "fail" ? "error" : "warning";
  if (baseline) {
    for (const u of unreviewed) {
      console.log(
        `::${annotate} title=Unreviewed function grant::${u.role} can EXECUTE public.${u.signature}` +
          `${u.secdef ? " (SECURITY DEFINER, bypasses RLS)" : ""}. Revoke it in the migration ` +
          "(REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated) or add its signature with roles and a reason to " +
          "web/scripts/function-execute-allowlist.json.",
      );
    }
    for (const m of missingGrant) {
      console.log(
        `::${annotate} title=Missing authenticated grant::public.${m.signature} is used in a ${m.usedIn.join(" and ")} ` +
          "but authenticated cannot EXECUTE it: signed-in queries will fail with \"permission denied for function\". " +
          `Add GRANT EXECUTE ON FUNCTION public.${m.signature} TO authenticated; in the migration.`,
      );
    }
    if (reviewed.unpinned.length > 0) {
      console.log(`[function-execute-guard] TS-listed names with no pinned signature in the allow-list: ${reviewed.unpinned.join(", ")}`);
    }
    if (staleBaseline.length > 0) {
      console.log(`[function-execute-guard] ${staleBaseline.length} baseline entr(ies) no longer executable (good); prune when convenient.`);
    }
  } else {
    const block = JSON.stringify(buildBaseline(rows), null, 2);
    console.log("::group::Baseline to commit as web/scripts/function-execute-baseline.json");
    console.log(block);
    console.log("::endgroup::");
    summary(
      "### Function EXECUTE guard: baseline to commit\n\n" +
        "Copy into `web/scripts/function-execute-baseline.json`, then set " +
        "`FUNCTION_EXECUTE_GUARD_ENFORCE = true` in `web/scripts/lib/function-execute-guard-cli.mjs` (same PR).\n\n" +
        "```json\n" + block + "\n```\n",
    );
  }

  const title = outcome.level === "pass" ? "notice" : annotate;
  console.log(`::${title} title=Function EXECUTE guard (${outcome.level.toUpperCase()})::${outcome.message}`);
  summary(`**Function EXECUTE guard (${outcome.level.toUpperCase()}):** ${outcome.message}`);
  return outcome.exitCode;
}
