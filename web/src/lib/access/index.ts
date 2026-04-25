/**
 * Access module — single import surface for everything role / capability /
 * plan / limit / status.
 *
 * Replaces, over the course of Track B:
 *   - `lib/saas/capabilities.ts`            (legacy capability map)
 *   - `lib/site-admin/capabilities.ts`      (Phase 5 capability map)
 *   - `lib/auth-flow.ts` role helpers       (`isStaffRole`, `dashboardPathForRole`)
 *   - `lib/admin/plan-tiers.ts`             (TIER_LABEL / TIER_DOT / TIER_RENEW)
 *   - inline `app_role === ...` branches    (45+ files)
 *
 * Track C swaps `plan-catalog.ts`, `plan-capabilities.ts`, and
 * `plan-limits.ts` from TS mirrors to DB-backed reads. The API surface is
 * stable across that swap.
 */

export {
  CAPABILITIES,
  CAPABILITY_KEYS,
  CAPABILITY_CATEGORIES,
  isKnownCapability,
  getCapability,
  capabilityGating,
} from "./capabilities";
export type {
  CapabilityKey,
  CapabilityDef,
  CapabilityCategory,
  CapabilityScope,
  CapabilityGating,
} from "./capabilities";

export {
  TENANT_ROLE_KEYS,
  TENANT_ROLES,
  ROLE_CAPABILITIES,
  roleGrantsCapability,
  isKnownTenantRole,
} from "./roles";
export type { TenantRoleKey, TenantRoleDef } from "./roles";

export {
  PLATFORM_ROLE_KEYS,
  PLATFORM_ROLES,
  PLATFORM_ROLE_CAPABILITIES,
  platformRoleGrantsCapability,
  isKnownPlatformRole,
  getPlatformRole,
  isPlatformAdmin,
} from "./platform-role";
export type {
  PlatformRoleKey,
  PlatformRoleDef,
  ProfileForPlatformRole,
} from "./platform-role";

export {
  STATUS_KEYS,
  STATUS_RULES,
  SERVABLE_STATUSES,
  isKnownStatus,
  isStatusEnforced,
  isServableStatus,
} from "./status-rules";
export type { StatusKey, StatusBehavior } from "./status-rules";

export {
  PLAN_KEYS,
  PLAN_CATALOG,
  isKnownPlan,
  getPlan,
  getVisiblePlans,
  getUpgradePathFromPlan,
} from "./plan-catalog";
export type { PlanKey, PlanDef } from "./plan-catalog";

export {
  LIMIT_KEYS,
  LIMITS,
  PLAN_LIMITS,
  isKnownLimit,
  planLimit,
} from "./plan-limits";
export type { LimitKey, LimitDef } from "./plan-limits";

export {
  PLAN_CAPABILITIES,
  planGrantsCapability,
} from "./plan-capabilities";

export {
  authorize,
  userHasCapability,
  requireCapability,
  AccessDeniedError,
} from "./has-capability";
export type {
  AuthorizeResult,
  AuthorizeDenialReason,
} from "./has-capability";

export {
  tenantLimit,
  tenantUsage,
  tenantLimitRemaining,
  assertWithinLimit,
  OverLimitError,
} from "./tenant-limit";

export {
  landingPath,
  isStaffSurfaceRole,
} from "./landing-path";
export type {
  LandingProfile,
  LandingPathInput,
  LandingDestination,
} from "./landing-path";
