// resolve-talent-fields.test.ts
//
// Smoke / characterization suite for the SINGLE shared talent-field resolver.
// Pins behavior for the main exit paths so future refactors (e.g. the
// inevitable Phase 6 reader-cutover wiring) have a regression net.
//
// Run: npx tsx --test src/lib/field-engine/resolve-talent-fields.test.ts
//
// Coverage is intentionally focused, not exhaustive. The big surface areas
// covered today:
//   1. Auth/roster gate — talent not on roster → early-exit error
//   2. Assigns query error → early-exit error
//   3. Universal-tier field — always appears regardless of taxonomy
//   4. Type-specific field via recommendation — appears for matched talent
//   5. Type-specific field without recommendation — does NOT appear
//   6. Workspace label override — custom_label flows through
//   7. Workspace `enabled_override: false` — field disabled, excluded
//   8. Phase 4 fields — `tenant_override` true when override row exists,
//      `has_value` true when value row exists (workflow_state='live')
//   9. Group attribution — fields with a group_id resolve to the group
//  10. Sort order — fields sort by group display_order, then per-field
//      display_order, then label
//
// Open-coverage debt (good next-session work):
//   - effectiveFieldVisibility integration (workspace visibility narrows)
//   - parent_category recommendation walk (talent_type → category)
//   - show_when and validation_rules pass-through
//   - source_term_id attribution for typed fields
//   - is_recommended / required_at_registration / required_before_publish
//   - The `loadTenantFieldCatalogUncached` cache-vs-fallback split
//
// All of those would extend the same MockSupabase scaffold below — adding
// a row to the relevant table is enough.

import test from "node:test";
import assert from "node:assert/strict";

import { resolveTalentFields } from "@/lib/field-engine/resolve-talent-fields";

// ─────────────────────────────────────────────────────────────────────────────
// MockSupabase — minimal chained-query surface the resolver uses.
//
// The resolver hits exactly these methods on a supabase client:
//   .from(table)
//   .select(cols)
//   .eq(col, val) / .neq(col, val) / .in(col, vals) / .is(col, val)
//   .order(col, opts?)
//   .limit(n)
//   .maybeSingle()
//   .returns<T>()
//   await query   →   { data: Row[], error: null }
//
// `MockSupabase` returns canned rows per table; filters are applied
// in-memory by reading the recorded chain. Production-fidelity isn't a
// goal — the resolver is what we're testing, not Postgres. If a row
// matches the recorded filters it's returned; otherwise it's filtered out.
// ─────────────────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, unknown>;

type MockData = {
  agency_talent_roster?: Row[];
  talent_profile_field_values?: Row[];
  talent_profile_taxonomy?: Row[];
  taxonomy_terms?: Row[];
  profile_field_definitions?: Row[];
  profile_field_groups?: Row[];
  parent_category_field_groups?: Row[];
  profile_field_recommendations?: Row[];
  workspace_field_group_settings?: Row[];
  workspace_profile_field_settings?: Row[];
};

/** Per-table error injection for tests that want to verify resolver
 *  behaviour on a failed query. Map of `table → error to surface`. */
type MockErrors = Partial<Record<keyof MockData, { message: string }>>;

function buildMockSupabase(data: MockData, errors: MockErrors = {}): any {
  return {
    from(table: keyof MockData) {
      return buildQuery(data[table] ?? [], errors[table] ?? null);
    },
  };
}

