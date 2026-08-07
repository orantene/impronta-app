import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { existsSync } from "node:fs";

import { buildFreeStarterEntries } from "./onboard-starter-content";
import { getSectionType } from "@/lib/site-admin/sections/registry";
import { getLibraryDefault } from "@/lib/site-admin/sections/shared/default-content";
import {
  FREE_STARTER_PROFILE_CAP,
  FREE_STARTER_SEAT_HEADROOM,
  FREE_STARTER_SEED_TARGET,
  resolveCasExpectedVersion,
  resolveFreeStarterRosterSeedCount,
  shouldSkipFreeStarterHomepageSeed,
} from "./onboard-starter-content-policy";

// ── B2: the starter seed must leave the owner seats to use ────────────────
// A brand-new Free workspace is provisioned with talent_seat_limit = 5. Seeding
// 5 demo profiles put it at 100% of its cap, so onboarding step 1 ("Add your
// first talent") failed immediately with "reached the Free plan limit (5
// profiles)". The seed now reserves FREE_STARTER_SEAT_HEADROOM seats.

test("free starter seed leaves headroom under the 5-seat Free cap", () => {
  assert.equal(
    resolveFreeStarterRosterSeedCount({
      planTier: "free",
      seatLimit: 5,
      totalRosterCount: 0,
      publicVisibleCount: 0,
    }),
    FREE_STARTER_SEED_TARGET,
  );
  assert.equal(FREE_STARTER_SEED_TARGET, 3);
  assert.ok(
    FREE_STARTER_SEED_TARGET + FREE_STARTER_SEAT_HEADROOM <=
      FREE_STARTER_PROFILE_CAP,
    "seed target + reserved headroom must fit inside the Free profile cap",
  );
});

test("free starter seed never consumes the whole seat allotment", () => {
  for (const seatLimit of [1, 2, 3, 4, 5, 5000]) {
    const seeded = resolveFreeStarterRosterSeedCount({
      planTier: "free",
      seatLimit,
      totalRosterCount: 0,
      publicVisibleCount: 0,
    });
    const cap = Math.min(seatLimit, FREE_STARTER_PROFILE_CAP);
    assert.ok(
      seeded <= Math.max(0, cap - FREE_STARTER_SEAT_HEADROOM),
      `seatLimit ${seatLimit}: seeded ${seeded} left no headroom under cap ${cap}`,
    );
    assert.ok(seeded >= 0, `seatLimit ${seatLimit}: negative seed count`);
  }
});

test("free starter seed skips entirely when the cap is too small for headroom", () => {
  assert.equal(
    resolveFreeStarterRosterSeedCount({
      planTier: "free",
      seatLimit: 2,
      totalRosterCount: 0,
      publicVisibleCount: 0,
    }),
    0,
  );
  assert.equal(
    resolveFreeStarterRosterSeedCount({
      planTier: "free",
      seatLimit: 1,
      totalRosterCount: 0,
      publicVisibleCount: 0,
    }),
    0,
  );
});

test("resolveFreeStarterRosterSeedCount falls back to the Free cap when the seat limit is null", () => {
  assert.equal(
    resolveFreeStarterRosterSeedCount({
      planTier: "free",
      seatLimit: null,
      totalRosterCount: 0,
      publicVisibleCount: 0,
    }),
    FREE_STARTER_SEED_TARGET,
  );
});

test("resolveFreeStarterRosterSeedCount does not seed when roster already exists", () => {
  assert.equal(
    resolveFreeStarterRosterSeedCount({
      planTier: "free",
      seatLimit: 5,
      totalRosterCount: 1,
      publicVisibleCount: 0,
    }),
    0,
  );
  assert.equal(
    resolveFreeStarterRosterSeedCount({
      planTier: "free",
      seatLimit: 5,
      totalRosterCount: 0,
      publicVisibleCount: 1,
    }),
    0,
  );
});

test("resolveFreeStarterRosterSeedCount does not seed on non-free plans", () => {
  assert.equal(
    resolveFreeStarterRosterSeedCount({
      planTier: "studio",
      seatLimit: null,
      totalRosterCount: 0,
      publicVisibleCount: 0,
    }),
    0,
  );
  assert.equal(
    resolveFreeStarterRosterSeedCount({
      planTier: "free",
      seatLimit: 0,
      totalRosterCount: 0,
      publicVisibleCount: 0,
    }),
    0,
  );
});

