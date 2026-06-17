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
    // taxonomy_terms is now fetched paged (`.range(...).order(...)`) because the
    // table exceeds the PostgREST 1000-row cap. The mock returns the whole
    // fixture on the first page; the loop stops since rows < page size.
    range: () => chain,
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
    // F1: labels now live in `*_i18n` jsonb maps (flat columns dropped by
    // migration 20260615211100); the loader resolves them via localizedValue.
    label_i18n: { en: "Stage name", es: "Nombre artístico" },
    helper_i18n: {},
    placeholder_i18n: {},
    tier: "universal",
    section: "identity",
    subsection: null,
    kind: "text",
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
    label_i18n: { en: "Height (cm)", es: "Estatura (cm)" },
    helper_i18n: { en: "Standing height in centimeters." },
    placeholder_i18n: { en: "e.g. 178" },
    tier: "type-specific",
    section: "measurements",
    subsection: "physical",
    kind: "number",
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

describe("loadFieldCatalog — F1: resolves label/helper/placeholder from *_i18n columns", () => {
  it("resolves human labels from label_i18n (not raw field keys)", async () => {
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
    // Before the fix this was `undefined` (read off the dropped flat column),
    // so the wizard/drawer rendered the raw key "measurements.heightMetric".
    assert.strictEqual(height.label, "Height (cm)", "label resolves from label_i18n.en");
    assert.strictEqual(height.helper, "Standing height in centimeters.", "helper resolves from helper_i18n.en");
    assert.strictEqual(height.placeholder, "e.g. 178", "placeholder resolves from placeholder_i18n.en");

    const stageName = catalog.find((f) => f.fieldKey === "identity.stageName");
    assert.ok(stageName);
    assert.strictEqual(stageName.label, "Stage name", "label resolves from label_i18n.en");
    assert.strictEqual(stageName.helper, null, "empty helper_i18n resolves to null");
    assert.strictEqual(stageName.placeholder, null, "empty placeholder_i18n resolves to null");
  });
});

// ─── Pure mapper unit tests (no Supabase mock) ────────────────────────────
describe("resolveFieldDefinition — pure row → ResolvedFieldDefinition mapping", () => {
  const baseRow = {
    id: "f1",
    field_key: "measurements.heightMetric",
    label_i18n: { en: "Height (cm)", es: "Estatura (cm)" },
    helper_i18n: { en: "Standing height." },
    placeholder_i18n: { en: "e.g. 178" },
    tier: "type-specific" as const,
    section: "measurements",
    subsection: "physical" as const,
    kind: "number" as const,
    options: null,
    is_optional: false,
    is_sensitive: false,
    default_visibility: ["public"],
    show_in_registration: true,
    show_in_edit_drawer: true,
    show_in_public: true,
    show_in_directory: false,
    admin_only: false,
    talent_editable: true,
    requires_review_on_change: false,
    is_searchable: true,
    count_min: null,
    display_order: 10,
    note: null,
    deprecated_at: null,
    render_mode: "catalog" as const,
    storage_mode: "field_values" as const,
  };

  it("resolves label/helper/placeholder from the i18n maps", async () => {
    const { resolveFieldDefinition } = await import("./profile-fields-service.js");
    const resolved = resolveFieldDefinition(baseRow, undefined, [], new Map());
    assert.strictEqual(resolved.label, "Height (cm)");
    assert.strictEqual(resolved.helper, "Standing height.");
    assert.strictEqual(resolved.placeholder, "e.g. 178");
  });

  it("workspace custom_label / custom_helper override the resolved i18n values", async () => {
    const { resolveFieldDefinition } = await import("./profile-fields-service.js");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const override: any = { field_definition_id: "f1", custom_label: "Tallness", custom_helper: "Custom guidance" };
    const resolved = resolveFieldDefinition(baseRow, override, [], new Map());
    assert.strictEqual(resolved.label, "Tallness", "custom_label wins over label_i18n");
    assert.strictEqual(resolved.helper, "Custom guidance", "custom_helper wins over helper_i18n");
  });

  it("falls back to field_key when label_i18n is empty (never blank)", async () => {
    const { resolveFieldDefinition } = await import("./profile-fields-service.js");
    const resolved = resolveFieldDefinition(
      { ...baseRow, label_i18n: {}, helper_i18n: {}, placeholder_i18n: {} },
      undefined,
      [],
      new Map(),
    );
    assert.strictEqual(resolved.label, "measurements.heightMetric", "empty label_i18n → field_key fallback");
    assert.strictEqual(resolved.helper, null);
    assert.strictEqual(resolved.placeholder, null);
  });
});
