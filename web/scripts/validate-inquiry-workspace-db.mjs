/**
 * Runs supabase/scripts/validate_inquiry_workspace_db.sql against Postgres.
 * Loads env from cwd (use `node --env-file=.env.local`).
 *
 * Connection string: DATABASE_URL, or DIRECT_URL, or SUPABASE_DB_URL (first set wins).
 *
 * Uses `psql` when available; otherwise runs the three checks with the `pg` package
 * (so you do not need Homebrew libpq / psql on PATH).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const databaseUrl =
  (process.env.DATABASE_URL ?? "").trim() ||
  (process.env.DIRECT_URL ?? "").trim() ||
  (process.env.SUPABASE_DB_URL ?? "").trim();

if (!databaseUrl) {
  console.error(
    "validate-inquiry-workspace-db: No DATABASE_URL, DIRECT_URL, or SUPABASE_DB_URL in the environment.\n" +
      "Add one to web/.env.local (Postgres connection string), then:\n" +
      "  npm run validate:inquiry-workspace-db --prefix web",
  );
  process.exit(2);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..", "..");
const sqlFile = join(repoRoot, "supabase", "scripts", "validate_inquiry_workspace_db.sql");

if (!existsSync(sqlFile)) {
  console.error("validate-inquiry-workspace-db: SQL file not found:", sqlFile);
  process.exit(2);
}

/**
 * Fail fast with clear messages (no secrets logged). Returns false → caller should exit(2).
 */
function inspectDatabaseUrlBeforeConnect(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    console.error(
      "validate-inquiry-workspace-db: DATABASE_URL is not a valid URL.\n" +
        "Expected: postgresql://USER:PASSWORD@HOST:PORT/DATABASE?params\n" +
        "If the password has @, #, :, /, or ?, it must be percent-encoded in the URI.",
    );
    return false;
  }
  const scheme = u.protocol.replace(":", "");
  if (scheme !== "postgres" && scheme !== "postgresql") {
    console.error(`validate-inquiry-workspace-db: expected postgresql://, got ${scheme}://`);
    return false;
  }

  const user = decodeURIComponent(u.username || "");
  let pass = "";
  try {
    pass = decodeURIComponent(u.password || "");
  } catch {
    console.error(
      "validate-inquiry-workspace-db: Password in DATABASE_URL is not valid percent-encoding.\n" +
        "Use Supabase’s “Copy” on the connection string after setting the DB password, or encode special characters.",
    );
    return false;
  }

  const host = u.hostname;
  const port = u.port || "5432";

  if (!pass) {
    console.error(
      `validate-inquiry-workspace-db: No password in DATABASE_URL (nothing between user: and @).\n` +
        `  Parsed target: ${user || "(missing user)"} @ ${host}:${port}`,
    );
    return false;
  }

  if (/\[YOUR-PASSWORD\]/i.test(raw) || /\bYOUR-PASSWORD\b/i.test(raw)) {
    console.error(
      "validate-inquiry-workspace-db: DATABASE_URL still contains the placeholder [YOUR-PASSWORD] / YOUR-PASSWORD.\n" +
        "Replace it with the real database password from Supabase → Project Settings → Database.",
    );
    return false;
  }

  if (/pooler\.supabase\.com$/i.test(host) && user === "postgres") {
    console.error(
      `validate-inquiry-workspace-db: Pooler host (${host}) requires user postgres.<project-ref>, not "postgres".\n` +
        `Copy the Session or Transaction pooler URI from the dashboard (same line, including user name).\n` +
        `  Parsed target: ${user} @ ${host}:${port}`,
    );
    return false;
  }

  if (process.env.VALIDATE_DB_DEBUG === "1") {
    console.error(
      `validate-inquiry-workspace-db: DEBUG connecting as ${user} @ ${host}:${port} (password length ${pass.length})`,
    );
  }

  const siteRef = extractSiteProjectRef();
  const dbRef = extractDbProjectRef(u);
  if (siteRef && dbRef && siteRef !== dbRef) {
    console.error(
      `validate-inquiry-workspace-db: Supabase project mismatch.\n` +
        `  NEXT_PUBLIC_SUPABASE_URL → project ref "${siteRef}"\n` +
        `  DATABASE_URL → project ref "${dbRef}"\n` +
        `  Use the Database connection string from the same project as NEXT_PUBLIC_SUPABASE_URL.`,
    );
    return false;
  }

  return true;
}

/** Project ref from db.<ref>.supabase.co or pooler user postgres.<ref>. */
function extractDbProjectRef(u) {
  try {
    const host = u.hostname;
    const dm = /^db\.([^.]+)\.supabase\.co$/i.exec(host);
    if (dm) return dm[1];
    if (/pooler\.supabase\.com$/i.test(host)) {
      const user = decodeURIComponent(u.username || "");
      const um = /^postgres\.(.+)$/.exec(user);
      if (um) return um[1];
    }
  } catch {
    /* ignore */
  }
  return null;
}

