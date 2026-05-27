// public-surface-visibility.test.ts
//
// Cross-surface visibility property test for the three helpers in
// public-surface-visibility.ts (Phase 1.5 / Lane C).
//
// Run (from web/):
//   NEXT_RUNTIME='' npx tsx \
//     --require ./src/lib/field-engine/__fixtures__/register-surface-vis-test.cjs \
//     --test src/lib/field-engine/public-surface-visibility.test.ts
//
// Mocking seam: the --require hook redirects @/lib/supabase/admin to a CJS
// stub (admin-mock-stub.cjs) that returns a mock Supabase client driven by
// global.__SURFACE_VIS_MOCK__.canonicalDecisions. Tests call mock.set() to
// control what the canonical resolver "finds" for bridged keys.
//
// Non-bridged keys (fit_labels, skills, languages, industries, event_types,
// tags, gender, language, talent_type, location) bypass the canonical DB
// entirely via _syntheticLegacyVisibility and need no mock.
//
// react.cache() does NOT memoize in Node.js (no request scope), so every
// call re-invokes the mock client fresh. unstable_cache is a pass-through
// with NEXT_RUNTIME=''.

import test from "node:test";
import assert from "node:assert/strict";

import {
  isResolvedFieldVisibleInDirectoryFilter,
  isResolvedFieldVisibleOnDirectoryCard,
  isResolvedFieldVisibleInPublicProfileSidebar,
} from "@/lib/field-engine/public-surface-visibility";

// ─── Mock state helper ────────────────────────────────────────────────────────

