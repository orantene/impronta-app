/**
 * resolveAppointmentPolicy — layered appointments settings.
 *
 * PURE. Clones resolveCommercialTerms semantics:
 *   platform → tenant → hours / booking_terms → offering (most specific)
 *
 * Enablement is AND-gated like instantBookEnabled: the tenant master switch
 * must be on, and a person-profile must opt in. Resource profiles skip the
 * talent opt-in (they have no login). Existing tenants stay on M0 because
 * tenant.enabled defaults false.
 */

import { parseBookingHours, type BookingHours } from "./hours-types";
import {
  type AppointmentMode,
  getAppointmentsPlanPolicy,
  minAppointmentMode,
  type AppointmentsPlanPolicy,
} from "./appointments-plan-policy";
import {
  parseTerminologyId,
  type TerminologyId,
} from "./terminology";
import { isValidIanaTimeZone } from "./tz";

export type PlatformAppointmentDefaults = {
  enabled: boolean;
  terminology: TerminologyId;
  timezone: string;
  allowTalentDirectBooking: boolean;
};

export type TenantAppointmentSettings = {
  enabled: boolean;
  terminology?: TerminologyId | null;
  timezone?: string | null;
  allowTalentDirectBooking?: boolean | null;
  talentDirectBookingOptIn?: boolean | null;
};

export type TalentAppointmentPrefs = {
  /** Person-profile opt-in. Ignored when profileKind === "resource". */
  directBookingOptIn?: boolean | null;
  timezone?: string | null;
  profileKind?: "person" | "resource" | null;
};

export type OfferingAppointmentLayer = {
  bookingMode?: "request" | "instant" | null;
  reserveMode?: "full" | "deposit" | "free" | null;
  durationMinutes?: number | null;
};

export type ResolvedAppointmentPolicy = {
  enabled: boolean;
  terminology: TerminologyId;
  timezone: string;
  durationMinutes: number;
  hours: BookingHours | null;
  requestedMode: AppointmentMode;
  maxMode: AppointmentMode;
  effectiveMode: AppointmentMode;
  plan: AppointmentsPlanPolicy;
  resolvedFrom: "platform_default" | "tenant_override" | "hours" | "offering";
};

const PLATFORM_FALLBACK: PlatformAppointmentDefaults = {
  enabled: false,
  terminology: "reservations",
  timezone: "UTC",
  allowTalentDirectBooking: false,
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function modeFromOffering(offering: OfferingAppointmentLayer | null): AppointmentMode {
  if (!offering) return "request";
  if (offering.bookingMode === "instant") {
    if (offering.reserveMode === "deposit") return "deposit";
    if (offering.reserveMode === "full") return "full";
    return "instant";
  }
  return "request";
}

function durationOrDefault(v: number | null | undefined): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v > 480) return 60;
  return Math.trunc(v);
}

export type BookingSurface = "workspace_site" | "own_page" | "hub";

export type SurfaceGateInput = {
  surface: BookingSurface;
  tenantEnabled: boolean;
  /** Tenant allowTalentDirectBooking OR roster.direct_booking_enabled. */
  allowDirect: boolean;
  talentOptIn: boolean;
  isResource: boolean;
  /** Confirmed exclusive primary (`rowIsExclusive`). */
  isExclusive?: boolean | null;
  /** This workspace_site IS the exclusive primary's own site. */
  isExclusivePrimarySite?: boolean | null;
  externalBookingReleased?: boolean | null;
  /**
   * Active + site_visible roster on this channel tenant.
   * Undefined = not checked (keeps pre-W2 tests / callers identical).
   */
  rosterSiteVisible?: boolean | null;
  /** Hub: active + hub_visibility_status=approved on the hub tenant. */
  hubRosterOk?: boolean | null;
  /** Result of hubMayListTalent. Undefined on hub fails closed. */
  hubMayList?: boolean | null;
};

/**
 * Surface-aware actor gate. `workspace_site` without the new exclusivity /
 * roster flags reproduces the P1 actorAllowed AND-gate exactly.
 */
export function resolveSurfaceGate(input: SurfaceGateInput): { allowed: boolean } {
  const labor = input.isResource || input.talentOptIn === true;
  const exclusiveBlocksExternal =
    input.isExclusive === true &&
    input.isExclusivePrimarySite !== true &&
    input.externalBookingReleased !== true;

  switch (input.surface) {
    case "workspace_site": {
      if (!input.tenantEnabled) return { allowed: false };
      if (!labor) return { allowed: false };
      if (!input.isResource && !input.allowDirect) return { allowed: false };
      if (input.rosterSiteVisible === false) return { allowed: false };
      if (exclusiveBlocksExternal) return { allowed: false };
      return { allowed: true };
    }
    case "own_page": {
      if (!labor) return { allowed: false };
      if (exclusiveBlocksExternal) return { allowed: false };
      return { allowed: true };
    }
    case "hub": {
      if (!input.tenantEnabled) return { allowed: false };
      if (!labor) return { allowed: false };
      if (input.hubRosterOk !== true) return { allowed: false };
      if (input.hubMayList !== true) return { allowed: false };
      if (exclusiveBlocksExternal) return { allowed: false };
      return { allowed: true };
    }
  }
}

