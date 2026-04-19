export {
  LEGACY_TENANT_ID,
  getCurrentUserTenants,
  requireStaffOfTenant,
  findTenantMembership,
  type MembershipRole,
  type MembershipStatus,
  type TenantMembership,
} from "./tenant";

export {
  hasCapability,
  requireCapability,
  roleHasCapability,
  type Capability,
} from "./capabilities";

export {
  getTenantScope,
  requireTenantScope,
  getScopedTenantId,
  resolveTenantFromHost,
  TENANT_COOKIE_NAME,
  TENANT_HEADER_NAME,
  type TenantScope,
} from "./scope";