// ── B1: idempotence gate ──────────────────────────────────────────────────
// The signup trampoline re-enters the seed on later logins. A second run must
// not duplicate sections or roster rows.

test("shouldSkipFreeStarterHomepageSeed lets a virgin draft homepage seed", () => {
  assert.equal(
    shouldSkipFreeStarterHomepageSeed({
      pageStatus: "draft",
      draftSlotCount: 0,
      liveSlotCount: 0,
    }),
    false,
  );
});

test("shouldSkipFreeStarterHomepageSeed is idempotent on re-entry", () => {
  // Already published by the first run.
  assert.equal(
    shouldSkipFreeStarterHomepageSeed({
      pageStatus: "published",
      draftSlotCount: 4,
      liveSlotCount: 4,
    }),
    true,
  );
  // First run saved a draft but died before publishing — sections exist, so a
  // re-run must not append a second set.
  assert.equal(
    shouldSkipFreeStarterHomepageSeed({
      pageStatus: "draft",
      draftSlotCount: 4,
      liveSlotCount: 0,
    }),
    true,
  );
  // Operator has live content but no draft rows.
  assert.equal(
    shouldSkipFreeStarterHomepageSeed({
      pageStatus: "draft",
      draftSlotCount: 0,
      liveSlotCount: 2,
    }),
    true,
  );
});

// ── B1: CAS version resolution ────────────────────────────────────────────
// Every CAS re-reads the version right before the write; a failed read falls
// back to the version we hold instead of hard-failing.

test("resolveCasExpectedVersion prefers the freshly-read version", () => {
  assert.equal(
    resolveCasExpectedVersion({ freshVersion: 2, fallbackVersion: 1 }),
    2,
  );
  assert.equal(
    resolveCasExpectedVersion({ freshVersion: 0, fallbackVersion: 7 }),
    0,
  );
});

test("resolveCasExpectedVersion falls back when the re-read is unavailable", () => {
  assert.equal(
    resolveCasExpectedVersion({ freshVersion: null, fallbackVersion: 1 }),
    1,
  );
  assert.equal(
    resolveCasExpectedVersion({ freshVersion: Number.NaN, fallbackVersion: 3 }),
    3,
  );
  assert.equal(
    resolveCasExpectedVersion({ freshVersion: -1, fallbackVersion: 4 }),
    4,
  );
});

// ── B1: the "no re-read" contract, guarded at the source level ────────────
// `onboardStarterContent` INSERTs the cms_pages row via `ensureHomepageRow` and
// then used to RE-READ it through `loadHomepageForStaff` over a second
// PostgREST round-trip. That read-after-write returned null on 4/4 observed
// self-serve signups → HOME_NOT_FOUND → every new workspace shipped with a
// draft, section-less homepage. Source-text guard (not a render/DB test) so it
// stays dependency-free in the capabilities lane.

const here = dirname(fileURLToPath(import.meta.url));
const seedSrc = readFileSync(join(here, "onboard-starter-content.ts"), "utf8");
/** Content definitions split out to honor the 800-line cap. */
const entriesSrc = readFileSync(
  join(here, "onboard-starter-content-entries.ts"),
  "utf8",
);
const scaffoldSrc = readFileSync(
  join(here, "..", "..", "saas", "workspace-signup.server.ts"),
  "utf8",
);
const adminClientSrc = readFileSync(
  join(here, "..", "..", "supabase", "admin.ts"),
  "utf8",
);