function buildQuery(rows: Row[], error: { message: string } | null) {
  let filtered = [...rows];

  const chain: any = {
    select(_cols: string) {
      return chain;
    },
    eq(col: string, val: unknown) {
      filtered = filtered.filter((r) => r[col] === val);
      return chain;
    },
    neq(col: string, val: unknown) {
      filtered = filtered.filter((r) => r[col] !== val);
      return chain;
    },
    in(col: string, vals: unknown[]) {
      const s = new Set(vals);
      filtered = filtered.filter((r) => s.has(r[col]));
      return chain;
    },
    is(col: string, val: unknown) {
      // Supabase .is() compares to NULL / TRUE / FALSE — for our tests we
      // map .is("col", null) to col === null.
      filtered = filtered.filter((r) => r[col] === val);
      return chain;
    },
    order(_col: string, _opts?: unknown) {
      // No-op — order is checked by the resolver's own post-fetch sort.
      return chain;
    },
    limit(n: number) {
      filtered = filtered.slice(0, n);
      return chain;
    },
    returns() {
      return chain;
    },
    maybeSingle() {
      return Promise.resolve({ data: filtered[0] ?? null, error });
    },
    // Awaitable directly (no .maybeSingle()) → resolves to { data: rows, error }
    then(resolve: (v: { data: Row[]; error: { message: string } | null }) => unknown) {
      return resolve({ data: filtered, error });
    },
  };
  return chain;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─────────────────────────────────────────────────────────────────────────────
// Fixture builders — keep tests readable
// ─────────────────────────────────────────────────────────────────────────────

const TENANT = "tenant-1";
const TALENT = "talent-1";

/** A `profile_field_definitions` row with sensible defaults. Override only
 *  the columns the specific test cares about. */
function fieldDef(overrides: Partial<Row> & { id: string; field_key: string }): Row {
  return {
    label: overrides.field_key,
    label_es: null,
    tier: "global",
    section: "general",
    subsection: null,
    kind: "text",
    unit: null,
    placeholder: null,
    options: null,
    default_visibility: ["public", "agency"],
    is_optional: true,
    display_order: 100,
    field_group_id: null,
    validation_rules: null,
    show_when: null,
    deprecated_at: null,
    admin_only: false,
    is_sensitive: false,
    show_in_public: true,
    helper: null,
    ...overrides,
  };
}

/** A roster row marking the talent active on TENANT. */
function rosterActive(): Row {
  return {
    id: "roster-row-1",
    tenant_id: TENANT,
    talent_profile_id: TALENT,
    status: "active",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Roster gate
// ─────────────────────────────────────────────────────────────────────────────

test("resolver: talent not on tenant's roster → ok=false with clear error", async () => {
  const sb = buildMockSupabase({
    agency_talent_roster: [], // no row → not on roster
  });
  const result = await resolveTalentFields({
    supabase: sb,
    talentProfileId: TALENT,
    tenantId: TENANT,
    viewerRole: "agency_admin",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /not on this tenant's roster/i);
  }
});

test("resolver: roster row exists for a different tenant → still not on this tenant's roster", async () => {
  const sb = buildMockSupabase({
    agency_talent_roster: [
      { id: "r1", tenant_id: "other-tenant", talent_profile_id: TALENT, status: "active" },
    ],
  });
  const result = await resolveTalentFields({
    supabase: sb,
    talentProfileId: TALENT,
    tenantId: TENANT,
    viewerRole: "agency_admin",
  });
  assert.equal(result.ok, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Assigns query error
// ─────────────────────────────────────────────────────────────────────────────

test("resolver: assigns query error → ok=false with generic CLIENT_ERROR", async () => {
  const sb = buildMockSupabase(
    {
      agency_talent_roster: [rosterActive()],
      talent_profile_field_values: [],
      talent_profile_taxonomy: [],
    },
    {
      talent_profile_taxonomy: { message: "simulated assigns query error" },
    },
  );
  const result = await resolveTalentFields({
    supabase: sb,
    talentProfileId: TALENT,
    tenantId: TENANT,
    viewerRole: "agency_admin",
  });
  assert.equal(result.ok, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Universal-tier field → appears regardless of taxonomy
// ─────────────────────────────────────────────────────────────────────────────

test("resolver: universal-tier field appears for any talent on roster", async () => {
  const sb = buildMockSupabase({
    agency_talent_roster: [rosterActive()],
    talent_profile_field_values: [],
    talent_profile_taxonomy: [], // no taxonomy assigns
    profile_field_definitions: [
      fieldDef({ id: "fd1", field_key: "identity.name", tier: "universal" }),
    ],
    profile_field_groups: [],
    parent_category_field_groups: [],
    profile_field_recommendations: [],
    workspace_field_group_settings: [],
    workspace_profile_field_settings: [],
  });
  const result = await resolveTalentFields({
    supabase: sb,
    talentProfileId: TALENT,
    tenantId: TENANT,
    viewerRole: "agency_admin",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.fields.length, 1);
    assert.equal(result.fields[0]?.field_key, "identity.name");
    assert.equal(result.fields[0]?.tier, "universal");
  }
});

test("resolver: global-tier field appears for any talent on roster", async () => {
  const sb = buildMockSupabase({
    agency_talent_roster: [rosterActive()],
    talent_profile_field_values: [],
    talent_profile_taxonomy: [],
    profile_field_definitions: [
      fieldDef({ id: "fd1", field_key: "media.website_url", tier: "global" }),
    ],
    profile_field_groups: [],
    parent_category_field_groups: [],
    profile_field_recommendations: [],
    workspace_field_group_settings: [],
    workspace_profile_field_settings: [],
  });
  const result = await resolveTalentFields({
    supabase: sb,
    talentProfileId: TALENT,
    tenantId: TENANT,
    viewerRole: "agency_admin",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.fields.length, 1);
    assert.equal(result.fields[0]?.field_key, "media.website_url");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Type-specific field via recommendation
// ─────────────────────────────────────────────────────────────────────────────

test("resolver: type-specific field with matching recommendation → appears", async () => {
  const sb = buildMockSupabase({
    agency_talent_roster: [rosterActive()],
    talent_profile_field_values: [],
    talent_profile_taxonomy: [
      { talent_profile_id: TALENT, taxonomy_term_id: "term-fashion-model", relationship_type: "primary" },
    ],
    taxonomy_terms: [
      { id: "term-fashion-model", parent_id: null, term_type: "talent_type" },
    ],
    profile_field_definitions: [
      fieldDef({
        id: "fd-height",
        field_key: "physical.height_cm",
        tier: "type-specific",
      }),
    ],
    profile_field_groups: [],
    parent_category_field_groups: [],
    profile_field_recommendations: [
      {
        field_definition_id: "fd-height",
        taxonomy_term_id: "term-fashion-model",
        relationship: "core",
        display_order: 10,
        required_at_registration: false,
        required_before_publish: false,
        required_before_verification: false,
        is_admin_only: false,
        requires_verification: false,
      },
    ],
    workspace_field_group_settings: [],
    workspace_profile_field_settings: [],
  });
  const result = await resolveTalentFields({
    supabase: sb,
    talentProfileId: TALENT,
    tenantId: TENANT,
    viewerRole: "agency_admin",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    const heights = result.fields.filter((f) => f.field_key === "physical.height_cm");
    assert.equal(heights.length, 1, "physical.height_cm should appear for a fashion-model");
  }
});

test("resolver: type-specific field WITHOUT a matching recommendation → does NOT appear", async () => {
  const sb = buildMockSupabase({
    agency_talent_roster: [rosterActive()],
    talent_profile_field_values: [],
    talent_profile_taxonomy: [
      { talent_profile_id: TALENT, taxonomy_term_id: "term-chef", relationship_type: "primary" },
    ],
    taxonomy_terms: [{ id: "term-chef", parent_id: null, term_type: "talent_type" }],
    profile_field_definitions: [
      // A height field that's only recommended for models (not chefs).
      fieldDef({
        id: "fd-height",
        field_key: "physical.height_cm",
        tier: "type-specific",
      }),
    ],
    profile_field_groups: [],
    parent_category_field_groups: [],
    profile_field_recommendations: [
      {
        field_definition_id: "fd-height",
        taxonomy_term_id: "term-fashion-model",
        relationship: "core",
        display_order: 10,
        required_at_registration: false,
        required_before_publish: false,
        required_before_verification: false,
        is_admin_only: false,
        requires_verification: false,
      },
    ],
    workspace_field_group_settings: [],
    workspace_profile_field_settings: [],
  });
  const result = await resolveTalentFields({
    supabase: sb,
    talentProfileId: TALENT,
    tenantId: TENANT,
    viewerRole: "agency_admin",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    const heights = result.fields.filter((f) => f.field_key === "physical.height_cm");
    assert.equal(heights.length, 0, "physical.height_cm should NOT appear for a chef");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Workspace overrides
// ─────────────────────────────────────────────────────────────────────────────

test("resolver: workspace custom_label override flows through to the resolved field's label", async () => {
  const sb = buildMockSupabase({
    agency_talent_roster: [rosterActive()],
    talent_profile_field_values: [],
    talent_profile_taxonomy: [],
    profile_field_definitions: [
      fieldDef({ id: "fd1", field_key: "identity.name", tier: "universal", label: "Name" }),
    ],
    profile_field_groups: [],
    parent_category_field_groups: [],
    profile_field_recommendations: [],
    workspace_field_group_settings: [],
    workspace_profile_field_settings: [
      {
        field_definition_id: "fd1",
        enabled_override: null,
        required_override: null,
        custom_label: "Full Legal Name",
        custom_helper: null,
        display_order_override: null,
        show_in_public_override: null,
        admin_only_override: null,
        default_visibility_override: null,
        tenant_id: TENANT,
      },
    ],
  });
  const result = await resolveTalentFields({
    supabase: sb,
    talentProfileId: TALENT,
    tenantId: TENANT,
    viewerRole: "agency_admin",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.fields[0]?.label, "Full Legal Name");
    // Phase 4 — tenant_override should be true because the override row has
    // a non-null custom_label
    assert.equal(result.fields[0]?.tenant_override, true);
  }
});

test("resolver: workspace enabled_override=false → field excluded entirely", async () => {
  const sb = buildMockSupabase({
    agency_talent_roster: [rosterActive()],
    talent_profile_field_values: [],
    talent_profile_taxonomy: [],
    profile_field_definitions: [
      fieldDef({ id: "fd1", field_key: "identity.name", tier: "universal" }),
      fieldDef({ id: "fd2", field_key: "media.website_url", tier: "global" }),
    ],
    profile_field_groups: [],
    parent_category_field_groups: [],
    profile_field_recommendations: [],
    workspace_field_group_settings: [],
    workspace_profile_field_settings: [
      {
        field_definition_id: "fd2",
        enabled_override: false, // disable
        required_override: null,
        custom_label: null,
        custom_helper: null,
        display_order_override: null,
        show_in_public_override: null,
        admin_only_override: null,
        default_visibility_override: null,
        tenant_id: TENANT,
      },
    ],
  });
  const result = await resolveTalentFields({
    supabase: sb,
    talentProfileId: TALENT,
    tenantId: TENANT,
    viewerRole: "agency_admin",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    const keys = result.fields.map((f) => f.field_key);
    assert.ok(keys.includes("identity.name"), "identity.name should still be there");
    assert.ok(!keys.includes("media.website_url"), "media.website_url disabled override should exclude it");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Phase 4 fields — has_value + tenant_override
// ─────────────────────────────────────────────────────────────────────────────

test("resolver: has_value=true for fields with a live value, false otherwise", async () => {
  const sb = buildMockSupabase({
    agency_talent_roster: [rosterActive()],
    talent_profile_field_values: [
      // Only fd1 has a value
      { talent_profile_id: TALENT, field_definition_id: "fd1", workflow_state: "live" },
    ],
    talent_profile_taxonomy: [],
    profile_field_definitions: [
      fieldDef({ id: "fd1", field_key: "identity.name", tier: "universal" }),
      fieldDef({ id: "fd2", field_key: "media.website_url", tier: "global" }),
    ],
    profile_field_groups: [],
    parent_category_field_groups: [],
    profile_field_recommendations: [],
    workspace_field_group_settings: [],
    workspace_profile_field_settings: [],
  });
  const result = await resolveTalentFields({
    supabase: sb,
    talentProfileId: TALENT,
    tenantId: TENANT,
    viewerRole: "agency_admin",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    const fd1 = result.fields.find((f) => f.field_key === "identity.name");
    const fd2 = result.fields.find((f) => f.field_key === "media.website_url");
    assert.equal(fd1?.has_value, true, "fd1 has a live value → has_value should be true");
    assert.equal(fd2?.has_value, false, "fd2 has no value → has_value should be false");
  }
});

test("resolver: has_value ignores non-'live' rows (workflow_state='pending')", async () => {
  const sb = buildMockSupabase({
    agency_talent_roster: [rosterActive()],
    talent_profile_field_values: [
      { talent_profile_id: TALENT, field_definition_id: "fd1", workflow_state: "pending" },
    ],
    talent_profile_taxonomy: [],
    profile_field_definitions: [
      fieldDef({ id: "fd1", field_key: "identity.name", tier: "universal" }),
    ],
    profile_field_groups: [],
    parent_category_field_groups: [],
    profile_field_recommendations: [],
    workspace_field_group_settings: [],
    workspace_profile_field_settings: [],
  });
  const result = await resolveTalentFields({
    supabase: sb,
    talentProfileId: TALENT,
    tenantId: TENANT,
    viewerRole: "agency_admin",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(
      result.fields[0]?.has_value,
      false,
      "pending-state values should not count for has_value",
    );
  }
});

test("resolver: tenant_override=false when no override row exists", async () => {
  const sb = buildMockSupabase({
    agency_talent_roster: [rosterActive()],
    talent_profile_field_values: [],
    talent_profile_taxonomy: [],
    profile_field_definitions: [
      fieldDef({ id: "fd1", field_key: "identity.name", tier: "universal" }),
    ],
    profile_field_groups: [],
    parent_category_field_groups: [],
    profile_field_recommendations: [],
    workspace_field_group_settings: [],
    workspace_profile_field_settings: [], // no overrides
  });
  const result = await resolveTalentFields({
    supabase: sb,
    talentProfileId: TALENT,
    tenantId: TENANT,
    viewerRole: "agency_admin",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.fields[0]?.tenant_override, false);
  }
});

test("resolver: tenant_override=true when only required_override differs", async () => {
  const sb = buildMockSupabase({
    agency_talent_roster: [rosterActive()],
    talent_profile_field_values: [],
    talent_profile_taxonomy: [],
    profile_field_definitions: [
      fieldDef({ id: "fd1", field_key: "identity.name", tier: "universal" }),
    ],
    profile_field_groups: [],
    parent_category_field_groups: [],
    profile_field_recommendations: [],
    workspace_field_group_settings: [],
    workspace_profile_field_settings: [
      {
        field_definition_id: "fd1",
        enabled_override: null,
        required_override: true,
        custom_label: null,
        custom_helper: null,
        display_order_override: null,
        show_in_public_override: null,
        admin_only_override: null,
        default_visibility_override: null,
        tenant_id: TENANT,
      },
    ],
  });
  const result = await resolveTalentFields({
    supabase: sb,
    talentProfileId: TALENT,
    tenantId: TENANT,
    viewerRole: "agency_admin",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.fields[0]?.tenant_override, true);
    assert.equal(result.fields[0]?.is_required, true);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Group attribution
// ─────────────────────────────────────────────────────────────────────────────

test("resolver: field with field_group_id resolves a group + populates field_count", async () => {
  // CHARACTERIZATION: group resolution requires the FULL chain:
  //   talent's primary term → its parent_id is a parent_category
  //   → parent_category_field_groups binds that category to the group
  //   → fields with field_group_id then resolve to that group
  // Without parent_category_field_groups entries the resolved fields show
  // up but without group attribution. See the sort-order test below for
  // the no-binding fallback behaviour.
  const sb = buildMockSupabase({
    agency_talent_roster: [rosterActive()],
    talent_profile_field_values: [],
    talent_profile_taxonomy: [
      { talent_profile_id: TALENT, taxonomy_term_id: "term-model", relationship_type: "primary" },
    ],
    taxonomy_terms: [
      { id: "term-model", parent_id: "cat-fashion", term_type: "talent_type" },
      { id: "cat-fashion", parent_id: null, term_type: "parent_category" },
    ],
    profile_field_definitions: [
      fieldDef({
        id: "fd1",
        field_key: "physical.height_cm",
        tier: "global",
        field_group_id: "grp-physical",
      }),
      fieldDef({
        id: "fd2",
        field_key: "physical.dress_size",
        tier: "global",
        field_group_id: "grp-physical",
      }),
    ],
    profile_field_groups: [
      {
        id: "grp-physical",
        slug: "physical",
        name_en: "Physical",
        name_es: null,
        sort_order: 10,
        is_active: true,
      },
    ],
    parent_category_field_groups: [
      {
        parent_category_id: "cat-fashion",
        field_group_id: "grp-physical",
        weight: "default",
        display_order: 10,
        in_registration_wizard: false,
      },
    ],
    profile_field_recommendations: [],
    workspace_field_group_settings: [],
    workspace_profile_field_settings: [],
  });
  const result = await resolveTalentFields({
    supabase: sb,
    talentProfileId: TALENT,
    tenantId: TENANT,
    viewerRole: "agency_admin",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    const physicalGroup = result.groups.find((g) => g.group_slug === "physical");
    assert.ok(physicalGroup, "should resolve a 'physical' group");
    assert.equal(physicalGroup?.field_count, 2);
    assert.ok(
      result.fields.every((f) => f.field_group_slug === "physical"),
      "every field carries the 'physical' slug",
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Sort order
// ─────────────────────────────────────────────────────────────────────────────

test("resolver: fields sort by group display_order (via parent_category_field_groups) then per-field display_order", async () => {
  // CHARACTERIZATION: group display_order for sorting comes from
  // `parent_category_field_groups.display_order`, NOT from
  // `profile_field_groups.sort_order`. Without a parent_category binding
  // for a group, that group's display_order falls back to 0 and the
  // per-field display_order dominates the sort. This test sets up the
  // full chain (talent → talent_type → parent_category → field_group)
  // so we can verify the proper two-level sort.
  const sb = buildMockSupabase({
    agency_talent_roster: [rosterActive()],
    talent_profile_field_values: [],
    talent_profile_taxonomy: [
      { talent_profile_id: TALENT, taxonomy_term_id: "term-model", relationship_type: "primary" },
    ],
    taxonomy_terms: [
      { id: "term-model", parent_id: "cat-fashion", term_type: "talent_type" },
      { id: "cat-fashion", parent_id: null, term_type: "parent_category" },
    ],
    profile_field_definitions: [
      fieldDef({
        id: "fd-late-1",
        field_key: "later.first",
        tier: "global",
        field_group_id: "grp-later",
        display_order: 10,
      }),
      fieldDef({
        id: "fd-late-2",
        field_key: "later.second",
        tier: "global",
        field_group_id: "grp-later",
        display_order: 20,
      }),
      fieldDef({
        id: "fd-early-1",
        field_key: "earlier.first",
        tier: "global",
        field_group_id: "grp-earlier",
        display_order: 100,
      }),
    ],
    profile_field_groups: [
      {
        id: "grp-later",
        slug: "later",
        name_en: "Later",
        name_es: null,
        sort_order: 999, // intentionally different from parent_category_field_groups.display_order to prove the right column is used
        is_active: true,
      },
      {
        id: "grp-earlier",
        slug: "earlier",
        name_en: "Earlier",
        name_es: null,
        sort_order: 999,
        is_active: true,
      },
    ],
    parent_category_field_groups: [
      {
        parent_category_id: "cat-fashion",
        field_group_id: "grp-later",
        weight: "default",
        display_order: 20,
        in_registration_wizard: false,
      },
      {
        parent_category_id: "cat-fashion",
        field_group_id: "grp-earlier",
        weight: "default",
        display_order: 10,
        in_registration_wizard: false,
      },
    ],
    profile_field_recommendations: [],
    workspace_field_group_settings: [],
    workspace_profile_field_settings: [],
  });
  const result = await resolveTalentFields({
    supabase: sb,
    talentProfileId: TALENT,
    tenantId: TENANT,
    viewerRole: "agency_admin",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    const order = result.fields.map((f) => f.field_key);
    assert.deepEqual(
      order,
      ["earlier.first", "later.first", "later.second"],
      "group display_order sorts first (earlier=10 then later=20), then per-field display_order within each group",
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Deprecated field — excluded from the resolver output
// ─────────────────────────────────────────────────────────────────────────────

test("resolver: deprecated_at IS NOT NULL fields are excluded by the catalog query", async () => {
  // Note: the resolver's catalog query uses `.is("deprecated_at", null)` —
  // our MockSupabase .is() matches strict equality, so a row with
  // deprecated_at="2024-01-01" won't match `.is(deprecated_at, null)` and
  // is filtered out. This characterises the live behaviour.
  const sb = buildMockSupabase({
    agency_talent_roster: [rosterActive()],
    talent_profile_field_values: [],
    talent_profile_taxonomy: [],
    profile_field_definitions: [
      fieldDef({ id: "fd1", field_key: "identity.name", tier: "universal" }),
      fieldDef({
        id: "fd2",
        field_key: "physical.weight_kg",
        tier: "global",
        deprecated_at: "2024-01-01T00:00:00Z",
      }),
    ],
    profile_field_groups: [],
    parent_category_field_groups: [],
    profile_field_recommendations: [],
    workspace_field_group_settings: [],
    workspace_profile_field_settings: [],
  });
  const result = await resolveTalentFields({
    supabase: sb,
    talentProfileId: TALENT,
    tenantId: TENANT,
    viewerRole: "agency_admin",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    const keys = result.fields.map((f) => f.field_key);
    assert.ok(keys.includes("identity.name"));
    assert.ok(!keys.includes("physical.weight_kg"), "deprecated field should be excluded");
  }
});
