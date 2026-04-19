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
  getPublicTenantScope,
  resolveTenantFromHost,
  TENANT_COOKIE_NAME,
  TENANT_HEADER_NAME,
  type TenantScope,
} from "./scope";

export {
  parseTenantHostname,
  getDefaultRootDomain,
  type TenantHostnameMatch,
} from "./hostname";

export {
  resolveTenantRouting,
  type TenantRoutingResult,
} from "./tenant-routing";

export {
  submitRepresentationRequest,
  pickUpRepresentationRequest,
  approveRepresentationRequest,
  rejectRepresentationRequest,
  withdrawRepresentationRequest,
  canReviewRepresentationRequest,
  type RepresentationRequestRow,
  type RepresentationRequestStatus,
  type RepresentationTargetType,
} from "./representation-requests";
