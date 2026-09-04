#!/usr/bin/env node
/**
 * check-anon-function-grants.mjs — "is anything exposed to anon that should not be?"
 *
 *   cd web && npm run check:anon-grants
 *
 * ─── THE DIRECTION NOBODY WAS CHECKING ──────────────────────────────────────
 *
 * `rls-grant-drift.static.test.ts` already guards the opposite direction:
 * nothing on PUBLIC_SURFACE_FUNCTIONS may be revoked from anon, because doing
 * so silently blanks a guest surface. That check is good and it has caught real
 * breakage.
 *
 * It could never have caught what happened on 2026-09-03, because a hole is the
 * other direction. Four SECURITY DEFINER functions held anon EXECUTE grants
 * while being absent from that list:
 *
 *   replace_talent_languages          DELETE + INSERT on talent_languages using
 *                                     nothing but the caller's parameters. No
 *                                     auth.uid(), no ownership check, no tenant
 *                                     check. Profile ids are printed on public
 *                                     directory pages, so an unauthenticated
 *                                     caller could wipe and rewrite any
 *                                     talent's languages.
 *   refresh_talent_skill_metrics_all  NO ARGUMENTS, opens with
 *                                     TRUNCATE public.talent_skill_metrics.
 *                                     One anon call empties a live table, and
 *                                     it is repeatable with nothing to guess.
 *   sync_location_taxonomy_terms      no arguments, no caller in web/src at all
 *   ensure_city_location              anon writes into the shared locations table
 *
 * Every one was already a violation of a contract this repo maintained. The
 * contract simply had no enforcement in the direction that mattered. So this
 * script asserts the complement: NOTHING outside PUBLIC_SURFACE_FUNCTIONS may
 * hold an anon EXECUTE grant.
 *
 * ─── WHY A SCRIPT AND NOT A TEST ────────────────────────────────────────────
 *
 * It needs a live database: a grant is a property of the deployed schema, not
 * of the source. The structural CI lane runs WITHOUT database credentials by
 * design, so putting this there would produce a check that passes with no
 * database and proves nothing — the precise failure mode this repo has recorded
 * more than once. It belongs in the `deploy:smoke` family: run it after a
 * deploy, and after any migration that touches GRANT or REVOKE.
 *
 * Same credential contract as check-migrations-applied.mjs: hard-fail if CI=true
 * and credentials are missing, so it can never silently no-op inside a pipeline
 * that does have them.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Read the allow-list from its TypeScript module rather than restating it.
 * A second copy of a security boundary is a second boundary, and the two drift
 * — which is how a list that already named the right five functions failed to
 * protect anything.
 */
function loadAllowList() {
  const src = readFileSync(
    join(HERE, "..", "src", "lib", "saas", "public-surface-functions.ts"),
    "utf8",
  );
  const block = src.match(/PUBLIC_SURFACE_FUNCTIONS[^=]*=\s*\[([\s\S]*?)\]/);
  if (!block) {
    console.error(
      "[check-anon-grants] could not parse PUBLIC_SURFACE_FUNCTIONS. Refusing to " +
        "run: an unparsed allow-list would flag nothing and report clean.",
    );
    process.exit(1);
  }
  const names = [...block[1].matchAll(/"([a-z0-9_]+)"/gi)].map((m) => m[1]);
  if (names.length === 0) {
    console.error("[check-anon-grants] allow-list parsed but EMPTY. Refusing to run.");
    process.exit(1);
  }
  return names;
}

// Reading pg_proc needs raw SQL, which PostgREST does not expose. The repo
// already has this path: scripts/apply-migration.mjs uses the Supabase
// Management API's /database/query endpoint. Same credentials, same endpoint.
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!TOKEN || !URL_) {
  if (process.env.CI === "true") {
    console.error(
      "[check-anon-grants] FATAL: running in CI but SUPABASE_ACCESS_TOKEN or " +
        "NEXT_PUBLIC_SUPABASE_URL is missing.",
    );
    process.exit(1);
  }
  console.warn(
    "[check-anon-grants] SUPABASE_ACCESS_TOKEN or NEXT_PUBLIC_SUPABASE_URL " +
      "missing — skipping. To enforce, set both.",
  );
  process.exit(0);
}

const REF = new global.URL(URL_).hostname.split(".")[0];
const allowed = new Set(loadAllowList());

