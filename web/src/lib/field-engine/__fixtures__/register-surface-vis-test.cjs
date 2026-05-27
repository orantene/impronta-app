/* eslint-disable @typescript-eslint/no-require-imports */
// register-surface-vis-test.cjs — --require hook for public-surface-visibility.test.ts
//
// 1. Sets NEXT_RUNTIME='' so next/cache.unstable_cache is a no-op pass-through.
// 2. Installs global.__SURFACE_VIS_MOCK__ with helpers for the test to set
//    canonical decisions.
// 3. Redirects @/lib/supabase/admin imports to admin-mock-stub.cjs so
//    createServiceRoleClient() returns a mock client driven by the global state.

const Module = require('node:module');
const path = require('node:path');

// 1. Make next/cache a pass-through in test env.
process.env.NEXT_RUNTIME = '';

// 2. Global mock state.
//    canonicalDecisions: Map<legacyKey, BridgedKeyDecisionInput>
//    tenantOverrides:    Map<legacyKey, TenantOverrideRowInput>
//    The mock client returns profile_field_definitions rows + (Phase 2)
//    workspace_profile_field_settings rows derived from these maps.
global.__SURFACE_VIS_MOCK__ = {
  canonicalDecisions: new Map(),
  tenantOverrides:    new Map(),

  /**
   * Set canonical decisions for bridged keys.
   * Record shape:
   *   { [legacyKey]: {
   *       isPublic: boolean;
   *       showInDirectory: boolean;
   *       // Phase 2 sub-surface flags — default to showInDirectory / isPublic
   *       // when omitted, so pre-Phase 2 fixtures keep working unchanged.
   *       showInDirectoryFilter?: boolean;
   *       showInDirectoryCard?: boolean;
   *       showInPublicProfileSidebar?: boolean;
   *       is_sensitive?: boolean;
   *       admin_only?: boolean;
   *     }
   *   }
   */
  set(decisionsRecord) {
    this.canonicalDecisions = new Map(Object.entries(decisionsRecord));
  },

  /**
   * Phase 2: set workspace_profile_field_settings tenant override rows.
   * Record shape: { [legacyKey]: {
   *   enabled_override?, show_in_public_override?, show_in_directory_override?,
   *   admin_only_override?, default_visibility_override?,
   *   show_in_directory_filter_override?, show_in_directory_card_override?,
   *   show_in_public_profile_sidebar_override?,
   * }}
   * Only legacy keys also passed to `.set()` resolve to a real override row;
   * orphan overrides are silently dropped (matches DB FK semantics).
   */
  setTenantOverrides(overridesRecord) {
    this.tenantOverrides = new Map(Object.entries(overridesRecord));
  },

  /** Clear all injected decisions + overrides (reset to "no canonical data"). */
  clear() {
    this.canonicalDecisions = new Map();
    this.tenantOverrides    = new Map();
  },
};

// 3. Redirect @/lib/supabase/admin to mock stub.
const originalResolve = Module._resolveFilename;
const STUB_PATH = path.resolve(__dirname, 'admin-mock-stub.cjs');

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (
    request === '@/lib/supabase/admin' ||
    request.endsWith('/lib/supabase/admin') ||
    request.endsWith('/lib/supabase/admin.ts')
  ) {
    return STUB_PATH;
  }
  return originalResolve.call(this, request, parent, isMain, options);
};
