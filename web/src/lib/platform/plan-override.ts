/**
 * Workspace plan-override — shared types + pure helpers.
 *
 * A plan override is a platform-admin-issued temporary plan grant
 * (comp / trial / promo). The effective plan is mirrored onto
 * `agencies.plan_tier`; `workspace_plan_overrides` is the audit + reversal
 * record. See migration `20260924000000_workspace_plan_overrides.sql`.
 *
 * This module is pure (no server-only imports) so the drawer/table UI and
 * the server actions can both use it.
 */

import { PLAN_SEAT_CAPS } from "@/lib/saas/plan-seat-caps";

export type WorkspacePlanTier =
  | "free"
  | "website"
  | "studio"
  | "agency"
  | "network";

export const WORKSPACE_PLAN_TIERS: readonly WorkspacePlanTier[] = [
  "free",
  "website",
  "studio",
  "agency",
  "network",
] as const;

export function isWorkspacePlanTier(value: unknown): value is WorkspacePlanTier {
  return (
    typeof value === "string" &&
    (WORKSPACE_PLAN_TIERS as readonly string[]).includes(value)
  );
}

export const PLAN_TIER_LABEL: Record<WorkspacePlanTier, string> = {
  free: "Free",
  website: "Website",
  studio: "Studio",
  agency: "Agency",
  network: "Network",
};

/**
 * Standard talent seat limit per tier. Same table as `PLAN_SEAT_CAPS` —
 * do not restate numbers here. Comp/trial overrides stamp this onto
 * `agencies.talent_seat_limit`.
 */
export const PLAN_TIER_SEAT_LIMIT: Record<WorkspacePlanTier, number | null> =
  PLAN_SEAT_CAPS;

/** Display rank for "is this an upgrade?" comparisons. */
export const PLAN_TIER_RANK: Record<WorkspacePlanTier, number> = {
  free: 0,
  website: 1,
  studio: 2,
  agency: 3,
  network: 4,
};

// ─── Override durations ───────────────────────────────────────────────────────

export type OverrideDurationKey =
  | "1w"
  | "2w"
  | "1m"
  | "3m"
  | "6m"
  | "1y"
  | "indefinite"
  | "custom";

export const OVERRIDE_DURATIONS: ReadonlyArray<{
  key: OverrideDurationKey;
  label: string;
}> = [
  { key: "1w", label: "1 week" },
  { key: "2w", label: "2 weeks" },
  { key: "1m", label: "1 month" },
  { key: "3m", label: "3 months" },
  { key: "6m", label: "6 months" },
  { key: "1y", label: "1 year" },
  { key: "indefinite", label: "No expiry (indefinite)" },
  { key: "custom", label: "Custom date" },
];

export function isOverrideDurationKey(value: unknown): value is OverrideDurationKey {
  return (
    typeof value === "string" &&
    OVERRIDE_DURATIONS.some((d) => d.key === value)
  );
}

function addDays(from: Date, days: number): Date {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  const targetMonth = d.getUTCMonth() + months;
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(targetMonth);
  // Clamp for short months (e.g. Jan 31 + 1mo → Feb 28).
  const lastDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/**
 * Resolve the absolute expiry timestamp for a duration choice.
 * Returns `null` for an indefinite override (no auto-expiry).
 * Returns `null` for `custom` when the supplied date is missing/invalid —
 * callers must validate `custom` explicitly.
 */
export function computeOverrideExpiry(
  key: OverrideDurationKey,
  opts?: { from?: Date; customISO?: string | null },
): string | null {
  const from = opts?.from ?? new Date();
  switch (key) {
    case "indefinite":
      return null;
    case "custom": {
      const iso = opts?.customISO?.trim();
      if (!iso) return null;
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    case "1w":
      return addDays(from, 7).toISOString();
    case "2w":
      return addDays(from, 14).toISOString();
    case "1m":
      return addMonths(from, 1).toISOString();
    case "3m":
      return addMonths(from, 3).toISOString();
    case "6m":
      return addMonths(from, 6).toISOString();
    case "1y":
      return addMonths(from, 12).toISOString();
    default:
      return null;
  }
}

// ─── Shared shapes ────────────────────────────────────────────────────────────

export type WorkspacePlanOverride = {
  id: string;
  tenantId: string;
  status: "active" | "expired" | "revoked";
  basePlanTier: WorkspacePlanTier;
  baseTalentSeatLimit: number | null;
  overridePlanTier: WorkspacePlanTier;
  overrideTalentSeatLimit: number | null;
  startsAt: string;
  expiresAt: string | null;
  reason: string | null;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
  endedAt: string | null;
};
