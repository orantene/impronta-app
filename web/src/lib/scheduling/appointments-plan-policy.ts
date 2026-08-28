/**
 * Plan ceiling for appointments. Cloned from BUILDER_PLAN_POLICY's shape —
 * a closed record, fail-closed on unknown tiers. Does NOT touch
 * plan-capabilities.ts (still permissive).
 *
 *   free     → M1 (request)
 *   website  → M2 (instant, pay later)
 *   studio   → M4 (full prepaid)
 *   agency / network / hub-network → M4 + sync + multiStaff + recurring
 */

export const APPOINTMENT_MODES = [
  "off",
  "request",
  "instant",
  "deposit",
  "full",
] as const;

export type AppointmentMode = (typeof APPOINTMENT_MODES)[number];

const MODE_RANK: Record<AppointmentMode, number> = {
  off: 0,
  request: 1,
  instant: 2,
  deposit: 3,
  full: 4,
};

export function appointmentModeRank(mode: AppointmentMode): number {
  return MODE_RANK[mode];
}

export function minAppointmentMode(a: AppointmentMode, b: AppointmentMode): AppointmentMode {
  return MODE_RANK[a] <= MODE_RANK[b] ? a : b;
}

export type AppointmentsPlanPolicy = {
  plan: string;
  maxMode: AppointmentMode;
  calendarSync: boolean;
  multiStaff: boolean;
  recurring: boolean;
};

const CLOSED: AppointmentsPlanPolicy = {
  plan: "unknown",
  maxMode: "off",
  calendarSync: false,
  multiStaff: false,
  recurring: false,
};

const APPOINTMENTS_PLAN_POLICY: Record<string, AppointmentsPlanPolicy> = {
  free: {
    plan: "free",
    maxMode: "request",
    calendarSync: false,
    multiStaff: false,
    recurring: false,
  },
  website: {
    plan: "website",
    maxMode: "instant",
    calendarSync: false,
    multiStaff: false,
    recurring: false,
  },
  studio: {
    plan: "studio",
    maxMode: "full",
    calendarSync: false,
    multiStaff: false,
    recurring: false,
  },
  agency: {
    plan: "agency",
    maxMode: "full",
    calendarSync: true,
    multiStaff: true,
    recurring: true,
  },
  network: {
    plan: "network",
    maxMode: "full",
    calendarSync: true,
    multiStaff: true,
    recurring: true,
  },
  "hub-network": {
    plan: "hub-network",
    maxMode: "full",
    calendarSync: true,
    multiStaff: true,
    recurring: true,
  },
};

export function getAppointmentsPlanPolicy(
  planTier: string | null | undefined,
): AppointmentsPlanPolicy {
  if (typeof planTier !== "string") return CLOSED;
  const key = planTier.trim().toLowerCase();
  return APPOINTMENTS_PLAN_POLICY[key] ?? CLOSED;
}
