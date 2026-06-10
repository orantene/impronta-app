/**
 * Tests for profile-fields-service.ts
 *
 * Critical: regression test for the P2 bug fix where loadFieldCatalog()
 * returned appliesTo: [] / requiredFor: [] / recommendedFor: [] for every
 * type-specific field, because the PostgREST embedded join
 * `taxonomy_terms(slug)` did not resolve at runtime.
 *
 * The fix fetches taxonomy_terms in a separate query and joins by
 * taxonomy_term_id in code. These tests verify that appliesTo,
 * requiredFor, and recommendedFor are correctly populated.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ─── Minimal Supabase mock ────────────────────────────────────────────
// We mock at the query level — each .from() returns a chainable builder
// that resolves to the provided fixture data.

type MockResult<T> = { data: T | null; error: null };

function makeChain<T>(result: MockResult<T>) {
  const chain = {
    select: () => chain,
    is: () => chain,
    order: () => chain,
    eq: () => chain,
    in: () => chain,
    then: (resolve: (v: MockResult<T>) => void) => {
      resolve(result);
    },
  };
  // Make it thenable so `await supabase.from(...).select(...)...` resolves.
  // Also allow it to be used as a Promise directly.
  return Object.assign(
    Promise.resolve(result),
    chain,
  );
}

/** Build a minimal mock supabase client for the catalog service. */
function buildMockClient(fixtures: {
  profile_field_definitions: object[];
  profile_field_recommendations: Array<{ field_definition_id: string; taxonomy_term_id: string; relationship: string }>;
  taxonomy_terms_slugs: Array<{ id: string; slug: string }>;
}) {
  return {
    from(table: string) {
      switch (table) {
        case "profile_field_definitions":
          return makeChain({ data: fixtures.profile_field_definitions, error: null });
        case "profile_field_recommendations":
          return makeChain({ data: fixtures.profile_field_recommendations, error: null });
        case "taxonomy_terms":
          // The service now fetches taxonomy_terms with select("id, slug")
          // for the slug lookup, and separately with "id, parent_id, is_active"
          // for tenant filtering (only called when tenantId is set).
          return makeChain({ data: fixtures.taxonomy_terms_slugs, error: null });
        default:
          return makeChain({ data: [], error: null });
      }
    },
  };
}

// ─── Fixtures ─────────────────────────────────────────────────────────

const TERM_ID_MODELS = "term-models-uuid";
const TERM_ID_HOSTS = "term-hosts-uuid";
const FIELD_DEF_ID_HEIGHT = "field-height-uuid";
const FIELD_DEF_ID_STAGENAME = "field-stagename-uuid";

const mockDefs = [
  {
    id: FIELD_DEF_ID_STAGENAME,
    field_key: "identity.stageName",
    label: "Stage name",
    tier: "universal",
    section: "identity",
    subsection: null,
    kind: "text",
    placeholder: null,
    helper: null,
    options: null,
    is_optional: false,
    is_sensitive: false,
    default_visibility: ["public", "agency"],
    show_in_registration: true,
    show_in_edit_drawer: true,
    show_in_public: true,
    show_in_directory: false,
    admin_only: false,
    talent_editable: true,
    requires_review_on_change: false,
    is_searchable: true,
    count_min: null,
    display_order: 1,
    note: null,
    deprecated_at: null,
    render_mode: "catalog",
    storage_mode: "dedicated",
  },
  {
    id: FIELD_DEF_ID_HEIGHT,
    field_key: "measurements.heightMetric",
    label: "Height (cm)",
    tier: "type-specific",
    section: "measurements",
    subsection: "physical",
    kind: "number",
    placeholder: null,
    helper: null,
    options: null,
    is_optional: false,
    is_sensitive: false,
    default_visibility: ["public", "agency"],
    show_in_registration: true,
    show_in_edit_drawer: true,
    show_in_public: true,
    show_in_directory: false,
    admin_only: false,
    talent_editable: true,
    requires_review_on_change: false,
    is_searchable: true,
    count_min: null,
    display_order: 50,
    note: null,
    deprecated_at: null,
    render_mode: "catalog",
    storage_mode: "field_values",
  },
];

