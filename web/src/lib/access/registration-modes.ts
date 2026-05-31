/**
 * Tenant Registration Engine — plan gating for join-policy modes.
 *
 * Encodes the locked product matrix (confirmed 2026-05-31): which "Open for
 * registration" modes each workspace plan may SELECT. Seat *caps* are NOT here —
 * they stay enforced by checkRosterSeatAvailability() reading
 * agencies.talent_seat_limit (free 5 / studio 50 / agency 200 / Hub ∞).
 *
 *   Plan            closed  open  approval  exclusive   notes
 *   Free            ✓       ✓     ✓         —           open/approval capped at the 5-seat free limit
 *   Studio          ✓       ✓     ✓         ✓
 *   Agency          ✓       ✓     ✓         ✓
 *   Hub (=network)  ✓       ✓     ✓         ✓           "open" is curated/cross-tenant discovery
 *   Legacy          ✓       ✓     ✓         ✓           grandfathered → treat as Agency-equivalent
 *
 * `exclusive` is only offered to plans in EXCLUSIVE_PLAN_TIERS, matching the
 * exclusivity resolver (web/src/lib/agency/exclusivity-resolver.ts). Exclusive
 * ALWAYS routes through approval — never auto-accept — but that is a runtime
 * rule in the policy resolver, not a selectable distinction here.
 *
 * When Track C turns plan-capabilities.ts into DB reads, this graduates into a
 * capability row; until then it's the single source of truth for the admin
 * mode-picker and a server-side guard on writes.
 */

import { isKnownPlan, type PlanKey } from "./plan-catalog";

export const REGISTRATION_MODES = [
  "closed",
  "open",
  "approval",
  "exclusive",
] as const;

export type RegistrationMode = (typeof REGISTRATION_MODES)[number];

/** Plans that may grant exclusive representation on join. Mirrors the resolver. */
const EXCLUSIVE_PLAN_TIERS: ReadonlySet<PlanKey> = new Set<PlanKey>([
  "studio",
  "agency",
  "network",
  "legacy",
]);

/** Human copy for the admin mode-picker. Single source so UI + docs agree. */
export const REGISTRATION_MODE_META: Record<
  RegistrationMode,
  { label: string; description: string }
> = {
  closed: {
    label: "Closed",
    description: "Invite-only. No public join button or registration modal.",
  },
  open: {
    label: "Open · auto-accept",
    description:
      "Anyone can register from your public site and joins your roster immediately.",
  },
  approval: {
    label: "Approval required",
    description:
      "Applicants create a pending request. A Manager or above approves or declines.",
  },
  exclusive: {
    label: "Exclusive (agency)",
    description:
      "Joining grants exclusive representation. Always requires approval; subject to the one-exclusive-agency rule.",
  },
};

/**
 * Which modes the given workspace plan may select. `kind` ('agency' | 'hub') is
 * accepted for forward-compat (Hub curation nuance) but does not currently
 * narrow the set — Hub is the `network` plan and already gets every mode.
 */
export function registrationModesForPlan(
  planTier: string,
  _kind?: "agency" | "hub",
): RegistrationMode[] {
  const plan: PlanKey = isKnownPlan(planTier) ? planTier : "free";
  const base: RegistrationMode[] = ["closed", "open", "approval"];
  if (EXCLUSIVE_PLAN_TIERS.has(plan)) base.push("exclusive");
  return base;
}

/** Server-side guard: may this plan be set to this mode? */
export function isRegistrationModeAllowed(
  planTier: string,
  mode: RegistrationMode,
  kind?: "agency" | "hub",
): boolean {
  return registrationModesForPlan(planTier, kind).includes(mode);
}

/** Exclusive mode is, by rule, always approval-gated (never auto-accept). */
export function modeRequiresApproval(mode: RegistrationMode): boolean {
  return mode === "approval" || mode === "exclusive";
}
