/**
 * PR 0b-3: anon may not read talents' private details.
 *
 * The held migration (supabase/migrations/_pending_pm/20261231415200_*) revokes
 * the table-wide SELECT on public.talent_profiles from `anon` and re-grants every
 * column EXCEPT a private set. These static pins keep two things true:
 *
 *   1. The migration text says what the PR body says (negative pins).
 *   2. No code that reads talent_profiles through an ANON-KEY client names a
 *      private column or uses `select("*")`, because either would turn into
 *      "permission denied" on a public page the moment the migration lands.
 *
 * Behaviour (anon really loses the columns, the public list still selects) was
 * validated separately in a rolled-back staging transaction; see the PR body.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const WEB = process.cwd();
const SRC = join(WEB, "src");
const MIGRATION = join(
  WEB,
  "..",
  "supabase",
  "migrations",
  "_pending_pm",
  "20261231415200_talent_profiles_anon_column_grants.sql",
);

const PRIVATE_COLUMNS = [
  "phone",
  "phone_e164",
  "date_of_birth",
  "legal_name",
  "invitation_email",
  "stripe_account_id",
  "gp_recipient_account_id",
  "user_id",
  "ai_search_document",
] as const;

/** Anon-key readers that legitimately name a private column, with the reason. */
const ANON_FILE_ALLOWLIST: Record<string, string> = {
  // Owner-only draft preview: `.eq("user_id", user.id)` runs after
  // `auth.getUser()` succeeded, i.e. as `authenticated`, never as anon.
  "src/app/t/[profileCode]/profile-view.tsx": "owner preview, authenticated session only",
  // Reads user_id through createServiceRoleClient() (`svc`) after auth.getUser();
  // the file also builds an anon client for unrelated public reads.
  "src/lib/reviews/load-reviews.ts": "ownership check on the service-role client",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const rel = (p: string) => relative(WEB, p).split("\\").join("/");

/** Text between the paren that opens at `open` and its match (exclusive). */
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

type ColumnRead = { file: string; where: string; star: boolean; cols: string[] };

/** Every talent_profiles column list (direct select or embed) in one file. */
function readsOf(file: string, src: string): ColumnRead[] {
  const reads: ColumnRead[] = [];
  const constValue = (name: string): string | null => {
    const m = src.match(
      new RegExp(`(?:const|let)\\s+${name}\\b[^=]*=\\s*(\`[\\s\\S]*?\`|"[^"]*"|'[^']*')`),
    );
    return m ? m[1] : null;
  };

  // 1. `.from("talent_profiles") ... .select(<arg>)`
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
    const body = stripNested(text);
    const cols = tokens(body);
    reads.push({ file, where: `L${line}`, star: cols.includes("*"), cols });
  }

  // 2. PostgREST embeds: `talent_profiles ( ... )` / `talent_profiles!fk ( ... )`
  for (const m of src.matchAll(/talent_profiles(?:![\w]+)?\s*\(/g)) {
    const idx = (m.index ?? 0) + m[0].length - 1;
    const body = stripNested(balanced(src, idx));
    const cols = tokens(body);
    const line = src.slice(0, idx).split("\n").length;
    reads.push({ file, where: `L${line} (embed)`, star: cols.includes("*"), cols });
  }
  return reads;
}

const ANON_FILES = walk(SRC).filter((p) => {
  const s = readFileSync(p, "utf8");
  return s.includes("createPublicSupabaseClient") && s.includes("talent_profiles");
});

test("migration revokes table SELECT from anon and re-grants a column list", () => {
  const sql = readFileSync(MIGRATION, "utf8");
  assert.match(sql, /REVOKE SELECT ON public\.talent_profiles FROM anon;/);
  assert.match(sql, /GRANT SELECT \(%s\) ON public\.talent_profiles TO anon/);
  // The grant is built from information_schema minus the private set, so a column
  // the types file does not know yet is still granted.
  assert.match(sql, /information_schema\.columns/);
  for (const c of PRIVATE_COLUMNS) {
    assert.match(sql, new RegExp(`'${c}'`), `private column ${c} must be named`);
  }
  // Exactly the private set is excluded (no silent extra / missing column).
  const notIn = sql.match(/column_name NOT IN \(([\s\S]*?)\)\s*;/)?.[1] ?? "";
  assert.deepEqual(
    [...notIn.matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]).sort(),
    [...PRIVATE_COLUMNS].sort(),
  );
});

