// Baseline plan (card 272). Pure planning for "baseline dump + replay the rest".
// Given the migration file listing and BASELINE_VERSION, decide which migrations
// the baseline covers (<= V) and which must be replayed on top (> V).
//
// No database access. NOT checkable offline: whether a migration > V is already
// folded into the dump. Only the CI replay detects that.
//
// CLI (used by .github/workflows/baseline-schema-check.yml):
//   node web/scripts/baseline/baseline-plan.mjs [--supabase-dir supabase] [--list-replay]
// Prints a summary, or with --list-replay one replay file name per line.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export class BaselinePlanError extends Error {}

const MIGRATION_RE = /^(\d{14})_.+\.sql$/;
const VERSION_RE = /^\d{14}$/;

export function parseMigrations(fileNames) {
  const out = [];
  for (const name of fileNames) {
    const m = MIGRATION_RE.exec(name);
    if (m) out.push({ version: m[1], name });
  }
  return out.sort((a, b) =>
    a.version === b.version ? (a.name < b.name ? -1 : 1) : a.version < b.version ? -1 : 1,
  );
}

export function parseBaselineVersion(text) {
  if (typeof text !== "string") throw new BaselinePlanError("BASELINE_VERSION is missing");
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length !== 1) {
    throw new BaselinePlanError(
      `BASELINE_VERSION must be exactly one non-empty line (found ${lines.length})`,
    );
  }
  if (!VERSION_RE.test(lines[0])) {
    throw new BaselinePlanError(`BASELINE_VERSION "${lines[0]}" is not a 14-digit migration version`);
  }
  return lines[0];
}

/**
 * baselineVersionText / baselineSqlBytes are null when the file does not exist.
 * @param {{ migrationFiles: string[], baselineVersionText: string|null,
 *           baselineSqlBytes: number|null }} input
 */
export function planBaseline({ migrationFiles, baselineVersionText, baselineSqlBytes }) {
  const missing = [];
  if (baselineSqlBytes === null || baselineSqlBytes === undefined) {
    missing.push("supabase/baseline/baseline.schema.sql");
  }
  if (baselineVersionText === null || baselineVersionText === undefined) {
    missing.push("supabase/baseline/BASELINE_VERSION");
  }
  if (missing.length) {
    throw new BaselinePlanError(`baseline files missing: ${missing.join(", ")}`);
  }
  if (baselineSqlBytes <= 0) {
    throw new BaselinePlanError("supabase/baseline/baseline.schema.sql is empty");
  }
  const version = parseBaselineVersion(baselineVersionText);
  const migrations = parseMigrations(migrationFiles);
  if (!migrations.some((m) => m.version === version)) {
    throw new BaselinePlanError(
      `BASELINE_VERSION ${version} is not a version in supabase/migrations`,
    );
  }
  const covered = migrations.filter((m) => m.version <= version);
  const replay = migrations.filter((m) => m.version > version);
  const seen = new Set();
  const duplicateVersions = [];
  for (const m of migrations) {
    if (seen.has(m.version) && !duplicateVersions.includes(m.version)) duplicateVersions.push(m.version);
    seen.add(m.version);
  }
  return {
    baselineVersion: version,
    covered,
    replay,
    duplicateVersions,
    // Documented limitation: cannot be verified without a database.
    notCheckableOffline: "whether any migration > V is already folded into the dump",
  };
}

/** Reads the real files. Missing files become null so planBaseline refuses clearly. */
export function loadInputs(supabaseDir) {
  const baselineDir = join(supabaseDir, "baseline");
  const sqlPath = join(baselineDir, "baseline.schema.sql");
  const versionPath = join(baselineDir, "BASELINE_VERSION");
  return {
    migrationFiles: readdirSync(join(supabaseDir, "migrations")),
    baselineSqlBytes: existsSync(sqlPath) ? statSync(sqlPath).size : null,
    baselineVersionText: existsSync(versionPath) ? readFileSync(versionPath, "utf8") : null,
  };
}

function main(argv) {
  const dirIdx = argv.indexOf("--supabase-dir");
  const supabaseDir = resolve(dirIdx >= 0 ? argv[dirIdx + 1] : "supabase");
  try {
    const plan = planBaseline(loadInputs(supabaseDir));
    if (argv.includes("--list-replay")) {
      for (const m of plan.replay) console.log(m.name);
      return 0;
    }
    console.log(`baseline version: ${plan.baselineVersion}`);
    console.log(`covered by baseline (<= V): ${plan.covered.length}`);
    console.log(`replayed on top (> V): ${plan.replay.length}`);
    if (plan.duplicateVersions.length) {
      console.log(`warning: duplicate versions: ${plan.duplicateVersions.join(", ")}`);
    }
    console.log(`not checkable offline: ${plan.notCheckableOffline}`);
    return 0;
  } catch (e) {
    if (e instanceof BaselinePlanError) {
      console.error(`baseline-plan: ${e.message}`);
      return 1;
    }
    throw e;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = main(process.argv.slice(2));
}
