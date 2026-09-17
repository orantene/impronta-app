/**
 * Trial doors — the moments inside a working product where a person meets the
 * paid tier for the first time (docs/plans/onboarding/trial-and-card.md).
 *
 * One door names ONE plan. The door card says the price and the day the card
 * is charged in one sentence; "Not now" returns to the product with nothing
 * lost. Nothing here runs before value: doors open only from inside the
 * builder or the workspace, never from the onboarding module.
 *
 * Pure: no I/O. The plan a door sells is resolved server-side
 * (`lib/server-actions/trial-door.ts`) because sellability lives in the DB.
 */

import type { WorkspacePlanKey } from "@/lib/stripe/price-ids";

export const TRIAL_DOOR_IDS = [
  "custom_domain",
  "remove_badge",
  "fourth_page",
  "ai_logo_third_try",
  "image_regen_cap",
] as const;

export type TrialDoorId = (typeof TRIAL_DOOR_IDS)[number];

export type TrialDoorDef = {
  id: TrialDoorId;
  /** The plan the feature belongs to (the lineup's answer). */
  plan: WorkspacePlanKey;
  /**
   * Sold while `plan` has no active price. Website is not launched
   * (`product_tiers.website.is_active = false`); until it is, the doors that
   * name it sell the next tier that includes the feature, so a door never
   * opens onto a checkout that cannot start.
   */
  fallbackPlan: WorkspacePlanKey | null;
};

export const TRIAL_DOORS: Record<TrialDoorId, TrialDoorDef> = {
  custom_domain: { id: "custom_domain", plan: "website", fallbackPlan: "agency" },
  remove_badge: { id: "remove_badge", plan: "website", fallbackPlan: "agency" },
  fourth_page: { id: "fourth_page", plan: "website", fallbackPlan: "agency" },
  ai_logo_third_try: { id: "ai_logo_third_try", plan: "website", fallbackPlan: "agency" },
  image_regen_cap: { id: "image_regen_cap", plan: "website", fallbackPlan: "agency" },
};

export function isTrialDoorId(value: unknown): value is TrialDoorId {
  return typeof value === "string" && (TRIAL_DOOR_IDS as readonly string[]).includes(value);
}

/**
 * A return-to-spot path is accepted only as a same-origin absolute path.
 * Parsed with `new URL()` against a fixed base, never `startsWith("/")`
 * alone: `//evil.com` and `/\evil.com` both start with "/" and both leave
 * the site (incident: open redirect via parser differential, 2026-09-06).
 */
export function isSafeReturnPath(path: unknown, tenantSlug?: string): path is string {
  if (typeof path !== "string" || path.length === 0 || path.length > 512) return false;
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return false;
  for (let i = 0; i < path.length; i += 1) {
    const code = path.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(path, "https://return.invalid");
  } catch {
    return false;
  }
  if (parsed.origin !== "https://return.invalid") return false;
  if (parsed.pathname + parsed.search + parsed.hash !== path) return false;
  if (tenantSlug && !parsed.pathname.startsWith(`/${tenantSlug}/`)) return false;
  return true;
}

/** The day the card is charged: the trial length from now. */
export function trialChargeDate(trialDays: number, now: Date = new Date()): Date {
  const d = new Date(now.getTime());
  d.setUTCDate(d.getUTCDate() + Math.max(0, Math.floor(trialDays)));
  return d;
}
