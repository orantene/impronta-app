/* eslint-disable @typescript-eslint/no-require-imports */
// admin-mock-stub.cjs — CJS stub replacing @/lib/supabase/admin in tests.
//
// createServiceRoleClient() returns a mock Supabase client driven by
// global.__SURFACE_VIS_MOCK__.canonicalDecisions.
//
// Two queries _loadBridgedKeyDecisionsUncached makes:
//   1. profile_field_definitions SELECT … IN (canonicalKeys)  → from mock state
//   2. workspace_profile_field_settings SELECT … tenant_id=X  → from mock state
//
// Tests control canonical decisions via:
//   global.__SURFACE_VIS_MOCK__.set({
//     height_cm: { isPublic, showInDirectory, showInDirectoryFilter?,
//                  showInDirectoryCard?, showInPublicProfileSidebar?,
//                  is_sensitive?, admin_only? }
//   })
// Phase 2: if the per-sub-surface flags are omitted they default to
// `showInDirectory` (filter+card) and `isPublic` (sidebar) so pre-Phase 2
// fixtures keep working without a forced rewrite of every test.
//
// Tenant overrides (workspace_profile_field_settings) are controlled via
// global.__SURFACE_VIS_MOCK__.setTenantOverrides — installed alongside
// `.set` in register-surface-vis-test.cjs.

const OLD_TO_NEW_KEY = {
  "body_type":               "physical.body_type",
  "clothing_size":           "physical.dress_size",
  "date_of_birth":           "identity.dob",
  "eye_color":               "physical.eye_color",
  "hair_color":              "physical.hair_color",
  "hair_length":             "physical.hair_length",
  "height_cm":               "physical.height_cm",
  "shoe_size":               "physical.shoe_size_eu",
  "years_experience":        "experience.years_total",
  "experience_level":        "experience.level",
  "notable_work":            "experience.notable_work",
  "professional_highlights": "experience.professional_highlights",
  "availability_status":     "availability.status",
  "available_for":           "availability.available_for",
  "willing_to_travel":       "travel.willing",
  "travel_scope":            "travel.scope",
  "website_url":             "media.website_url",
};

// Phase 2 Sub-Task 0.5: seven section-gate keys whose canonical row was
// added by migration 20260527063534. `gender` namespaces to
// `identity.gender`; the other six are self-mapping. Must stay in sync
// with TAXONOMY_SECTION_CANONICAL_KEYS in public-surface-visibility.ts.
const TAXONOMY_SECTION_CANONICAL_KEYS = {
  fit_labels:  "fit_labels",
  industries:  "industries",
  event_types: "event_types",
  tags:        "tags",
  skills:      "skills",
  languages:   "languages",
  gender:      "identity.gender",
};

const ALL_BRIDGED_KEYS = { ...OLD_TO_NEW_KEY, ...TAXONOMY_SECTION_CANONICAL_KEYS };

function buildDefRowsFromMockState() {
  const mock = global.__SURFACE_VIS_MOCK__;
  if (!mock) return [];
  const rows = [];
  let counter = 1;
  for (const [legacyKey, canonicalKey] of Object.entries(ALL_BRIDGED_KEYS)) {
    const dec = mock.canonicalDecisions.get(legacyKey);
    if (!dec) continue;
    const isSensitive = dec.is_sensitive ?? false;
    const isAdminOnly = dec.admin_only   ?? (!dec.isPublic && !isSensitive);
    rows.push({
      id: `mock-def-${counter++}`,
      field_key: canonicalKey,
      default_visibility: dec.isPublic ? ["public", "agency"] : [],
      admin_only: isAdminOnly,
      is_sensitive: isSensitive,
      show_in_public: dec.isPublic,
      show_in_directory: dec.showInDirectory,
      show_in_directory_filter:
        dec.showInDirectoryFilter ?? dec.showInDirectory ?? false,
      show_in_directory_card:
        dec.showInDirectoryCard ?? dec.showInDirectory ?? false,
      show_in_public_profile_sidebar:
        dec.showInPublicProfileSidebar ?? dec.isPublic ?? false,
      deprecated_at: null,
    });
  }
  return rows;
}

function buildTenantOverrideRowsFromMockState() {
  const mock = global.__SURFACE_VIS_MOCK__;
  if (!mock || !mock.tenantOverrides || mock.tenantOverrides.size === 0) return [];
  const defRows = buildDefRowsFromMockState();
  const defIdByCanonicalKey = new Map(defRows.map((r) => [r.field_key, r.id]));
  const rows = [];
  for (const [legacyKey, override] of mock.tenantOverrides.entries()) {
    const canonicalKey = ALL_BRIDGED_KEYS[legacyKey];
    const fieldDefinitionId = defIdByCanonicalKey.get(canonicalKey);
    if (!fieldDefinitionId) continue;
    rows.push({
      // tenant_id is intentionally absent: callers test the helper's
      // logic against one tenant at a time (mock represents that
      // tenant's overrides). The mock chain's .eq("tenant_id", X) is a
      // no-op for this column — the test harness models tenant scoping
      // by clearing + re-setting overrides per tenant (see § 12 in
      // public-surface-visibility.test.ts).
      field_definition_id: fieldDefinitionId,
      enabled_override: override.enabled_override ?? null,
      show_in_public_override: override.show_in_public_override ?? null,
      show_in_directory_override: override.show_in_directory_override ?? null,
      admin_only_override: override.admin_only_override ?? null,
      default_visibility_override: override.default_visibility_override ?? null,
      show_in_directory_filter_override:
        override.show_in_directory_filter_override ?? null,
      show_in_directory_card_override:
        override.show_in_directory_card_override ?? null,
      show_in_public_profile_sidebar_override:
        override.show_in_public_profile_sidebar_override ?? null,
    });
  }
  return rows;
}

function buildQuery(rows, { ignoreColumns = new Set() } = {}) {
  let filtered = [...rows];
  const chain = {
    select() { return chain; },
    in(col, vals) {
      const s = new Set(vals);
      filtered = filtered.filter(r => s.has(r[col]));
      return chain;
    },
    eq(col, val) {
      if (ignoreColumns.has(col)) return chain;
      filtered = filtered.filter(r => r[col] === val);
      return chain;
    },
    then(resolve) {
      return resolve({ data: filtered, error: null });
    },
  };
  return chain;
}

function createServiceRoleClient() {
  return {
    from(table) {
      if (table === 'profile_field_definitions') {
        return buildQuery(buildDefRowsFromMockState());
      }
      if (table === 'workspace_profile_field_settings') {
        // tenant_id eq() is a no-op — the harness models tenant scoping
        // via .setTenantOverrides({}) flushes per tenant (see test § 12).
        return buildQuery(buildTenantOverrideRowsFromMockState(), {
          ignoreColumns: new Set(['tenant_id']),
        });
      }
      return buildQuery([]);
    },
  };
}

module.exports = { createServiceRoleClient };
