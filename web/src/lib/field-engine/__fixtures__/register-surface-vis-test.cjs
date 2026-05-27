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
//    canonicalDecisions: Map<legacyKey, { isPublic: boolean; showInDirectory: boolean }>
//    The mock client returns profile_field_definitions rows derived from this,
//    with empty workspace_profile_field_settings (no tenant overrides).
global.__SURFACE_VIS_MOCK__ = {
  canonicalDecisions: new Map(),

  /**
   * Set canonical decisions for bridged keys.
   * Record shape: { [legacyKey]: { isPublic: boolean; showInDirectory: boolean } }
   */
  set(decisionsRecord) {
    this.canonicalDecisions = new Map(Object.entries(decisionsRecord));
  },

  /** Clear all injected decisions (reset to "no canonical data = safe-fail"). */
  clear() {
    this.canonicalDecisions = new Map();
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
