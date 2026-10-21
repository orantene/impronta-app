/**
 * TUL-1269: signed-in users may not read other talents' private details.
 *
 * Held migration supabase/migrations/_pending_pm/20261231424900_* revokes the
 * table-wide SELECT on public.talent_profiles from `authenticated` and re-grants
 * every column EXCEPT seven private ones. Three static pins:
 *
 *   1. The migration text says what the PR says (revoke, column-list logic,
 *      SECURITY DEFINER RPC with search_path '', REVOKE/GRANT, held location).
 *   2. No non-test file under src reads a private column (or select "*") from
 *      talent_profiles unless it is on the audited SERVICE-ROLE allow-list. Such a
 *      read on a user-session client would become "permission denied" the
 *      moment the migration lands.
 *   3. Fail-closed rule for FUTURE migrations: a migration with a version after
 *      424900 that adds a talent_profiles column must also GRANT SELECT (col) TO
 *      authenticated or declare `-- private column: col`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const WEB = process.cwd();
const SRC = join(WEB, "src");
const MIGRATIONS = join(WEB, "..", "supabase", "migrations");
const HELD_DIR = join(MIGRATIONS, "_pending_pm");
/** PART A: additive RPC. Applied before the code merges. */
const PART_A_FILE = "20261231424900_talent_profiles_private_columns.sql";
/** PART B: the REVOKE + column grants. Applied only after the code is deployed. */
const PART_B_FILE = "20261231425500_talent_profiles_private_columns_revoke.sql";
/**
 * Cutoff of the fail-closed rule = the REVOKE migration (part B). A column added
 * by a migration versioned AFTER it is not swept into B's apply-time grant list,
 * so it needs its own GRANT or a "-- private column:" marker. A column added
 * before B (including between A and B) IS swept in automatically.
 */
const CUTOFF_VERSION = "20261231425500";

const PRIVATE_COLUMNS = [
  "phone",
  "phone_e164",
  "date_of_birth",
  "legal_name",
  "stripe_account_id",
  "gp_recipient_account_id",
  "ai_search_document",
] as const;

/**
 * Audited files that name a private column (or select "*") on talent_profiles
 * through a SERVICE-ROLE client (or a staff-gated route that switches to one).
 * Adding a file here is a security review decision: say why.
 */
const SERVICE_ROLE_ALLOWLIST: Record<string, string> = {
  "src/app/%5Ftalent-site/TalentSiteMessagesDock.tsx": "admin client; visitor-facing contact lookup",
  "src/app/api/admin/inspector/talent/route.ts": "requireStaffApi + tenant roster check, then service role",
  "src/app/api/admin/users/global-search/route.ts": "platform-admin-only talent branch, service role",
  "src/lib/onboarding/how-you-work.server.ts": "admin client",
  "src/lib/payments/stripe-connect-talent.ts": "admin client (Stripe Connect)",
  "src/lib/payments/talent-global-payouts.ts": "service-role client (Global Payouts)",
  "src/lib/payments/transfers.ts": "createServiceRoleClient (money path)",
  "src/lib/pricing/stripe-health.ts": "createServiceRoleClient (platform health panel)",
  "src/lib/stripe/no-receiver-lane.ts": "service-role client passed in by charge-platform / seller-currency-guard",
  "src/lib/talent-policies/facts.ts": "admin client",
  "src/lib/talent-site/server/load-starter-data.ts": "trusted service-role client",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|static\.test)\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const rel = (p: string) => relative(WEB, p).split("\\").join("/");

function balanced(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return src.slice(open + 1);
}

function stripNested(s: string): string {
  let out = s;
  let prev = "";
  while (out !== prev) {
    prev = out;
    out = out.replace(/\([^()]*\)/g, " ");
  }
  return out;
}