// global.__SURFACE_VIS_MOCK__ is set by register-surface-vis-test.cjs.
type MockDecision = {
  isPublic: boolean;
  showInDirectory: boolean;
  showInDirectoryFilter?: boolean;
  showInDirectoryCard?: boolean;
  showInPublicProfileSidebar?: boolean;
  is_sensitive?: boolean;
  admin_only?: boolean;
};
type MockTenantOverride = {
  enabled_override?: boolean | null;
  show_in_public_override?: boolean | null;
  show_in_directory_override?: boolean | null;
  admin_only_override?: boolean | null;
  default_visibility_override?: string[] | null;
  show_in_directory_filter_override?: boolean | null;
  show_in_directory_card_override?: boolean | null;
  show_in_public_profile_sidebar_override?: boolean | null;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mock = (global as any).__SURFACE_VIS_MOCK__ as {
  canonicalDecisions: Map<string, MockDecision>;
  tenantOverrides: Map<string, MockTenantOverride>;
  set(r: Record<string, MockDecision>): void;
  setTenantOverrides(r: Record<string, MockTenantOverride>): void;
  clear(): void;
};

// ─── Fixture factories ────────────────────────────────────────────────────────

// Default keys after Sub-Task 5 (canonical-alone path):
//   FILTER_DEFAULT_KEY — `location` is the only canonical-free key the
//     filter helper accepts via the LEGACY_ONLY_DIRECTORY_FILTER_KEYS
//     allow-list. directory_filter_visible=true is the sole gate.
//   CARD_DEFAULT_KEY / SIDEBAR_DEFAULT_KEY — Sub-Task 5 collapsed cards +
//     sidebar onto canonical only. The default key must be bridged. We use
//     `height_cm` (bridged via OLD_TO_NEW_KEY) and let each test set the
//     canonical decision via mock.set().
const FILTER_DEFAULT_KEY = "location";
const CARD_DEFAULT_KEY = "height_cm";
const SIDEBAR_DEFAULT_KEY = "skills";

/** Legacy row shape for the FILTER helper — all "good" flags by default. */
function filterField(overrides: Partial<{
  key: string;
  directory_filter_visible: boolean | null;
  active: boolean;
  archived_at: string | null;
  tenant_id: string | null;
  public_visible: boolean | null;
  profile_visible: boolean | null;
  internal_only: boolean | null;
}> = {}) {
  return {
    key: FILTER_DEFAULT_KEY,
    directory_filter_visible: true,
    active: true,
    archived_at: null,
    tenant_id: null,
    public_visible: true,
    profile_visible: true,
    internal_only: false,
    ...overrides,
  };
}

/** Legacy row shape for the CARD helper — all "good" flags by default. */
function cardField(overrides: Partial<{
  key: string;
  card_visible: boolean;
  active: boolean;
  archived_at: string | null;
  tenant_id: string | null;
  public_visible: boolean;
  profile_visible: boolean;
  internal_only: boolean;
}> = {}) {
  return {
    key: CARD_DEFAULT_KEY,
    card_visible: true,
    active: true,
    archived_at: null,
    tenant_id: null,
    public_visible: true,
    profile_visible: true,
    internal_only: false,
    ...overrides,
  };
}

/** Legacy row shape for the SIDEBAR helper — all "good" flags by default. */
function sidebarField(overrides: Partial<{
  key: string;
  active: boolean;
  archived_at: string | null;
  tenant_id: string | null;
  public_visible: boolean;
  profile_visible: boolean;
  internal_only: boolean;
}> = {}) {
  return {
    key: SIDEBAR_DEFAULT_KEY,
    active: true,
    archived_at: null,
    tenant_id: null,
    public_visible: true,
    profile_visible: true,
    internal_only: false,
    ...overrides,
  };
}

/** Context passed to all helpers. */
const ctx = { supabase: {} as never, tenantId: "tenant-test" };

// ─────────────────────────────────────────────────────────────────────────────
// § 1. Positive baseline — well-formed fields appear on each surface
// ─────────────────────────────────────────────────────────────────────────────
//
// These confirm the "happy path" before testing leak conditions.

test("baseline: legacy-only filter chip (location) appears in directory_filter via allow-list", async () => {
  mock.clear();
  // Sub-Task 5 (canonical-alone): location has no canonical row. Filter
  // helper allow-lists it (LEGACY_ONLY_DIRECTORY_FILTER_KEYS) — gate is
  // directory_filter_visible=true alone.
  assert.equal(await isResolvedFieldVisibleInDirectoryFilter(filterField(), ctx), true);
});

test("baseline: bridged key (height_cm) appears on directory_card when canonical is public+card", async () => {
  mock.set({ height_cm: { isPublic: true, showInDirectory: true } });
  assert.equal(await isResolvedFieldVisibleOnDirectoryCard(cardField(), ctx), true);
});

test("baseline: bridged key (skills) appears in public_profile_sidebar when canonical is public+sidebar", async () => {
  mock.set({ skills: { isPublic: true, showInDirectory: true } });
  assert.equal(await isResolvedFieldVisibleInPublicProfileSidebar(sidebarField(), ctx), true);
});

test("baseline: bridged key appears when canonical is public+directory", async () => {
  mock.set({ height_cm: { isPublic: true, showInDirectory: true } });
  assert.equal(
    await isResolvedFieldVisibleInDirectoryFilter(filterField({ key: "height_cm" }), ctx),
    true,
  );
  assert.equal(
    await isResolvedFieldVisibleOnDirectoryCard(cardField({ key: "height_cm" }), ctx),
    true,
  );
  assert.equal(
    await isResolvedFieldVisibleInPublicProfileSidebar(sidebarField({ key: "height_cm", public_visible: true, profile_visible: true }), ctx),
    true,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// § 2. Invariant — admin_only on canonical blocks all surfaces
// ─────────────────────────────────────────────────────────────────────────────
//
// When the canonical def has admin_only=true, effectiveFieldVisibility returns
// "admin" (not "public"), so dec.isPublic=false and the helper returns false.
// Uses bridged key "height_cm" with the mock injecting an admin_only canonical row.

test("admin_only: bridged key blocked from directory_filter", async () => {
  mock.set({ height_cm: { isPublic: false, showInDirectory: true, admin_only: true } });
  assert.equal(
    await isResolvedFieldVisibleInDirectoryFilter(filterField({ key: "height_cm" }), ctx),
    false,
  );
});

test("admin_only: bridged key blocked from directory_card", async () => {
  mock.set({ height_cm: { isPublic: false, showInDirectory: true, admin_only: true } });
  assert.equal(
    await isResolvedFieldVisibleOnDirectoryCard(cardField({ key: "height_cm" }), ctx),
    false,
  );
});

test("admin_only: bridged key blocked from public_profile_sidebar", async () => {
  mock.set({ height_cm: { isPublic: false, showInDirectory: false, admin_only: true } });
  assert.equal(
    await isResolvedFieldVisibleInPublicProfileSidebar(sidebarField({ key: "height_cm" }), ctx),
    false,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// § 3. Invariant — is_sensitive on canonical blocks all surfaces
// ─────────────────────────────────────────────────────────────────────────────
//
// is_sensitive also applies the admin floor in effectiveFieldVisibility.
// Uses bridged key "years_experience" with is_sensitive=true in the mock.

test("is_sensitive: bridged key blocked from directory_filter", async () => {
  mock.set({ years_experience: { isPublic: false, showInDirectory: true, is_sensitive: true } });
  assert.equal(
    await isResolvedFieldVisibleInDirectoryFilter(filterField({ key: "years_experience" }), ctx),
    false,
  );
});

test("is_sensitive: bridged key blocked from directory_card", async () => {
  mock.set({ years_experience: { isPublic: false, showInDirectory: true, is_sensitive: true } });
  assert.equal(
    await isResolvedFieldVisibleOnDirectoryCard(cardField({ key: "years_experience" }), ctx),
    false,
  );
});

test("is_sensitive: bridged key blocked from public_profile_sidebar", async () => {
  mock.set({ years_experience: { isPublic: false, showInDirectory: false, is_sensitive: true } });
  assert.equal(
    await isResolvedFieldVisibleInPublicProfileSidebar(sidebarField({ key: "years_experience" }), ctx),
    false,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// § 4. Invariant — canonical !isPublic blocks all surfaces (Sub-Task 5)
// ─────────────────────────────────────────────────────────────────────────────
//
// Sub-Task 5 collapsed the helpers onto canonical alone. The "public floor"
// invariant moved from the legacy `public_visible` flag to canonical
// effectiveFieldVisibility ("public" vs "admin"/"hidden"). These tests
// inject a non-public canonical decision and confirm every helper blocks.

test("!isPublic: bridged key blocked from directory_filter", async () => {
  mock.set({ height_cm: { isPublic: false, showInDirectory: true } });
  assert.equal(
    await isResolvedFieldVisibleInDirectoryFilter(filterField({ key: "height_cm" }), ctx),
    false,
  );
});

test("!isPublic: bridged key blocked from directory_card", async () => {
  mock.set({ height_cm: { isPublic: false, showInDirectory: true } });
  assert.equal(
    await isResolvedFieldVisibleOnDirectoryCard(cardField({ key: "height_cm" }), ctx),
    false,
  );
});

test("!isPublic: bridged key blocked from public_profile_sidebar", async () => {
  mock.set({ skills: { isPublic: false, showInDirectory: true } });
  assert.equal(
    await isResolvedFieldVisibleInPublicProfileSidebar(sidebarField(), ctx),
    false,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// § 5. Invariant — internal_only is enforced by canonical is_sensitive (Sub-Task 5)
// ─────────────────────────────────────────────────────────────────────────────
//
// Sub-Task 5 stopped consulting the legacy `internal_only` flag. The
// equivalent floor is canonical `is_sensitive` (or `admin_only`), which
// `effectiveFieldVisibility` collapses to "admin" and the helpers AND on
// `dec.isPublic === true`. § 3 already exercises the bridged is_sensitive
// path; this section is now a thin alias kept for naming continuity.

test("legacy internal_only=true on a bridged key still blocks (canonical floor wins)", async () => {
  mock.set({ height_cm: { isPublic: false, showInDirectory: true, is_sensitive: true } });
  // The helper no longer reads field.internal_only; it routes via canonical.
  assert.equal(
    await isResolvedFieldVisibleInDirectoryFilter(filterField({ key: "height_cm", internal_only: true }), ctx),
    false,
  );
  assert.equal(
    await isResolvedFieldVisibleOnDirectoryCard(cardField({ key: "height_cm", internal_only: true }), ctx),
    false,
  );
  assert.equal(
    await isResolvedFieldVisibleInPublicProfileSidebar(sidebarField({ key: "height_cm", internal_only: true }), ctx),
    false,
  );
});

test("legacy-only key (location) with internal_only=true still appears in filter (filter is column-backed, not field-value-backed)", async () => {
  mock.clear();
  // The location row's value is sourced from talent_profiles.residence_city_id,
  // not from field_values. Whether the legacy field_definitions row carries
  // internal_only=true is meaningless to the column-backed render.
  // Sub-Task 5 documents this — the allow-list gates on
  // directory_filter_visible alone.
  assert.equal(
    await isResolvedFieldVisibleInDirectoryFilter(
      filterField({ key: "location", internal_only: true, directory_filter_visible: true }),
      ctx,
    ),
    true,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// § 6. Invariant — tenant_disabled (legacy surface flag = false) blocks all
// ─────────────────────────────────────────────────────────────────────────────
//
// Risk R1 "tenant with legacy flag=false": the legacy surface flag is an
// additional AND gate on top of any canonical decision. Checked pre-canonically.
//   - filter: directory_filter_visible=false
//   - card:   card_visible=false
//   - sidebar: profile_visible=false

test("tenant_disabled: directory_filter_visible=false blocks directory_filter", async () => {
  mock.clear();
  assert.equal(
    await isResolvedFieldVisibleInDirectoryFilter(filterField({ directory_filter_visible: false }), ctx),
    false,
  );
});

test("tenant_disabled: card_visible=false blocks directory_card", async () => {
  mock.clear();
  assert.equal(
    await isResolvedFieldVisibleOnDirectoryCard(cardField({ card_visible: false }), ctx),
    false,
  );
});

test("tenant_disabled: profile_visible=false blocks public_profile_sidebar", async () => {
  mock.clear();
  assert.equal(
    await isResolvedFieldVisibleInPublicProfileSidebar(sidebarField({ profile_visible: false }), ctx),
    false,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// § 7. R4 — gender allow-list positive and block cases
// ─────────────────────────────────────────────────────────────────────────────
//
// gender is column-backed on talent_profiles.gender, carries internal_only=true
// in field_definitions, and is absent from OLD_TO_NEW_KEY. The filter helper
// permits it via GENDER_ALLOW_LIST_KEYS (R4). Card and sidebar block it because
// internal_only=true hits the pre-canonical guard at step 1.

const genderFilterField = {
  key: "gender",
  directory_filter_visible: true,
  active: true,
  archived_at: null,
  tenant_id: null,
  public_visible: undefined,    // column-backed; public_visible absent from row shape
  profile_visible: undefined,
  internal_only: true,          // as stored in field_definitions
};

test("R4 gender: appears in directory_filter when canonical identity.gender is public", async () => {
  // Sub-Task 5: gender routes through the bridged-canonical path (legacy
  // gender ↔ canonical identity.gender). GENDER_ALLOW_LIST_KEYS still gates
  // at step 3 of the filter helper, then defers to canonical decision.
  mock.set({ gender: { isPublic: true, showInDirectory: true } });
  assert.equal(await isResolvedFieldVisibleInDirectoryFilter(genderFilterField, ctx), true);
});

test("R4 gender: does NOT appear on directory_card (internal_only=true blocks at step 1)", async () => {
  mock.clear();
  assert.equal(
    await isResolvedFieldVisibleOnDirectoryCard(
      { key: "gender", card_visible: true, active: true, archived_at: null, tenant_id: null,
        public_visible: true, profile_visible: true, internal_only: true },
      ctx,
    ),
    false,
  );
});

test("R4 gender: does NOT appear in public_profile_sidebar (internal_only=true blocks at step 1)", async () => {
  mock.clear();
  assert.equal(
    await isResolvedFieldVisibleInPublicProfileSidebar(
      { key: "gender", active: true, archived_at: null, tenant_id: null,
        public_visible: true, profile_visible: true, internal_only: true },
      ctx,
    ),
    false,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// § 8. R1 RESOLVED — Sub-Task 5 collapsed onto canonical-only
// ─────────────────────────────────────────────────────────────────────────────
//
// The Phase 1 AND-ing of legacy flags with canonical decisions was a
// temporary R1 mitigation. Sub-Task 5 removed it. Verifying the new
// behavior: a tenant that wants to hide a bridged field flips the
// workspace_profile_field_settings.show_in_directory_*_override column
// — NOT the legacy `card_visible` / `directory_filter_visible` flag.

test("Sub-Task 5: legacy card_visible=false NO LONGER blocks directory_card (canonical-alone)", async () => {
  mock.set({ height_cm: { isPublic: true, showInDirectory: true } });
  // Pre-Sub-Task-5 this returned false (legacy flag blocked). Post-Sub-Task-5
  // canonical decides → true. Tenants who want to hide the card must use
  // workspace_profile_field_settings.show_in_directory_card_override=false
  // (covered by § 11). Legacy card_visible is no longer consulted.
  assert.equal(
    await isResolvedFieldVisibleOnDirectoryCard(
      cardField({ key: "height_cm", card_visible: false }),
      ctx,
    ),
    true,
  );
});

test("Sub-Task 5: legacy directory_filter_visible=false NO LONGER blocks filter for bridged keys", async () => {
  mock.set({ height_cm: { isPublic: true, showInDirectory: true } });
  // Same shift as the card test: canonical decides.
  assert.equal(
    await isResolvedFieldVisibleInDirectoryFilter(
      filterField({ key: "height_cm", directory_filter_visible: false }),
      ctx,
    ),
    true,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// § 9. Invariant 4 — active=false and archived_at block all surfaces
// ─────────────────────────────────────────────────────────────────────────────

test("inactive field is blocked from all three surfaces", async () => {
  mock.clear();
  assert.equal(
    await isResolvedFieldVisibleInDirectoryFilter(filterField({ active: false }), ctx),
    false,
  );
  assert.equal(
    await isResolvedFieldVisibleOnDirectoryCard(cardField({ active: false }), ctx),
    false,
  );
  assert.equal(
    await isResolvedFieldVisibleInPublicProfileSidebar(sidebarField({ active: false }), ctx),
    false,
  );
});

test("archived field is blocked from all three surfaces", async () => {
  mock.clear();
  assert.equal(
    await isResolvedFieldVisibleInDirectoryFilter(filterField({ archived_at: "2026-01-01T00:00:00Z" }), ctx),
    false,
  );
  assert.equal(
    await isResolvedFieldVisibleOnDirectoryCard(cardField({ archived_at: "2026-01-01T00:00:00Z" }), ctx),
    false,
  );
  assert.equal(
    await isResolvedFieldVisibleInPublicProfileSidebar(sidebarField({ archived_at: "2026-01-01T00:00:00Z" }), ctx),
    false,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// § 10. Property sweep — non-bridged keys across all 5 leak conditions
// ─────────────────────────────────────────────────────────────────────────────
//
// Iterates a fixture table of (surface, condition, field, expected) and verifies
// that every leak condition → false for non-bridged keys across all surfaces.
// Complements the explicit § 2-6 tests with a compact cross-product check.

const SURFACES = [
  {
    name: "directory_filter",
    invoke: (f: ReturnType<typeof filterField>) =>
      isResolvedFieldVisibleInDirectoryFilter(f as Parameters<typeof isResolvedFieldVisibleInDirectoryFilter>[0], ctx),
    base: () => filterField(),
  },
  {
    name: "directory_card",
    invoke: (f: ReturnType<typeof cardField>) =>
      isResolvedFieldVisibleOnDirectoryCard(f as Parameters<typeof isResolvedFieldVisibleOnDirectoryCard>[0], ctx),
    base: () => cardField(),
  },
  {
    name: "public_profile_sidebar",
    invoke: (f: ReturnType<typeof sidebarField>) =>
      isResolvedFieldVisibleInPublicProfileSidebar(f as Parameters<typeof isResolvedFieldVisibleInPublicProfileSidebar>[0], ctx),
    base: () => sidebarField(),
  },
] as const;

// Sub-Task 5: leak conditions split into two classes —
//   A. universal guards (active=false, archived_at) still applied for all keys
//   B. canonical floors (admin_only, is_sensitive) applied only via canonical
// The legacy-flag conditions (public_visible, internal_only,
// tenant surface flag) are obsolete for bridged keys after Sub-Task 5;
// kept here as documentation of the previously-tested invariants now
// enforced through other means.
const LEAK_CONDITIONS: Array<{
  label: string;
  patch: (base: Record<string, unknown>) => Record<string, unknown>;
}> = [
  { label: "active=false",         patch: (b) => ({ ...b, active: false }) },
  { label: "archived_at not null", patch: (b) => ({ ...b, archived_at: "2026-01-01T00:00:00Z" }) },
];

for (const surface of SURFACES) {
  for (const condition of LEAK_CONDITIONS) {
    test(`property sweep: [${surface.name}] leak blocked when ${condition.label}`, async () => {
      mock.clear();
      const field = condition.patch(surface.base() as unknown as Record<string, unknown>);
      const result = await surface.invoke(field as never);
      assert.equal(result, false, `${surface.name} should block field when ${condition.label}`);
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 11. Phase 2 — workspace_profile_field_settings tenant overrides
// ─────────────────────────────────────────────────────────────────────────────
//
// Sub-Task 2 of the Phase 2 brief. The new canonical sub-surface flags
// (show_in_directory_filter / show_in_directory_card /
// show_in_public_profile_sidebar) are gated by per-tenant override columns
// of the same name + `_override`. The mock harness models these via
// `mock.setTenantOverrides({...})`.
//
// These tests replace the legacy-flag-based "tenant_disabled" tests in § 6:
// the real Phase 2 mechanism is a workspace_profile_field_settings row,
// not a legacy field_definitions clone. (§ 6 tests are kept for back-compat
// with the Phase 1 AND-ing, which Sub-Task 5 removes.)

test("Phase 2 tenant override: filter_override=false blocks directory_filter even when canonical is public", async () => {
  mock.set({ height_cm: { isPublic: true, showInDirectory: true } });
  mock.setTenantOverrides({
    height_cm: { show_in_directory_filter_override: false },
  });
  assert.equal(
    await isResolvedFieldVisibleInDirectoryFilter(filterField({ key: "height_cm" }), ctx),
    false,
  );
});

test("Phase 2 tenant override: card_override=false blocks directory_card even when canonical is public", async () => {
  mock.set({ height_cm: { isPublic: true, showInDirectory: true } });
  mock.setTenantOverrides({
    height_cm: { show_in_directory_card_override: false },
  });
  assert.equal(
    await isResolvedFieldVisibleOnDirectoryCard(cardField({ key: "height_cm" }), ctx),
    false,
  );
});

test("Phase 2 tenant override: sidebar_override=false blocks public_profile_sidebar even when canonical is public", async () => {
  mock.set({ height_cm: { isPublic: true, showInDirectory: true } });
  mock.setTenantOverrides({
    height_cm: { show_in_public_profile_sidebar_override: false },
  });
  assert.equal(
    await isResolvedFieldVisibleInPublicProfileSidebar(sidebarField({ key: "height_cm" }), ctx),
    false,
  );
});

test("Phase 2 tenant override: filter_override=true alone does NOT bypass safety floor (admin_only canonical)", async () => {
  // Safety floor invariant — a tenant can't promote an admin_only field to
  // public via an override. The override raises showInDirectoryFilter to
  // true, but effectiveFieldVisibility on admin_only canonical resolves to
  // "admin", so dec.isPublic stays false and the AND blocks at step 4.
  mock.set({
    years_experience: { isPublic: false, showInDirectory: false, admin_only: true },
  });
  mock.setTenantOverrides({
    years_experience: {
      show_in_directory_filter_override: true,
      show_in_directory_card_override: true,
      show_in_public_profile_sidebar_override: true,
    },
  });
  assert.equal(
    await isResolvedFieldVisibleInDirectoryFilter(filterField({ key: "years_experience" }), ctx),
    false,
    "tenant override must NOT promote admin_only canonical to public (directory_filter)",
  );
  assert.equal(
    await isResolvedFieldVisibleOnDirectoryCard(cardField({ key: "years_experience" }), ctx),
    false,
    "tenant override must NOT promote admin_only canonical to public (directory_card)",
  );
  assert.equal(
    await isResolvedFieldVisibleInPublicProfileSidebar(sidebarField({ key: "years_experience" }), ctx),
    false,
    "tenant override must NOT promote admin_only canonical to public (public_profile_sidebar)",
  );
});

test("Phase 2 tenant override: filter_override=true alone does NOT bypass safety floor (is_sensitive canonical)", async () => {
  // Symmetric to the admin_only case — is_sensitive is the other half of
  // the platform admin floor in effectiveFieldVisibility.
  mock.set({
    years_experience: { isPublic: false, showInDirectory: false, is_sensitive: true },
  });
  mock.setTenantOverrides({
    years_experience: {
      show_in_directory_filter_override: true,
    },
  });
  assert.equal(
    await isResolvedFieldVisibleInDirectoryFilter(filterField({ key: "years_experience" }), ctx),
    false,
  );
});

test("Phase 2 tenant override: section-gate keys (fit_labels) honour show_in_directory_filter_override", async () => {
  // The 7 taxonomy section-gate keys (fit_labels, skills, languages,
  // industries, event_types, tags, gender) became bridged in Sub-Task 0.5.
  // Their tenant overrides work the same way as the value-mirror 17.
  mock.set({
    fit_labels: { isPublic: true, showInDirectory: true },
  });
  mock.setTenantOverrides({
    fit_labels: { show_in_directory_filter_override: false },
  });
  assert.equal(
    await isResolvedFieldVisibleInDirectoryFilter(filterField({ key: "fit_labels" }), ctx),
    false,
  );
});

test("Phase 2 tenant override: section-gate keys (skills) honour show_in_public_profile_sidebar_override", async () => {
  mock.set({
    skills: { isPublic: true, showInDirectory: true },
  });
  mock.setTenantOverrides({
    skills: { show_in_public_profile_sidebar_override: false },
  });
  assert.equal(
    await isResolvedFieldVisibleInPublicProfileSidebar(sidebarField({ key: "skills" }), ctx),
    false,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// § 12. Phase 2 — tenant isolation invariant
// ─────────────────────────────────────────────────────────────────────────────
//
// Sub-Task 4 tenant-isolation: a tenant override is per-(tenant_id,
// field_definition_id). Tenant A disabling a field must not affect the
// helper's decision for tenant B.
//
// The mock returns the same override rows regardless of tenant_id (the
// stub's eq("tenant_id", tenantId) filter is a no-op against an array that
// already represents only tenant A's overrides). To test isolation
// honestly, we exercise the same call twice with different tenantIds and
// verify the override only fires on the tenant whose overrides we
// installed. tenant B's call is wrapped in a fresh setTenantOverrides({})
// so the harness explicitly models tenant B having no overrides.

test("Phase 2 isolation: tenant A's filter_override=false does not affect tenant B", async () => {
  mock.set({ height_cm: { isPublic: true, showInDirectory: true } });

  // Tenant A disables the filter chip.
  mock.setTenantOverrides({
    height_cm: { show_in_directory_filter_override: false },
  });
  const tenantA = { supabase: {} as never, tenantId: "tenant-A" };
  assert.equal(
    await isResolvedFieldVisibleInDirectoryFilter(filterField({ key: "height_cm" }), tenantA),
    false,
    "tenant A should see the chip hidden",
  );

  // Tenant B has no override — flush + re-set canonical only.
  mock.set({ height_cm: { isPublic: true, showInDirectory: true } });
  mock.setTenantOverrides({});
  const tenantB = { supabase: {} as never, tenantId: "tenant-B" };
  assert.equal(
    await isResolvedFieldVisibleInDirectoryFilter(filterField({ key: "height_cm" }), tenantB),
    true,
    "tenant B should still see the chip — isolation invariant",
  );
});

test("Phase 2 isolation: tenant A's card_override=false does not bleed into tenant B's directory_card", async () => {
  mock.set({ height_cm: { isPublic: true, showInDirectory: true } });
  mock.setTenantOverrides({
    height_cm: { show_in_directory_card_override: false },
  });
  const tenantA = { supabase: {} as never, tenantId: "tenant-A" };
  assert.equal(
    await isResolvedFieldVisibleOnDirectoryCard(cardField({ key: "height_cm" }), tenantA),
    false,
  );

  mock.set({ height_cm: { isPublic: true, showInDirectory: true } });
  mock.setTenantOverrides({});
  const tenantB = { supabase: {} as never, tenantId: "tenant-B" };
  assert.equal(
    await isResolvedFieldVisibleOnDirectoryCard(cardField({ key: "height_cm" }), tenantB),
    true,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// § 13. Phase 2 — round-trip parity between canonical-only flags + AND-ing
// ─────────────────────────────────────────────────────────────────────────────
//
// Sub-Task 5 collapses the legacy AND-ing inside the helpers. Before
// removing the legacy gate we lock in the parity invariant: when the
// legacy flag and the canonical sub-surface flag both agree (the
// post-Sub-Task-0 backfilled state), the helper's decision must equal
// what canonical alone would return.

test("Phase 2 round-trip: canonical+legacy agree → helper returns true", async () => {
  mock.set({ height_cm: { isPublic: true, showInDirectory: true } });
  // Backfilled state: legacy directory_filter_visible=true matches canonical
  // show_in_directory_filter (default-true via showInDirectory).
  assert.equal(
    await isResolvedFieldVisibleInDirectoryFilter(
      filterField({ key: "height_cm", directory_filter_visible: true }),
      ctx,
    ),
    true,
  );
});

test("Phase 2 round-trip: canonical-flipped-false WITHOUT legacy-flipped-false → helper returns false (canonical wins)", async () => {
  mock.set({ height_cm: { isPublic: true, showInDirectory: true } });
  mock.setTenantOverrides({
    height_cm: { show_in_directory_filter_override: false },
  });
  // Legacy flag still true (the "drift" the Sub-Task 0 backfill
  // documented); canonical says false. After Sub-Task 5 the helper runs
  // canonical-only and returns false — the AND-ing makes that already-true
  // today because canonical false ANDs to false.
  assert.equal(
    await isResolvedFieldVisibleInDirectoryFilter(
      filterField({ key: "height_cm", directory_filter_visible: true }),
      ctx,
    ),
    false,
  );
});