const mockRecs = [
  // height applies to models
  { field_definition_id: FIELD_DEF_ID_HEIGHT, taxonomy_term_id: TERM_ID_MODELS, relationship: "applies" },
  // height is required for models
  { field_definition_id: FIELD_DEF_ID_HEIGHT, taxonomy_term_id: TERM_ID_MODELS, relationship: "required" },
  // height is recommended for hosts
  { field_definition_id: FIELD_DEF_ID_HEIGHT, taxonomy_term_id: TERM_ID_HOSTS, relationship: "recommended" },
];

const mockTermSlugs = [
  { id: TERM_ID_MODELS, slug: "models" },
  { id: TERM_ID_HOSTS, slug: "hosts" },
];

// ─── Tests ────────────────────────────────────────────────────────────

describe("loadFieldCatalog — appliesTo / requiredFor / recommendedFor bug fix", () => {
  it("resolves appliesTo from taxonomy_term_id via separate query (not embedded join)", async () => {
    // Dynamically import so module resolution works with the test runner.
    const { loadFieldCatalog } = await import("./profile-fields-service.js");
    const client = buildMockClient({
      profile_field_definitions: mockDefs,
      profile_field_recommendations: mockRecs,
      taxonomy_terms_slugs: mockTermSlugs,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const catalog = await loadFieldCatalog(client as any);

    const height = catalog.find((f) => f.fieldKey === "measurements.heightMetric");
    assert.ok(height, "heightMetric field should be in catalog");

    // Before the fix, these were all [] because the embedded join failed.
    assert.deepStrictEqual(
      [...height.appliesTo].sort(),
      ["models"],
      "appliesTo should resolve via taxonomy_term_id → slug map",
    );
    assert.deepStrictEqual(
      [...height.requiredFor].sort(),
      ["models"],
      "requiredFor should resolve via taxonomy_term_id → slug map",
    );
    assert.deepStrictEqual(
      [...height.recommendedFor].sort(),
      ["hosts"],
      "recommendedFor should resolve via taxonomy_term_id → slug map",
    );
  });

  it("universal fields with no recommendations have empty applicability arrays", async () => {
    const { loadFieldCatalog } = await import("./profile-fields-service.js");
    const client = buildMockClient({
      profile_field_definitions: mockDefs,
      profile_field_recommendations: mockRecs,
      taxonomy_terms_slugs: mockTermSlugs,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const catalog = await loadFieldCatalog(client as any);

    const stageName = catalog.find((f) => f.fieldKey === "identity.stageName");
    assert.ok(stageName, "stageName field should be in catalog");
    assert.deepStrictEqual(stageName.appliesTo, []);
    assert.deepStrictEqual(stageName.requiredFor, []);
    assert.deepStrictEqual(stageName.recommendedFor, []);
  });

  it("returns fields even when taxonomy_terms query returns empty (no slugs resolved)", async () => {
    const { loadFieldCatalog } = await import("./profile-fields-service.js");
    const client = buildMockClient({
      profile_field_definitions: mockDefs,
      profile_field_recommendations: mockRecs,
      taxonomy_terms_slugs: [], // no slugs — appliesTo arrays should be empty, not throw
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const catalog = await loadFieldCatalog(client as any);
    assert.ok(catalog.length > 0, "catalog should still return fields");

    const height = catalog.find((f) => f.fieldKey === "measurements.heightMetric");
    assert.ok(height, "heightMetric field should be in catalog");
    // With no slug resolution, all arrays empty — graceful degradation.
    assert.deepStrictEqual(height.appliesTo, []);
    assert.deepStrictEqual(height.requiredFor, []);
    assert.deepStrictEqual(height.recommendedFor, []);
  });
});
