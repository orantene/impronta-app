/**
 * Resource-profile leakage tripwire (Appointments P1).
 *
 * Business workspaces book staff/chairs as talent_profiles with
 * profile_kind='resource'. Those rows must never appear as people: not in
 * Discover, not in the directory, not on /t/, not in sitemaps, not as a
 * claimable login. A later query that forgets the predicate is a catalog leak.
 *
 * This reads source (SQL + TS) rather than hitting the database: the failure
 * mode is a missing filter in a NEW file, which no one live-row test would see
 * until a resource is created.
 *
 * LANE — `npm run test:tenant-isolation`.
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = resolve(HERE, "..", "..");
const WEB_ROOT = resolve(SRC_ROOT, "..");
const REPO_ROOT = resolve(WEB_ROOT, "..");
const MIGRATION = join(
  REPO_ROOT,
  "supabase/migrations/20261215000000_appointments_v1.sql",
);

function readRepo(rel: string): string {
  const full = join(REPO_ROOT, rel);
  assert.ok(existsSync(full), `missing ${rel}`);
  return readFileSync(full, "utf8");
}

function readSrc(rel: string): string {
  const full = join(SRC_ROOT, rel);
  assert.ok(existsSync(full), `missing src/${rel}`);
  return readFileSync(full, "utf8");
}

function hasAppResourceGuard(source: string): boolean {
  return (
    source.includes('.neq("profile_kind", "resource")') ||
    source.includes(".neq('profile_kind', 'resource')") ||
    source.includes('.eq("profile_kind", "person")') ||
    source.includes('.eq("talent_profiles.profile_kind", "person")') ||
    source.includes('profile_kind === "resource"')
  );
}

test("appointments_v1 migration keeps every resource-leakage SQL predicate", () => {
  const sql = readRepo("supabase/migrations/20261215000000_appointments_v1.sql");

  assert.match(
    sql,
    /coalesce\(new\.profile_kind,\s*'person'\)\s*=\s*'resource'/i,
    "ensure_talent_in_platform_hub must skip profile_kind=resource",
  );
  assert.match(
    sql,
    /COALESCE\(tp\.profile_kind,\s*'person'\)\s*=\s*'person'/,
    "talent_compute_publicly_listed must AND-gate profile_kind=person",
  );
  assert.match(
    sql,
    /reason',\s*'resource_profile'/,
    "claim_talent_profile must refuse resource rows",
  );
  assert.match(
    sql,
    /RESOURCE_PROFILE_NOT_CLAIMABLE/,
    "belt trigger must refuse attaching a login to a resource",
  );
  assert.match(
    sql,
    /COALESCE\(tp\.profile_kind,\s*'person'\)\s*=\s*'person'/,
    "talent_discover_index WHERE must exclude resources",
  );
  assert.match(
    sql,
    /talent_holds_firm_no_overlap/,
    "firm-hold gist exclusion must ship with this migration",
  );
  assert.match(
    sql,
    /talent_holds_reap_expired/,
    "lazy expired-hold reap must ship with the gist constraint",
  );
});

test("expire-calendar-holds reaper ships with the gist constraint", () => {
  const cron = readSrc("app/api/cron/expire-calendar-holds/route.ts");
  assert.match(cron, /from\("talent_holds"\)/);
  assert.match(cron, /expires_at/);
  assert.match(cron, /CRON_SECRET/);

  const vercel = readFileSync(join(WEB_ROOT, "vercel.json"), "utf8");
  assert.match(
    vercel,
    /\/api\/cron\/expire-calendar-holds/,
    "vercel.json must schedule expire-calendar-holds; a constraint without a reaper deadlocks slots",
  );
});

const PUBLIC_READS: Array<{ file: string; why: string }> = [
  {
    file: "lib/directory/fetch-directory-page.ts",
    why: "directory listing / count / location taxonomy",
  },
  {
    file: "lib/directory/directory-category-tree.ts",
    why: "category pill counts",
  },
  { file: "app/sitemap.ts", why: "public talent sitemap entries" },
  {
    file: "app/(workspace)/[tenantSlug]/_data-bridge/discover.ts",
    why: "Discover facet counts",
  },
  { file: "app/api/discover/facets/route.ts", why: "Discover facets API" },
  {
    file: "app/api/discover/talent/[id]/route.ts",
    why: "Discover talent detail",
  },
  {
    file: "app/api/discover/talent/[id]/availability/route.ts",
    why: "Discover availability",
  },
  {
    file: "lib/talent-site/published-talent-page.ts",
    why: "published /t/ page loader",
  },
  {
    file: "app/t/[profileCode]/profile-view.tsx",
    why: "public /t/ profile + related cards",
  },
  {
    file: "app/t/[profileCode]/opengraph-image.tsx",
    why: "/t/ Open Graph card",
  },
  { file: "lib/home-data.ts", why: "homepage featured talent" },
  {
    file: "lib/saas/host-context.ts",
    why: "edge /t/ roster 404 must hide resources",
  },
  {
    file: "lib/saas/talent-roster.ts",
    why: "storefront roster id list",
  },
  {
    file: "lib/saas/roster-seat-limit.ts",
    why: "seat count must exclude resource rows",
  },
  {
    file: "app/api/directory/preview/[talentId]/route.ts",
    why: "directory quick-view",
  },
  {
    file: "app/api/directory/talents-by-ids/route.ts",
    why: "directory batch cards",
  },
];

test("every public talent_profiles read listed here filters out resources", () => {
  const missing: string[] = [];
  for (const { file, why } of PUBLIC_READS) {
    const src = readSrc(file);
    if (!hasAppResourceGuard(src)) missing.push(`${file} (${why})`);
  }
  assert.deepEqual(
    missing,
    [],
    `resource profiles would leak from: ${missing.join("; ")}`,
  );
});

test("claim UI maps resource_profile onto the unavailable presentation", () => {
  const src = readSrc("lib/talent/claim-outcome.ts");
  assert.match(src, /"resource_profile"/);
  assert.match(src, /case "resource_profile"/);
});