const AUDIT_SQL = `
  select p.proname,
         p.prosecdef as prosecdef,
         (pg_get_functiondef(p.oid) ilike '%auth.uid()%') as reads_uid,
         (pg_get_functiondef(p.oid) ~* '\\m(insert into|update |delete from|truncate)\\M') as mutates
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'
     and pg_get_function_result(p.oid) <> 'trigger'
     and has_function_privilege('anon', p.oid, 'EXECUTE')
     -- EXCLUDE EXTENSION-OWNED FUNCTIONS. pgvector and pg_trgm install into
     -- public and grant to PUBLIC by design: 471 of 476 anon-executable
     -- functions here are theirs. Including them produced a guard with 471
     -- warnings, which is a guard nobody reads. We do not own their grants and
     -- cannot revoke them without breaking the extension.
     and not exists (
       select 1 from pg_depend d
        where d.objid = p.oid
          and d.deptype = 'e'
     )
   order by p.proname;
`;

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query: AUDIT_SQL }),
});

if (!res.ok) {
  // A check that cannot see the schema must FAIL, never report clean. Reporting
  // "0 findings" because the query did not run is the exact false green this
  // whole file exists to prevent.
  console.error(
    `[check-anon-grants] could not read function grants: ${res.status} ${await res.text()}`,
  );
  process.exit(1);
}

const rows = await res.json();
if (!Array.isArray(rows)) {
  console.error("[check-anon-grants] unexpected response shape. Refusing to report clean.");
  process.exit(1);
}

const unexpected = rows.filter((r) => !allowed.has(r.proname));
const missing = [...allowed].filter((a) => !rows.some((r) => r.proname === a));

/**
 * WHAT ACTUALLY FAILS, and why it is not simply "off the allow-list".
 *
 * Measured against production the first time this ran: 93 functions sit off the
 * allow-list and 20 of them mutate — but NINETEEN of those twenty read
 * auth.uid() and defend themselves in the body. Failing on all 93 would be a
 * guard reporting 93 problems on a database with one, and a guard that cries
 * wolf is one people learn to skip.
 *
 * The dangerous SHAPE is the one replace_talent_languages had, not membership
 * of a list: it MUTATES, it is reachable by anon, and NOTHING in its body
 * checks who is calling. The grant was the only thing between the internet and
 * a DELETE, which is why revoking it was a tourniquet rather than a cure.
 *
 * So: mutating + anon-reachable + no internal auth check = FAIL. Everything
 * else off the list is a WARN worth reading but not worth blocking on — those
 * functions have a second line of defence.
 */
const isDangerous = (r) => r.mutates && !r.reads_uid;

for (const r of unexpected) {
  const severity = isDangerous(r) ? "FAIL" : "WARN";
  const defends = r.reads_uid ? "defends itself (reads auth.uid())" : "NO internal check";
  console.error(
    `${severity}  ${r.proname} — anon-executable, not on the allow-list, ` +
      `${r.mutates ? "MUTATES" : "read-only"}, ${defends}` +
      (r.prosecdef ? ", SECURITY DEFINER (bypasses RLS)" : ""),
  );
}

// A name on the list that anon CANNOT execute is the other failure: a guest
// surface has been revoked and is silently blank for logged-out visitors.
for (const m of missing) {
  console.error(
    `FAIL  ${m} — on the allow-list but anon CANNOT execute it. A guest surface ` +
      `is blank for logged-out visitors, with no error anywhere.`,
  );
}

const dangerous = unexpected.filter(isDangerous);
const mutating = unexpected.filter((r) => r.mutates);
console.log(
  `\n[check-anon-grants] ${rows.length} anon-executable function(s): ` +
    `${unexpected.length} off the allow-list, ${mutating.length} of them mutating, ` +
    `${dangerous.length} MUTATING WITH NO INTERNAL CHECK, ` +
    `${missing.length} allow-listed but unreachable.`,
);

if (dangerous.length > 0 || missing.length > 0) {
  console.error(
    "\nA grant is not authorization, it is the outer door. Revoke with BOTH " +
      "`FROM PUBLIC` and `FROM <role>` — neither alone is sufficient — then " +
      "assert with has_function_privilege. Check the callers first: revoking a " +
      "function the app calls with an anon-key client blanks that surface " +
      "silently.",
  );
  process.exit(1);
}
process.exit(0);