function tokens(list: string): string[] {
  return list
    .replace(/[`"']/g, " ")
    .split(/[\s,]+/)
    .map((t) => t.replace(/^.*:/, "").trim())
    .filter(Boolean);
}

type ColumnRead = { where: string; star: boolean; cols: string[] };

/** Every talent_profiles column list (direct select or embed) in one file. */
export function readsOf(src: string): ColumnRead[] {
  const reads: ColumnRead[] = [];
  const constValue = (name: string): string | null => {
    const m = src.match(new RegExp(`(?:const|let)\\s+${name}\\b[^=]*=\\s*(\`[\\s\\S]*?\`|"[^"]*"|'[^']*')`));
    return m ? m[1] : null;
  };
  for (const m of src.matchAll(/\.from\(\s*["'`]talent_profiles["'`]\s*\)/g)) {
    const idx = m.index ?? 0;
    const tail = src.slice(idx, idx + 1500);
    const sel = tail.match(/\.select\(/);
    if (!sel || sel.index === undefined) continue;
    const arg = balanced(tail, sel.index + ".select".length).trim();
    const line = src.slice(0, idx).split("\n").length;
    const first = arg.split(/,\s*\{/)[0].trim();
    let text: string | null = null;
    if (first === "") text = "*";
    else if (/^[`"']/.test(first)) text = first;
    else if (/^[A-Za-z_][\w]*$/.test(first)) text = constValue(first);
    if (text == null) continue;
    const cols = tokens(stripNested(text));
    reads.push({ where: `L${line}`, star: cols.includes("*"), cols });
  }
  for (const m of src.matchAll(/talent_profiles(?:![\w]+)?\s*\(/g)) {
    const idx = (m.index ?? 0) + m[0].length - 1;
    const cols = tokens(stripNested(balanced(src, idx)));
    const line = src.slice(0, idx).split("\n").length;
    reads.push({ where: `L${line} (embed)`, star: cols.includes("*"), cols });
  }
  return reads;
}

/**
 * Columns a migration adds to talent_profiles that are neither granted to
 * `authenticated` nor declared private in the same file.
 */
export function uncoveredNewColumns(sql: string): string[] {
  const noComments = sql.replace(/--[^\n]*/g, "");
  const added: string[] = [];
  for (const m of noComments.matchAll(
    /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:"?public"?\.)?"?talent_profiles"?\s+([^;]*);/gi,
  )) {
    for (const c of m[1].matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?/gi)) added.push(c[1].toLowerCase());
  }
  if (added.length === 0) return [];
  const covered = new Set<string>();
  for (const g of noComments.matchAll(
    /GRANT\s+SELECT\s*\(([^)]*)\)\s*ON\s+(?:TABLE\s+)?(?:"?public"?\.)?"?talent_profiles"?\s+TO\s+([^;]*);/gi,
  )) {
    if (!/\bauthenticated\b/i.test(g[2])) continue;
    for (const c of g[1].split(",")) covered.add(c.replace(/"/g, "").trim().toLowerCase());
  }
  for (const m of sql.matchAll(/--\s*private column:\s*([^\n]*)/gi)) {
    for (const c of m[1].split(/[,\s]+/)) if (c) covered.add(c.replace(/"/g, "").toLowerCase());
  }
  return [...new Set(added)].filter((c) => !covered.has(c));
}

// ─── 1. migration pins ──────────────────────────────────────────────────────

const stripComments = (sql: string) => sql.replace(/^\s*--.*$/gm, "");
const partA = () => readFileSync(join(HELD_DIR, PART_A_FILE), "utf8");
const partB = () => readFileSync(join(HELD_DIR, PART_B_FILE), "utf8");

test("both parts are held in _pending_pm, not live, and B sorts after A", () => {
  const held = readdirSync(HELD_DIR);
  const live = readdirSync(MIGRATIONS);
  for (const f of [PART_A_FILE, PART_B_FILE]) {
    assert.ok(held.includes(f), `${f} must be held`);
    assert.ok(!live.includes(f), `${f} must not be in the live migrations folder`);
  }
  assert.ok(PART_A_FILE.slice(0, 14) < PART_B_FILE.slice(0, 14), "part B must sort after part A");
  // Exactly one held file per reserved version (no collision).
  assert.equal(held.filter((f) => f.startsWith("20261231424900")).length, 1);
  assert.equal(held.filter((f) => f.startsWith("20261231425500")).length, 1);
});

test("PART A is additive only: creates the RPC, revokes and alters nothing on talent_profiles", () => {
  const code = stripComments(partA());
  assert.doesNotMatch(code, /REVOKE\s+SELECT/i);
  assert.doesNotMatch(code, /(REVOKE|GRANT)[^;]*ON\s+(TABLE\s+)?(public\.)?talent_profiles/i);
  assert.doesNotMatch(code, /ALTER\s+TABLE|DROP\s+(TABLE|POLICY|COLUMN)|CREATE\s+POLICY|ALTER\s+DEFAULT/i);
  assert.doesNotMatch(code, /SET\s+(LOCAL\s+)?ROLE/i);
  // The only REVOKE is the function ACL.
  for (const m of code.matchAll(/REVOKE[^;]*;/gi)) {
    assert.match(m[0], /ON FUNCTION public\.talent_private_fields\(uuid\) FROM PUBLIC, anon;/);
  }
  assert.match(partA(), /apply ONLY|AFTER|BEFORE the code merges/i);
});

test("talent_private_fields is SECURITY DEFINER with an empty search_path and a locked-down ACL", () => {
  const code = stripComments(partA());
  const fn = code.match(/CREATE OR REPLACE FUNCTION public\.talent_private_fields\(p_talent_id uuid\)[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.ok(fn, "function missing");
  assert.match(fn, /SECURITY DEFINER/);
  assert.match(fn, /SET search_path = ''/);
  assert.match(fn, /tp\.user_id = auth\.uid\(\)/);
  assert.match(fn, /public\.staff_can_access_talent_profile\(p_talent_id\)/);
  const returns = fn.match(/RETURNS TABLE \(([\s\S]*?)\)\s*LANGUAGE/)?.[1] ?? "";
  assert.deepEqual(
    [...returns.matchAll(/^\s*([a-z_0-9]+)\s/gm)].map((m) => m[1]).sort(),
    [...PRIVATE_COLUMNS].sort(),
  );
  assert.match(code, /REVOKE ALL ON FUNCTION public\.talent_private_fields\(uuid\) FROM PUBLIC, anon;/);
  assert.match(code, /GRANT EXECUTE ON FUNCTION public\.talent_private_fields\(uuid\) TO authenticated;/);
  assert.doesNotMatch(code, /GRANT EXECUTE ON FUNCTION public\.talent_private_fields[^;]*\banon\b/);
  // Part A must not itself define the revoke.
  assert.doesNotMatch(code, /GRANT SELECT \(%s\)/);
});

test("PART B revokes table SELECT from authenticated and column-grants the rest, after the code deploys", () => {
  const sql = partB();
  const code = stripComments(sql);
  assert.match(sql, /APPLY ONLY AFTER THE #4392 CODE IS DEPLOYED/);
  assert.match(code, /REVOKE SELECT ON public\.talent_profiles FROM authenticated;/);
  assert.match(code, /GRANT SELECT \(%s\) ON public\.talent_profiles TO authenticated/);
  assert.match(code, /information_schema\.columns/);
  assert.match(code, /column_name <> ALL \(private_cols\)/);
  const arr = code.match(/private_cols constant text\[\] := ARRAY\[([\s\S]*?)\];/)?.[1] ?? "";
  assert.deepEqual(
    [...arr.matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]).sort(),
    [...PRIVATE_COLUMNS].sort(),
    "the excluded set must be exactly the seven private columns",
  );
  assert.ok(code.indexOf("REVOKE SELECT ON public.talent_profiles FROM authenticated") < code.indexOf("GRANT SELECT (%s)"));
  // It refuses to run before part A exists.
  assert.match(code, /to_regprocedure\('public\.talent_private_fields\(uuid\)'\) IS NULL/);
  assert.match(sql, /version > 20261231425500|AFTER this file \(version > 20261231425500\)/);
});

test("PART B does not widen anon or touch write grants / service_role", () => {
  const code = stripComments(partB());
  assert.doesNotMatch(code, /talent_profiles\s+TO\s+[^;]*\banon\b/);
  assert.doesNotMatch(code, /(REVOKE|GRANT)\s+(INSERT|UPDATE|DELETE|ALL)[^;]*talent_profiles/i);
  assert.doesNotMatch(code, /(REVOKE|GRANT)[^;]*talent_profiles[^;]*service_role/i);
  assert.doesNotMatch(code, /SET\s+(LOCAL\s+)?ROLE/i);
  assert.doesNotMatch(code, /CREATE OR REPLACE FUNCTION/i);
});

test("the reviewed-function allow-list lists talent_private_fields for authenticated only", () => {
  const json = JSON.parse(readFileSync(join(WEB, "scripts", "function-execute-allowlist.json"), "utf8")) as {
    reviewed: Array<{ signature: string; roles: string[]; reason: string }>;
  };
  const entry = json.reviewed.find((e) => e.signature === "talent_private_fields(uuid)");
  assert.ok(entry, "talent_private_fields(uuid) must be reviewed");
  assert.deepEqual(entry.roles, ["authenticated"]);
  assert.match(entry.reason, /auth\.uid|staff_can_access_talent_profile/);
});

// ─── 2. code guard ──────────────────────────────────────────────────────────

test("no non-allow-listed source file reads a private column or select(*) from talent_profiles", () => {
  const offenders: string[] = [];
  let reads = 0;
  for (const p of walk(SRC)) {
    const src = readFileSync(p, "utf8");
    if (!src.includes("talent_profiles")) continue;
    const f = rel(p);
    for (const r of readsOf(src)) {
      reads++;
      if (SERVICE_ROLE_ALLOWLIST[f]) continue;
      if (r.star) offenders.push(`${f} ${r.where}: select("*")`);
      for (const c of r.cols) {
        if ((PRIVATE_COLUMNS as readonly string[]).includes(c)) offenders.push(`${f} ${r.where}: names private column ${c}`);
      }
    }
  }
  assert.ok(reads >= 40, `scanner found only ${reads} reads; it has gone blind`);
  assert.deepEqual(offenders, []);
});

test("every allow-listed file still exists and still reads a private column or star (no stale entries)", () => {
  for (const f of Object.keys(SERVICE_ROLE_ALLOWLIST)) {
    const src = readFileSync(join(WEB, f), "utf8");
    const hits = readsOf(src).some((r) => r.star || r.cols.some((c) => (PRIVATE_COLUMNS as readonly string[]).includes(c)));
    assert.ok(hits, `${f} no longer needs its allow-list entry; remove it`);
  }
});

test("the read scanner can refuse (self-check)", () => {
  const bad = readsOf(
    'const a = sb.from("talent_profiles").select("id, phone_e164");\n' +
      'const b = sb.from("talent_profiles").select("*");\n' +
      'const c = sb.from("x").select("id, talent_profiles(legal_name)");\n',
  );
  assert.equal(bad.length, 3);
  assert.ok(bad[0].cols.includes("phone_e164"));
  assert.ok(bad[1].star);
  assert.ok(bad[2].cols.includes("legal_name"));
  const ok = readsOf('const a = sb.from("talent_profiles").select("id, display_name");');
  assert.ok(!ok[0].star && !ok[0].cols.some((c) => (PRIVATE_COLUMNS as readonly string[]).includes(c)));
});

// ─── 3. fail-closed rule for later migrations ───────────────────────────────

function migrationFiles(): Array<{ name: string; path: string }> {
  const out: Array<{ name: string; path: string }> = [];
  for (const dir of [MIGRATIONS, HELD_DIR]) {
    for (const name of readdirSync(dir)) {
      if (/^\d{14}_.*\.sql$/.test(name)) out.push({ name, path: join(dir, name) });
    }
  }
  return out;
}

test("migrations after the revoke (425500) that add a talent_profiles column grant it or mark it private", () => {
  const files = migrationFiles();
  assert.ok(files.length > 200, "migration scan went blind");
  const offenders: string[] = [];
  for (const f of files) {
    if (f.name.slice(0, 14) <= CUTOFF_VERSION) continue;
    for (const c of uncoveredNewColumns(readFileSync(f.path, "utf8"))) {
      offenders.push(`${f.name}: adds talent_profiles.${c} without GRANT SELECT (${c}) ... TO authenticated or "-- private column: ${c}"`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("uncoveredNewColumns handles the statement shapes (self-check)", () => {
  assert.deepEqual(uncoveredNewColumns("ALTER TABLE public.talent_profiles ADD COLUMN foo text;"), ["foo"]);
  assert.deepEqual(uncoveredNewColumns("ALTER TABLE talent_profiles ADD COLUMN IF NOT EXISTS foo text;"), ["foo"]);
  assert.deepEqual(uncoveredNewColumns("ALTER TABLE IF EXISTS public.talent_profiles\n  ADD COLUMN a int,\n  ADD COLUMN IF NOT EXISTS b text;"), ["a", "b"]);
  assert.deepEqual(uncoveredNewColumns("ALTER TABLE ONLY public.talent_profiles ADD COLUMN x int;"), ["x"]);
  assert.deepEqual(uncoveredNewColumns("ALTER TABLE public.agencies ADD COLUMN foo text;"), []);
  assert.deepEqual(
    uncoveredNewColumns(
      "ALTER TABLE public.talent_profiles ADD COLUMN a int, ADD COLUMN b int;\nGRANT SELECT (a, b) ON public.talent_profiles TO authenticated;",
    ),
    [],
  );
  assert.deepEqual(
    uncoveredNewColumns(
      "ALTER TABLE public.talent_profiles ADD COLUMN a int, ADD COLUMN b int;\nGRANT SELECT (a) ON public.talent_profiles TO authenticated, anon;",
    ),
    ["b"],
  );
  // A grant to anon only does not cover authenticated.
  assert.deepEqual(
    uncoveredNewColumns("ALTER TABLE public.talent_profiles ADD COLUMN a int;\nGRANT SELECT (a) ON public.talent_profiles TO anon;"),
    ["a"],
  );
  assert.deepEqual(
    uncoveredNewColumns("-- private column: secret_thing\nALTER TABLE public.talent_profiles ADD COLUMN secret_thing text;"),
    [],
  );
  // A commented-out ALTER is ignored.
  assert.deepEqual(uncoveredNewColumns("-- ALTER TABLE public.talent_profiles ADD COLUMN ghost int;"), []);
});
