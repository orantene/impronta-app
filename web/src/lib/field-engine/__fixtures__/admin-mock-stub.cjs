/* eslint-disable @typescript-eslint/no-require-imports */
// admin-mock-stub.cjs — CJS stub replacing @/lib/supabase/admin in tests.
//
// createServiceRoleClient() returns a mock Supabase client driven by
// global.__SURFACE_VIS_MOCK__.canonicalDecisions.
//
// Two queries _loadBridgedKeyDecisionsUncached makes:
//   1. profile_field_definitions SELECT … IN (canonicalKeys)  → from mock state
//   2. workspace_profile_field_settings SELECT … tenant_id=X  → always empty
//
// Tests control canonical decisions via:
//   global.__SURFACE_VIS_MOCK__.set({ height_cm: { isPublic, showInDirectory, is_sensitive?, admin_only? } })

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

function buildDefRowsFromMockState() {
  const mock = global.__SURFACE_VIS_MOCK__;
  if (!mock) return [];
  const rows = [];
  let counter = 1;
  for (const [oldKey, newKey] of Object.entries(OLD_TO_NEW_KEY)) {
    const dec = mock.canonicalDecisions.get(oldKey);
    if (!dec) continue;
    // Build a canonical row that effectiveFieldVisibility will interpret as
    // the desired isPublic / showInDirectory.
    //
    //   dec.is_sensitive=true   → is_sensitive=true  (admin floor regardless of default_visibility)
    //   dec.admin_only=true     → admin_only=true    (admin floor regardless of default_visibility)
    //   dec.isPublic=true       → default_visibility=["public"], no floor flags
    //   dec.isPublic=false      → default_visibility=[], admin_only=true (catch-all non-public)
    //
    // Using explicit flags from dec when provided; defaulting based on isPublic otherwise.
    const isSensitive  = dec.is_sensitive  ?? false;
    const isAdminOnly  = dec.admin_only   ?? (!dec.isPublic && !isSensitive);
    rows.push({
      id: `mock-def-${counter++}`,
      field_key: newKey,
      default_visibility: dec.isPublic ? ["public", "agency"] : [],
      admin_only: isAdminOnly,
      is_sensitive: isSensitive,
      show_in_public: dec.isPublic,
      show_in_directory: dec.showInDirectory,
      deprecated_at: null,
    });
  }
  return rows;
}

function buildQuery(rows) {
  let filtered = [...rows];
  const chain = {
    select() { return chain; },
    in(col, vals) {
      const s = new Set(vals);
      filtered = filtered.filter(r => s.has(r[col]));
      return chain;
    },
    eq(col, val) {
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
      // workspace_profile_field_settings: always empty (no tenant overrides needed in unit tests).
      return buildQuery([]);
    },
  };
}

module.exports = { createServiceRoleClient };
