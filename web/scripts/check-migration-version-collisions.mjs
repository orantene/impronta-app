#!/usr/bin/env node
/**
 * Guard: a migration file whose version is already taken never runs.
 *
 * TWO CHECKS, DELIBERATELY SPLIT BY WHAT THEY NEED.
 *
 *   local  (default, no credentials)  two local files sharing one version.
 *                                     Safe in CI, so it IS in the `ci` chain.
 *   remote (--remote, service role)   a local file whose version is recorded
 *                                     remotely under ANOTHER migration's name.
 *                                     That file has never applied and cannot as
 *                                     numbered; `db:check` still reports it as
 *                                     applied because it compares the version
 *                                     prefix alone. The service role never
 *                                     enters CI, so this half lives behind
 *                                     `npm run manual:migration-collisions`.
 *
 * WITH --remote, missing credentials are a HARD FAILURE, never a skip. A guard
 * that goes green because it could not read anything is measuring nothing.
 *
 * The baseline in `migration-collision-baseline.json` holds the collisions that
 * already existed when this guard was written, so it does not redden main on
 * its own merge. Entries are matched on version AND local slug, so replacing a
 * baselined file with a different one still fails. Shrinking the baseline is
 * the point; it is never to be grown to make a build pass.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  findDuplicateLocalVersions,
  findVersionsTakenByAnotherMigration,
  subtractBaseline,
} from "./migration-version-collisions.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "supabase", "migrations");
const BASELINE_PATH = join(HERE, "migration-collision-baseline.json");

const REMOTE = process.argv.includes("--remote");

const filenames = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));

let failed = false;

// ── local: two files, one version ──────────────────────────────────────────
const duplicates = subtractBaseline(
  findDuplicateLocalVersions(filenames).flatMap((d) =>
    d.slugs.map((slug) => ({ version: d.version, localSlug: slug })),
  ),
  baseline.duplicateLocalVersions ?? [],
);
if (duplicates.length > 0) {
  failed = true;
  console.error(
    `\n[migration-collisions] ${duplicates.length} file(s) share a version with another local file:\n`,
  );
  for (const d of duplicates) console.error(`  • ${d.version}_${d.localSlug}.sql`);
  console.error(
    "\nTwo files cannot hold one version: the push applies one and dies on the other\n" +
      "with a duplicate-key error, AFTER applying everything before it. Renumber one\n" +
      "with a fresh `date -u +%Y%m%d%H%M%S`, and READ IT FIRST — a file that has never\n" +
      "run may contain policies or grants that become live the moment it does.\n",
  );
}

// ── remote: version recorded under another migration's name ────────────────
if (REMOTE) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "[migration-collisions] FATAL: --remote needs NEXT_PUBLIC_SUPABASE_URL and\n" +
        "SUPABASE_SERVICE_ROLE_KEY. Refusing to report green on an unread database.",
    );
    process.exit(1);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase.rpc("list_applied_migrations_named");
  if (error) {
    console.error(
      "[migration-collisions] FATAL: list_applied_migrations_named failed:",
      error.message,
    );
    console.error(
      "Has 20261230000100_list_applied_migrations_named.sql been applied to this project?",
    );
    process.exit(1);
  }
  const rows = data ?? [];
  if (rows.length === 0) {
    console.error(
      "[migration-collisions] FATAL: the migration ledger came back EMPTY. That is a\n" +
        "failed read, not a clean project. Refusing to report green.",
    );
    process.exit(1);
  }

  const remoteByVersion = new Map(
    rows.map((r) => [String(r.version), String(r.name ?? "")]),
  );
  const taken = subtractBaseline(
    findVersionsTakenByAnotherMigration(filenames, remoteByVersion),
    baseline.versionsTakenByAnotherMigration ?? [],
  );

  if (taken.length > 0) {
    failed = true;
    console.error(
      `\n[migration-collisions] ${taken.length} file(s) will NEVER apply — their version is\n` +
        `recorded remotely under a different migration:\n`,
    );
    for (const t of taken) {
      console.error(`  • ${t.filename}`);
      console.error(`      version ${t.version} is recorded as "${t.remoteName}"`);
    }
    console.error(
      "\n`db:check` reports these as applied because it compares the version prefix\n" +
        "only. Verify whether the objects exist on production, then renumber with a\n" +
        "fresh timestamp so the file actually runs.\n",
    );
  }

  console.log(
    `[migration-collisions] remote ledger read: ${rows.length} recorded migrations`,
  );
}

if (failed) process.exit(1);
console.log(
  `[migration-collisions] OK — ${filenames.length} local migrations, ` +
    `${REMOTE ? "local + remote" : "local"} checks clean` +
    `${REMOTE ? "" : " (run `npm run manual:migration-collisions` for the remote half)"}`,
);