export function resolveAppointmentPolicy(input: {
  platform?: PlatformAppointmentDefaults | null;
  tenant: TenantAppointmentSettings | null;
  talent?: TalentAppointmentPrefs | null;
  hours?: unknown;
  offering?: OfferingAppointmentLayer | null;
  planTier?: string | null;
  /** Per-roster-row agency gate. ORs with tenant.allowTalentDirectBooking. */
  rosterDirectBooking?: boolean | null;
  surface?: BookingSurface | null;
  isExclusive?: boolean | null;
  isExclusivePrimarySite?: boolean | null;
  externalBookingReleased?: boolean | null;
  rosterSiteVisible?: boolean | null;
  hubRosterOk?: boolean | null;
  hubMayList?: boolean | null;
}): ResolvedAppointmentPolicy {
  const platform = input.platform ?? PLATFORM_FALLBACK;
  const tenant = input.tenant;
  const talent = input.talent ?? null;
  const offering = input.offering ?? null;
  const plan = getAppointmentsPlanPolicy(input.planTier);

  const hours = parseBookingHours(input.hours);

  let terminology: TerminologyId = platform.terminology;
  let timezone = platform.timezone;
  let resolvedFrom: ResolvedAppointmentPolicy["resolvedFrom"] = "platform_default";

  if (tenant?.terminology) {
    terminology = parseTerminologyId(tenant.terminology);
    resolvedFrom = "tenant_override";
  }
  if (typeof tenant?.timezone === "string" && isValidIanaTimeZone(tenant.timezone)) {
    timezone = tenant.timezone;
    resolvedFrom = "tenant_override";
  }
  if (hours) {
    timezone = hours.timezone;
    resolvedFrom = "hours";
  }
  if (typeof talent?.timezone === "string" && isValidIanaTimeZone(talent.timezone)) {
    timezone = talent.timezone;
  }

  const durationMinutes = durationOrDefault(
    offering?.durationMinutes ?? hours?.slotMinutes ?? null,
  );
  if (offering?.durationMinutes != null) resolvedFrom = "offering";

  const requestedMode = modeFromOffering(offering);
  const maxMode = plan.maxMode;
  const effectiveMode = minAppointmentMode(requestedMode, maxMode);

  const tenantEnabled = tenant == null ? platform.enabled : tenant.enabled === true;
  const workspaceAllow =
    tenant == null
      ? platform.allowTalentDirectBooking
      : tenant.allowTalentDirectBooking === true;
  const allowDirect = workspaceAllow || input.rosterDirectBooking === true;
  const isResource = talent?.profileKind === "resource";
  const talentOptIn = talent?.directBookingOptIn === true;

  // Resource profiles skip talent opt-in (no login). Person profiles need the
  // agency AND-gate (workspace fallback OR per-roster-row) and their own opt-in.
  // Default surface is workspace_site so existing callers keep P1 behavior.
  const actorAllowed = resolveSurfaceGate({
    surface: input.surface ?? "workspace_site",
    tenantEnabled,
    allowDirect,
    talentOptIn,
    isResource,
    isExclusive: input.isExclusive,
    isExclusivePrimarySite: input.isExclusivePrimarySite,
    externalBookingReleased: input.externalBookingReleased,
    rosterSiteVisible: input.rosterSiteVisible,
    hubRosterOk: input.hubRosterOk,
    hubMayList: input.hubMayList,
  }).allowed;
  const reallyEnabled = actorAllowed && effectiveMode !== "off";

  return {
    enabled: reallyEnabled,
    terminology,
    timezone,
    durationMinutes,
    hours,
    requestedMode,
    maxMode,
    effectiveMode: reallyEnabled ? effectiveMode : "off",
    plan,
    resolvedFrom,
  };
}

/**
 * Parse agencies.settings.appointments (or the whole settings object).
 * Missing / garbage → null so the resolver falls through to platform defaults.
 */
export function parseTenantAppointmentSettings(raw: unknown): TenantAppointmentSettings | null {
  if (!isPlainObject(raw)) return null;
  const node = isPlainObject(raw.appointments) ? raw.appointments : raw;
  if (!isPlainObject(node)) return null;
  if (typeof node.enabled !== "boolean" && node.enabled !== "true" && node.enabled !== "false") {
    // An empty object is still a tenant row with enabled defaulting false.
    if (Object.keys(node).length === 0) return { enabled: false };
  }
  const enabled = node.enabled === true;
  return {
    enabled,
    terminology: node.terminology != null ? parseTerminologyId(node.terminology) : null,
    timezone: typeof node.timezone === "string" ? node.timezone : null,
    allowTalentDirectBooking:
      typeof node.allowTalentDirectBooking === "boolean"
        ? node.allowTalentDirectBooking
        : null,
  };
}
