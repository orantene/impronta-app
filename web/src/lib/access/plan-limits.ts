/**
 * Plan limits (TS mirror of future `plan_limits` table).
 *
 * Phase 1 mirrors the existing hardcoded `SEAT_LIMITS` in
 * `web/src/app/(dashboard)/admin/account/billing-actions.ts`. Other limits
 * (`max_active_talent`, `max_custom_domains`, `max_locales`,
 * `max_custom_fields`) are scaffolded but currently unenforced — they
 * become real once Track C ships the DB table and limit-consuming actions
 * call `assertWithinLimit(limitKey, tenantId)`.
 *
 * Null = unlimited.
 */

import { PLAN_KEYS, type PlanKey } from "./plan-catalog";

export const LIMIT_KEYS = [
  "max_team_seats",
  "max_active_talent",
  "max_custom_domains",
  "max_locales",
  "max_custom_fields",
] as const;

export type LimitKey = (typeof LIMIT_KEYS)[number];

export type LimitDef = {
  key: LimitKey;
  displayName: string;
  description: string;
};

export const LIMITS: Record<LimitKey, LimitDef> = {
  max_team_seats: {
    key: "max_team_seats",
    displayName: "Team seats",
    description: "Maximum number of active members in the workspace.",
  },
  max_active_talent: {
    key: "max_active_talent",
    displayName: "Active talent profiles",
    description: "Maximum number of talent profiles that can be active at once.",
  },
  max_custom_domains: {
    key: "max_custom_domains",
    displayName: "Custom domains",
    description: "Maximum number of custom domains attached to the workspace.",
  },
  max_locales: {
    key: "max_locales",
    displayName: "Languages",
    description: "Maximum number of languages your site can be translated into.",
  },
  max_custom_fields: {
    key: "max_custom_fields",
    displayName: "Custom fields",
    description: "Maximum number of custom talent attributes you can define.",
  },
};

/**
 * Per-plan limits. Mirrors `SEAT_LIMITS` from billing-actions.ts for
 * `max_team_seats`. Other limits start permissive (null = unlimited) and
 * are tightened during Track C alongside the DB migration.
 */
export const PLAN_LIMITS: Record<PlanKey, Record<LimitKey, number | null>> = {
  free: {
    max_team_seats: 2,
    max_active_talent: null,
    max_custom_domains: null,
    max_locales: null,
    max_custom_fields: null,
  },
  studio: {
    max_team_seats: 10,
    max_active_talent: null,
    max_custom_domains: null,
    max_locales: null,
    max_custom_fields: null,
  },
  agency: {
    max_team_seats: 25,
    max_active_talent: null,
    max_custom_domains: null,
    max_locales: null,
    max_custom_fields: null,
  },
  network: {
    max_team_seats: null,
    max_active_talent: null,
    max_custom_domains: null,
    max_locales: null,
    max_custom_fields: null,
  },
  legacy: {
    max_team_seats: null,
    max_active_talent: null,
    max_custom_domains: null,
    max_locales: null,
    max_custom_fields: null,
  },
  // Talent-audience plans — solo workspaces (single-member, single-talent).
  // max_team_seats=1 by definition; max_active_talent=1 (themselves).
  // max_custom_domains gates the Portfolio tier.
  talent_basic: {
    max_team_seats: 1,
    max_active_talent: 1,
    max_custom_domains: 0,
    max_locales: 1,
    max_custom_fields: 0,
  },
  talent_pro: {
    max_team_seats: 1,
    max_active_talent: 1,
    max_custom_domains: 0,
    max_locales: 1,
    max_custom_fields: 0,
  },
  talent_portfolio: {
    max_team_seats: 1,
    max_active_talent: 1,
    max_custom_domains: 1,
    max_locales: 2,
    max_custom_fields: 0,
  },
};

export function isKnownLimit(key: string): key is LimitKey {
  return (LIMIT_KEYS as readonly string[]).includes(key);
}

export function planLimit(plan: PlanKey, limitKey: LimitKey): number | null {
  return PLAN_LIMITS[plan][limitKey];
}