test("starter seed never re-reads the homepage row it just ensured", () => {
  assert.ok(
    !/loadHomepageForStaff\s*[(,]/.test(seedSrc),
    "onboard-starter-content.ts must not call loadHomepageForStaff — the row " +
      "from ensureHomepageRow is passed directly into seedFreeStarterHomepage",
  );
  assert.ok(
    !/["']HOME_NOT_FOUND["']/.test(seedSrc),
    "the HOME_NOT_FOUND bail-out must be gone once the row is threaded through",
  );
});

test("starter seed threads the ensured row into the free-starter seeder", () => {
  assert.ok(
    /page:\s*\{\s*\n\s*id:\s*ensured\.data\.id/.test(seedSrc),
    "seedFreeStarterHomepage must receive ensured.data as its `page` prop",
  );
});

// ── B1 ROOT CAUSE: per-render fetch memoization ───────────────────────────
// The trampoline runs inside a Server Component render, where Next memoizes
// identical fetch GETs for the whole render. `ensureHomepageRow` probes the
// canonical homepage URL (empty → memoized), INSERTs, and then every later read
// of that same URL — the seeder's, and the CAS reads inside
// saveHomepageDraftComposition / publishHomepage — was served the stale
// pre-INSERT body. That is HOME_NOT_FOUND and the VERSION_CONFLICT retry, one
// cause. The scaffold must therefore use a memoization-free client.

test("the signup scaffold reads through a memoization-free service client", () => {
  assert.ok(
    /const admin = createUncachedServiceRoleClient\(\)/.test(scaffoldSrc),
    "ensureWorkspaceScaffold must NOT use the memoized createServiceRoleClient — " +
      "its starter seed is a read-after-write inside a Server Component render",
  );
});

test("the uncached client opts out of memoization on every layer", () => {
  assert.ok(
    /export function createUncachedServiceRoleClient/.test(adminClientSrc),
    "admin.ts must export createUncachedServiceRoleClient",
  );
  for (const optOut of [
    'cache: "no-store"', // Data Cache
    "new AbortController().signal", // React/Next request memoization
    "x-tulala-read-after-write", // unique cache key per request
  ]) {
    assert.ok(
      adminClientSrc.includes(optOut),
      `createUncachedServiceRoleClient must keep the '${optOut}' opt-out — ` +
        "read-after-write correctness must not rest on one framework internal",
    );
  }
});

test("starter roster seeds attach the role with a legal relationship_type", () => {
  assert.ok(
    /relationship_type: "primary_role"/.test(seedSrc),
    "talent_type terms only accept primary_role/secondary_role; the column " +
      "default ('attribute') is rejected by the DB validator, which silently " +
      "left every seeded profile with no role at all",
  );
});

// ── Wave 7: Free starter must look like a real premium site ───────────────
// Owner verdict on the previous seed: "looks like disaster... not a site or
// marketing page". Root causes: zero imagery (black tiles, blank cards, gray
// hero), template-describing meta-copy, and no published theme (black-on-black
// CTA). These tests pin the fixed contract.

test("free starter entries parse clean against each section's registry schema", () => {
  const entries = buildFreeStarterEntries("Vera Atelier");
  assert.equal(entries.length, 4);
  for (const entry of entries) {
    const registry = getSectionType(entry.sectionTypeKey);
    assert.ok(registry, `unregistered section type ${entry.sectionTypeKey}`);
    const defaults = getLibraryDefault(entry.sectionTypeKey);
    const schema = registry.schemasByVersion[registry.currentVersion];
    assert.ok(schema, `no schema for ${entry.sectionTypeKey} current version`);
    const parsed = schema.safeParse({
      ...defaults.props,
      ...(entry.propsOverride ?? {}),
    });
    assert.ok(
      parsed.success,
      `${entry.sectionTypeKey} seed props failed schema: ${
        parsed.success ? "" : JSON.stringify(parsed.error.issues)
      }`,
    );
  }
});

test("free starter seeds real imagery into hero, tiles, and final CTA", () => {
  const entries = buildFreeStarterEntries(null);
  const byType = new Map(
    entries.map((e) => [e.sectionTypeKey, e.propsOverride ?? {}]),
  );

  const hero = byType.get("hero") as {
    slides?: Array<{ backgroundImageUrl?: string }>;
  };
  assert.ok(
    hero.slides?.[0]?.backgroundImageUrl?.startsWith("/"),
    "hero must ship a root-relative background image (host-agnostic)",
  );

  const grid = byType.get("category_grid") as {
    items?: Array<{ imageUrl?: string }>;
  };
  assert.ok(grid.items && grid.items.length >= 4, "expected 4 service tiles");
  for (const item of grid.items ?? []) {
    assert.ok(
      item.imageUrl?.startsWith("/"),
      "every service tile needs an editorial image (no black placeholder tiles)",
    );
  }

  const cta = byType.get("cta_banner") as { backgroundImageUrl?: string };
  assert.ok(
    cta.backgroundImageUrl?.startsWith("/"),
    "final CTA banner needs a lifestyle background image",
  );
});

test("every image path referenced by the starter seed exists in web/public", () => {
  const paths = new Set<string>();
  for (const match of (seedSrc + entriesSrc).matchAll(
    /["'](\/(?:talent-templates|marketing)\/[^"']+\.(?:jpg|jpeg|png|webp))["']/g,
  )) {
    paths.add(match[1]!);
  }
  assert.ok(
    paths.size >= 10,
    `expected >=10 seeded image refs, found ${paths.size}`,
  );
  for (const p of paths) {
    assert.ok(
      existsSync(
        join(here, "..", "..", "..", "..", "public", ...p.split("/").filter(Boolean)),
      ),
      `seeded image missing from web/public: ${p}`,
    );
  }
});

test("free starter copy is a business homepage, not template documentation", () => {
  const entries = buildFreeStarterEntries("Vera Atelier");
  const allText = JSON.stringify(entries);
  assert.ok(
    !allText.includes("Your studio, live in one page"),
    "meta-copy hero survived",
  );
  assert.ok(
    !allText.includes("This section auto-loads"),
    "meta-copy intro survived",
  );
  assert.ok(!allText.includes("—"), "no em dashes in user-facing seeded copy");
  assert.ok(
    allText.includes("Vera Atelier"),
    "hero copy must use the workspace display name",
  );
  // Free tier has no /directory page; every seeded link must resolve.
  assert.ok(
    !allText.includes("/directory"),
    "seeded CTA links to a page Free tenants do not have",
  );
});

test("seeded roster profiles get approved demo headshots", () => {
  assert.ok(
    /variant_kind:\s*"card"/.test(seedSrc) &&
      /approval_state:\s*"approved"/.test(seedSrc),
    "seed must insert an approved card media_assets row per demo profile",
  );
  assert.ok(
    /portraitPath/.test(entriesSrc),
    "each talent seed template must carry a portraitPath",
  );
});

test("the starter seed publishes the classic theme for untouched tenants", () => {
  assert.ok(
    /FREE_STARTER_THEME_PRESET_SLUG = "classic"/.test(seedSrc),
    "seed must publish the same preset as the edit-mode Free Quickstart",
  );
  assert.ok(
    /publishStarterThemeIfUnset\(\{/.test(seedSrc),
    "theme publish must be wired into the free-starter homepage seed",
  );
});

test("both starter-seed CAS writes re-read the version first", () => {
  const casCalls = seedSrc.match(/resolveCasExpectedVersion\(/g) ?? [];
  assert.equal(
    casCalls.length,
    4,
    "expected exactly four CAS sites (starter-kit save + publish, section-fallback save + publish) to re-read the version",
  );
  assert.ok(
    /expectedVersion:\s*saveExpectedVersion/.test(seedSrc),
    "the draft-save CAS must use the re-read version",
  );
  assert.ok(
    /expectedVersion:\s*publishExpectedVersion/.test(seedSrc),
    "the publish CAS must use the re-read version",
  );
});

// ── Overwrite safety: the gate must FAIL CLOSED ───────────────────────────
// The seed replaces the whole homepage composition and republishes it. A
// slot-count read that ERRORS used to be indistinguishable from "this tenant
// has no sections", which would authorize overwriting a real storefront.

test("shouldSkipFreeStarterHomepageSeed skips when the content probe failed", () => {
  assert.equal(
    shouldSkipFreeStarterHomepageSeed({
      pageStatus: "draft",
      draftSlotCount: 0,
      liveSlotCount: 0,
      contentProbeOk: false,
    }),
    true,
  );
  // Probe explicitly succeeded and found nothing: seeding is still allowed.
  assert.equal(
    shouldSkipFreeStarterHomepageSeed({
      pageStatus: "draft",
      draftSlotCount: 0,
      liveSlotCount: 0,
      contentProbeOk: true,
    }),
    false,
  );
});

test("shouldSkipFreeStarterHomepageSeed only seeds a pristine draft page", () => {
  for (const pageStatus of ["published", "scheduled", "archived", null]) {
    assert.equal(
      shouldSkipFreeStarterHomepageSeed({
        pageStatus,
        draftSlotCount: 0,
        liveSlotCount: 0,
        contentProbeOk: true,
      }),
      true,
      `pageStatus ${String(pageStatus)} must not be seeded over`,
    );
  }
});