test("migration never touches authenticated or service_role grants, and never switches role", () => {
  const sql = readFileSync(MIGRATION, "utf8").replace(/^\s*--.*$/gm, "");
  assert.doesNotMatch(sql, /REVOKE[^;]*\b(authenticated|service_role)\b|REVOKE[^;]*\bFROM\s+PUBLIC\b/);
  assert.doesNotMatch(sql, /GRANT[^;]*\bTO\b[^;]*\b(authenticated|service_role)\b/);
  assert.doesNotMatch(sql, /SET\s+(LOCAL\s+)?ROLE/i);
});

test("migration drops the cross-tenant share-token read policy", () => {
  const sql = readFileSync(MIGRATION, "utf8");
  assert.match(sql, /DROP POLICY IF EXISTS media_folders_public_share_read ON public\.media_folders;/);
  assert.doesNotMatch(sql, /CREATE POLICY[^;]*media_folders_public_share_read/);
});

test("the public share viewer reads media_folders through the service role, not anon", () => {
  const page = readFileSync(join(SRC, "app/share/folder/[token]/page.tsx"), "utf8");
  assert.match(page, /createServiceRoleClient\(\)/);
  assert.doesNotMatch(page, /createPublicSupabaseClient|createSupabaseServerClient|supabase\/server/);
});

test("anon-key readers of talent_profiles never use select(*) or name a private column", () => {
  assert.ok(ANON_FILES.length >= 10, `expected the anon-key reader set, found ${ANON_FILES.length}`);
  const offenders: string[] = [];
  let reads = 0;
  for (const p of ANON_FILES) {
    const f = rel(p);
    if (ANON_FILE_ALLOWLIST[f]) continue;
    for (const r of readsOf(f, readFileSync(p, "utf8"))) {
      reads++;
      if (r.star) offenders.push(`${f} ${r.where}: select("*")`);
      for (const c of r.cols) {
        if ((PRIVATE_COLUMNS as readonly string[]).includes(c)) {
          offenders.push(`${f} ${r.where}: names private column ${c}`);
        }
      }
    }
  }
  assert.ok(reads >= 15, `scanner found only ${reads} reads; it has gone blind`);
  assert.deepEqual(offenders, []);
});

test("the scanner can refuse (self-check)", () => {
  const bad = readsOf(
    "fixture.ts",
    'const a = sb.from("talent_profiles").select("id, phone_e164");\n' +
      'const b = sb.from("talent_profiles").select("*");\n' +
      'const c = sb.from("orders").select("id, talent_profiles!tp ( display_name, user_id )");',
  );
  assert.equal(bad.length, 3);
  assert.ok(bad[0].cols.includes("phone_e164"));
  assert.ok(bad[1].star);
  assert.ok(bad[2].cols.includes("user_id"));
});

test("directory age filter never reads date_of_birth through the caller's client", () => {
  const src = readFileSync(join(SRC, "lib/directory/fetch-directory-page.ts"), "utf8");
  const helperStart = src.indexOf("async function resolveAgeBandTalentIds(");
  const helperEnd = src.indexOf("async function fetchDirectoryWindow(");
  assert.ok(helperStart > 0 && helperEnd > helperStart);
  const outside = src.slice(0, helperStart) + src.slice(helperEnd);
  assert.doesNotMatch(outside, /"date_of_birth"/, "date_of_birth must only appear in the service-role helper");
  const helper = src.slice(helperStart, helperEnd);
  assert.match(helper, /createServiceRoleClient\(\) \?\? fallback/);
});

test("server-side private-column readers on public surfaces stay on the service role", () => {
  const cases: Array<[string, RegExp]> = [
    ["src/app/%5Ftalent-site/TalentSiteMessagesDock.tsx", /const admin = createServiceRoleClient\(\);/],
    ["src/lib/talent-site/server/load-starter-data.ts", /const trusted = createServiceRoleClient\(\) \?\? supabase;/],
    ["src/lib/reviews/load-reviews.ts", /const svc = createServiceRoleClient\(\);/],
  ];
  for (const [file, re] of cases) {
    assert.match(readFileSync(join(WEB, file), "utf8"), re, file);
  }
});
