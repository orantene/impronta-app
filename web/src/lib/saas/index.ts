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
  getPublicHostContext,
  resolveTenantFromHost,
  TENANT_COOKIE_NAME,
  TENANT_HEADER_NAME,
  type TenantScope,
  type PublicHostContext,
} from "./scope";

export {
  resolveTenantContext,
  HOST_CONTEXT_HEADER,
  HOST_NAME_HEADER,
  type HostContext,
} from "./host-context";

export {
  requireAdminTenantGuard,
  requireAdminTenantGuardOrThrow,
  requireStaffTenantAction,
  assertRowBelongsToTenant,
  resolveInquiryTenantForParticipant,
  type AdminTenantGuard,
  type StaffTenantActionGuard,
  type StaffTenantActionGuardFail,
} from "./admin-scope";

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