function extractSiteProjectRef() {
  const site = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!site) return null;
  try {
    const su = new URL(site);
    const m = /^([^.]+)\.supabase\.co$/i.exec(su.hostname);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Unquoted # in .env often truncates the value at # (comment). */
function warnEnvFileUnquotedHashBeforeAt() {
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  let text;
  try {
    text = readFileSync(p, "utf8");
  } catch {
    return;
  }
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    if (line.slice(0, eq).trim() !== "DATABASE_URL") continue;
    let val = line.slice(eq + 1).trim();
    const q = val[0];
    if (q === '"' || q === "'") continue;
    const at = val.indexOf("@");
    const hash = val.indexOf("#");
    if (hash >= 0 && at >= 0 && hash < at) {
      console.error(
        `validate-inquiry-workspace-db: In .env.local, DATABASE_URL has "#" before "@" but the value is not quoted.\n` +
          `  Many parsers treat # as a comment, so only part of the URL is loaded (wrong password).\n` +
          `  Use: DATABASE_URL="postgresql://postgres:...@db...."  (double quotes around the full URL)\n`,
      );
    }
    break;
  }
}

/** One-line summary to compare with Supabase dashboard (no password printed). */
function printConnectionTarget(urlString) {
  try {
    const u = new URL(urlString);
    const user = decodeURIComponent(u.username || "");
    const host = u.hostname;
    const port = u.port || "5432";
    const pw = u.password ? decodeURIComponent(u.password) : "";
    console.error(
      `  This attempt used: user "${user}" @ ${host}:${port} (password length ${pw.length}). ` +
        `Confirm the DB password was set for this same project in Supabase.`,
    );
  } catch {
    /* ignore */
  }
}

function psqlAvailable() {
  const r = spawnSync("psql", ["--version"], { encoding: "utf8" });
  return !r.error && r.status === 0;
}

function runWithPsql() {
  return spawnSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", sqlFile], {
    stdio: "inherit",
    env: process.env,
  });
}

/** Split validation SQL into the three numbered SELECT statements (strip comment-only lines). */
function extractThreeChecks(sqlText) {
  const parts = sqlText.split(/\n(?=-- [123]\))/);
  const checks = [];
  for (let i = 1; i < parts.length; i++) {
    const sql = parts[i]
      .split("\n")
      .filter((line) => !/^\s*--/.test(line))
      .join("\n")
      .trim();
    if (sql) checks.push(sql);
  }
  if (checks.length !== 3) {
    throw new Error(
      `Expected 3 checks after splitting ${sqlFile}, got ${checks.length}. Update the splitter or the SQL file layout.`,
    );
  }
  return checks;
}

/**
 * Node's TLS often rejects Supabase certs ("self-signed certificate in certificate chain").
 * Pooler: *.supabase.com — Direct DB: *.supabase.co (both must be handled).
 * This script is local-only validation — relax verification for Supabase hosts only.
 * Also sets uselibpqcompat=true so sslmode=require matches libpq semantics and avoids pg v8 warnings.
 */
function pgClientOptions(connectionString) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    return { connectionString };
  }
  const host = url.hostname;
  const supabase = /\.supabase\.com$/i.test(host) || /\.supabase\.co$/i.test(host);
  if (!supabase) {
    return { connectionString };
  }
  if (!url.searchParams.has("uselibpqcompat")) {
    url.searchParams.set("uselibpqcompat", "true");
  }
  return {
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: false },
  };
}

