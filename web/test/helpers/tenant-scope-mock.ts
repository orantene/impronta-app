// test/helpers/tenant-scope-mock.ts — fixture for the tenant-scope
// boundary check that several admin-shell modules call at module init
// (see `src/lib/saas/scope.ts`).
//
// Pattern in a test file:
//
//   import { vi } from "vitest";
//   import { mockTenantScope } from "../helpers/tenant-scope-mock";
//   vi.mock("@/lib/saas/scope", () => mockTenantScope());
//
// The fixture supplies a fully populated tenant + role + plan so
// `meetsPlan(...)` / `meetsRole(...)` checks return true for whatever
// the component needs.

export function mockTenantScope(overrides: Partial<TenantScopeFixture> = {}) {
  const fixture: TenantScopeFixture = {
    tenantId: "tenant-test-001",
    tenantSlug: "test-tenant",
    tenantName: "Test Tenant",
    role: "owner",
    plan: "agency",
    ...overrides,
  };

  return {
    // The shape `@/lib/saas/scope` exposes — guarded so we don't accidentally
    // assert on private helpers.
    getTenantScope: () => fixture,
    getActiveTenantId: () => fixture.tenantId,
    getActiveTenantSlug: () => fixture.tenantSlug,
    requireTenantScope: () => fixture,
    isWithinTenantScope: () => true,
  };
}

export type TenantScopeFixture = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  role: "owner" | "admin" | "coordinator" | "editor";
  plan: "free" | "studio" | "agency" | "network";
};
