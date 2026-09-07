import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  findDuplicateLocalVersions,
  findVersionsTakenByAnotherMigration,
  isCosmeticNameDifference,
  parseMigrationFilename,
  subtractBaseline,
} from "./migration-version-collisions.mjs";

test("a filename splits into version and slug", () => {
  assert.deepEqual(parseMigrationFilename("20260413120000_analytics_internal_tables.sql"), {
    version: "20260413120000",
    slug: "analytics_internal_tables",
  });
});

test("two local files sharing a version are found", () => {
  const dupes = findDuplicateLocalVersions([
    "20261226000011_dispatch_log_bounce_detail.sql",
    "20261226000011_finance_p0_rpc_authorization.sql",
    "20260101000000_alone.sql",
  ]);
  assert.equal(dupes.length, 1);
  assert.equal(dupes[0].version, "20261226000011");
  assert.deepEqual(dupes[0].slugs, ["dispatch_log_bounce_detail", "finance_p0_rpc_authorization"]);
});

test("cosmetic name differences are not collisions", () => {
  // The remote name repeats the version prefix.
  assert.equal(
    isCosmeticNameDifference("20260613213721_drop_legacy_workspace_pages", "drop_legacy_workspace_pages"),
    true,
  );
  // The local file is an MCP placeholder stand-in.
  assert.equal(isCosmeticNameDifference("booking_payouts_ledger", "applied_via_mcp_placeholder"), true);
  assert.equal(
    isCosmeticNameDifference("tenant_social_feed_cache", "tenant_social_feed_cache_applied_via_mcp_placeholder"),
    true,
  );
  assert.equal(isCosmeticNameDifference("same_name", "same_name"), true);
});

test("a version held by a genuinely different migration IS a collision", () => {
  // The real case: this file has never applied and cannot as numbered.
  assert.equal(isCosmeticNameDifference("multilingual_talent_bio", "analytics_internal_tables"), false);
  const found = findVersionsTakenByAnotherMigration(
    ["20260413120000_analytics_internal_tables.sql"],
    new Map([["20260413120000", "multilingual_talent_bio"]]),
  );
  assert.equal(found.length, 1);
  assert.equal(found[0].remoteName, "multilingual_talent_bio");
  assert.equal(found[0].localSlug, "analytics_internal_tables");
});

test("the baseline matches on version AND slug, so swapping the file still fails", () => {
  const baseline = [{ version: "20260413120000", localSlug: "analytics_internal_tables" }];
  const sameFile = [{ version: "20260413120000", localSlug: "analytics_internal_tables" }];
  assert.equal(subtractBaseline(sameFile, baseline).length, 0);

  const differentFileSameVersion = [{ version: "20260413120000", localSlug: "something_else" }];
  assert.equal(
    subtractBaseline(differentFileSameVersion, baseline).length,
    1,
    "a baselined version must not shelter a different file",
  );
});

/**
 * The guard has to FAIL on a new collision, not merely pass today. A guard only
 * ever observed passing is a guard nobody has seen work.
 */
test("the script exits non-zero when a NEW duplicate version appears", () => {
  const root = mkdtempSync(join(tmpdir(), "migguard-"));
  try {
    mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
    mkdirSync(join(root, "web", "scripts"), { recursive: true });
    for (const f of [
      "check-migration-version-collisions.mjs",
      "migration-version-collisions.mjs",
    ]) {
      cpSync(join(import.meta.dirname, f), join(root, "web", "scripts", f));
    }
    writeFileSync(
      join(root, "web", "scripts", "migration-collision-baseline.json"),
      JSON.stringify({ duplicateLocalVersions: [], versionsTakenByAnotherMigration: [] }),
    );
    const dir = join(root, "supabase", "migrations");
    writeFileSync(join(dir, "20270101000000_one.sql"), "-- x");
    writeFileSync(join(dir, "20270101000000_two.sql"), "-- x");

    let exitCode = 0;
    let output = "";
    try {
      output = execFileSync(
        process.execPath,
        [join(root, "web", "scripts", "check-migration-version-collisions.mjs")],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
    } catch (err) {
      exitCode = err.status;
      output = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    }
    assert.equal(exitCode, 1, "a new duplicate version must fail the build");
    assert.match(output, /share a version with another local file/);
    assert.match(output, /20270101000000_one\.sql/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the script exits zero when every version is unique", () => {
  const root = mkdtempSync(join(tmpdir(), "migguard-ok-"));
  try {
    mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
    mkdirSync(join(root, "web", "scripts"), { recursive: true });
    for (const f of [
      "check-migration-version-collisions.mjs",
      "migration-version-collisions.mjs",
    ]) {
      cpSync(join(import.meta.dirname, f), join(root, "web", "scripts", f));
    }
    writeFileSync(
      join(root, "web", "scripts", "migration-collision-baseline.json"),
      JSON.stringify({ duplicateLocalVersions: [], versionsTakenByAnotherMigration: [] }),
    );
    writeFileSync(join(root, "supabase", "migrations", "20270101000000_one.sql"), "-- x");
    const output = execFileSync(
      process.execPath,
      [join(root, "web", "scripts", "check-migration-version-collisions.mjs")],
      { encoding: "utf8" },
    );
    assert.match(output, /local checks clean/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