/** Extra context when `pg` / Postgres rejects the connection (no secrets printed). */
function printDbConnectHints(err, connectionString) {
  const msg = err instanceof Error ? err.message : String(err);
  const code =
    err && typeof err === "object" && err !== null && "code" in err ? String(Reflect.get(err, "code") ?? "") : "";
  const blob = `${msg} ${code}`;
  if (/self-signed certificate|certificate chain|UNABLE_TO_VERIFY_LEAF_SIGNATURE|DEPTH_ZERO_SELF_SIGNED/i.test(blob)) {
    console.error(`
TLS troubleshooting:

  • If this is Supabase, re-run after pulling the latest validate script (it sets ssl for *.supabase.com).
  • Non-Supabase hosts: add the right CA to your trust store, or set NODE_EXTRA_CA_CERTS to a PEM bundle.
`);
    return;
  }
  if (!/password authentication failed|28P01|authentication failed|no pg_hba\.conf|ECONNREFUSED|ENOTFOUND/i.test(blob)) {
    return;
  }

  let poolerUserMismatch = "";
  let isDirectDb = false;
  try {
    const u = new URL(connectionString);
    const host = u.hostname;
    const user = decodeURIComponent(u.username || "");
    isDirectDb = /^db\.[^.]+\.supabase\.co$/i.test(host) && user === "postgres";
    if (/pooler\.supabase\.com$/i.test(host) && user === "postgres") {
      poolerUserMismatch = `
  ⚠ Pooler host detected, but username is "postgres". For Transaction pooler, the user must be
     postgres.<project-ref> (exactly as in Dashboard → Database → Connection string). The direct
     DB user "postgres" belongs with host db.<ref>.supabase.co:5432 — do not mix with …pooler…:6543.
`;
    }
  } catch {
    /* ignore */
  }

  if (isDirectDb) {
    console.error(`
Connection troubleshooting (you are already on Direct: db.<ref>.supabase.co, user postgres):

  • Postgres rejected the password. That is almost always: wrong password in the URI, or .env
    truncated the line (e.g. unquoted "#" in the password).

  • Fix: Dashboard → Project Settings → Database → reset database password → paste the new password
    into the connection string template → Copy the full URI → put it in web/.env.local as:
      DATABASE_URL="postgresql://postgres:...@db....supabase.co:5432/postgres?sslmode=require"
    (double quotes around the whole value if the password has #, $, or spaces.)

  • Re-run: npm run validate:inquiry-workspace-db --prefix web
`);
    printEnvPasswordTips();
    printConnectionTarget(connectionString);
    console.error(`
  • Last resort: Supabase → SQL Editor — run the three SELECT blocks in
      supabase/scripts/validate_inquiry_workspace_db.sql
    (no DATABASE_URL needed).
`);
    return;
  }

  console.error(`
Connection troubleshooting (DATABASE_URL / DIRECT_URL / SUPABASE_DB_URL):

  • Password authentication failed: the database password or username in the URI does not match
    this server (the error text may say "user postgres" even when your URI user is different).
${poolerUserMismatch}
  • Supabase: Dashboard → Project Settings → Database
    – Open the connection string for the mode you want and copy the full URI in one piece:
      Direct → user postgres, host db.<project-ref>.supabase.co, port 5432
      Session pooler → user postgres.<project-ref>, host …pooler.supabase.com, port 5432 (typical)
      Transaction pooler → user postgres.<project-ref>, …pooler…, port often 6543
    – Replace [YOUR-PASSWORD] with the real database password (never leave the placeholder).
      Reset the database password on that screen if needed, then copy again. Anon / service_role
      keys are not the DB password.
    – Special characters in the password must be URL-encoded inside the URI (safest: use “Copy” from
      the dashboard after setting the password).

  • After fixing DATABASE_URL, run: npm run validate:inquiry-workspace-db --prefix web

  • If the password is correct but pooler still fails: try Direct (same DB password, user postgres):
`);
  suggestDirectUriIfPooler(connectionString);
  printEnvPasswordTips();
  printConnectionTarget(connectionString);
  console.error(`
  • Last resort: open Supabase → SQL Editor, paste the three SELECT blocks from:
      supabase/scripts/validate_inquiry_workspace_db.sql
    and confirm each returns 0 rows (no Node / DATABASE_URL needed).
`);
}

/** After pooler auth failure: suggest db.<ref>.supabase.co — project ref from postgres.<ref> user. */
function suggestDirectUriIfPooler(connectionString) {
  try {
    const u = new URL(connectionString);
    const host = u.hostname;
    const user = decodeURIComponent(u.username || "");
    if (!/pooler\.supabase\.com$/i.test(host)) return;
    const m = /^postgres\.(.+)$/.exec(user);
    if (!m) return;
    const ref = m[1];
    console.error(`    DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.${ref}.supabase.co:5432/postgres?sslmode=require
    (Replace YOUR_PASSWORD with the same database password from Dashboard → Database — not the API keys.)
`);
  } catch {
    /* ignore */
  }
}

function printEnvPasswordTips() {
  console.error(
    "  • .env.local: keep DATABASE_URL on one line. If the password has $, #, or @, percent-encode them in the URI\n" +
      "    or type the password in the dashboard field and use “Copy” on the full connection string.\n",
  );
}

async function runWithPg() {
  const pg = (await import("pg")).default;
  const checks = extractThreeChecks(readFileSync(sqlFile, "utf8"));
  const client = new pg.Client(pgClientOptions(databaseUrl));
  await client.connect();
  let hadRows = false;
  try {
    for (let i = 0; i < checks.length; i++) {
      const label = `Check ${i + 1}/3`;
      console.error(`\n--- ${label} ---`);
      const res = await client.query(checks[i]);
      const n = res.rowCount ?? res.rows?.length ?? 0;
      if (n === 0) {
        console.error(`${label}: OK (0 rows)\n`);
      } else {
        hadRows = true;
        console.error(`${label}: ${n} row(s) — fix before production\n`);
        console.table(res.rows);
      }
    }
  } finally {
    await client.end().catch(() => {});
  }
  return hadRows;
}

async function main() {
  warnEnvFileUnquotedHashBeforeAt();
  if (!inspectDatabaseUrlBeforeConnect(databaseUrl)) {
    process.exit(2);
  }

  if (psqlAvailable()) {
    const r = runWithPsql();
    if (r.error) {
      console.error("validate-inquiry-workspace-db: failed to run psql:", r.error.message);
      process.exit(2);
    }
    process.exit(typeof r.status === "number" ? r.status : 1);
  }

  console.error("validate-inquiry-workspace-db: psql not on PATH — using Node + pg instead.\n");
  try {
    const hadRows = await runWithPg();
    process.exit(hadRows ? 1 : 0);
  } catch (e) {
    console.error("validate-inquiry-workspace-db:", e instanceof Error ? e.message : e);
    printDbConnectHints(e, databaseUrl);
    process.exit(2);
  }
}

void main();
