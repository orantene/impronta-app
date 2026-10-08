/**
 * TUL-36: per-talent AI credits (never hub/platform).
 *
 * Inquiry tenant for free talent sites is often the hub — that tenant must NOT
 * pay for booking-assistant calls. Spend is gated and attributed by
 * `talent_profile_id` under a monthly cap. Platform kill switch
 * `ai_master_enabled` is separate (off → assistant never runs). Cap hit →
 * handoff reason `gated`.
 */

export type BookingAssistantPlanBand = "free" | "paid";

export function bookingAssistantPlanBand(planKey: string | null | undefined): BookingAssistantPlanBand {
  if (planKey === "talent_pro" || planKey === "talent_portfolio") return "paid";
  return "free";
}

/**
 * Soft monthly spend ceiling in cents for booking-assistant LLM turns.
 * Free / basic (hub-hosted sellers) stay tight; paid plans get more headroom.
 */
export function bookingAssistantMonthlyCapCents(planKey: string | null | undefined): number {
  return bookingAssistantPlanBand(planKey) === "paid" ? 2000 : 500;
}

export function bookingAssistantMonthlyCapReached(
  usedCentsThisMonth: number,
  planKey: string | null | undefined,
): boolean {
  const used = Number.isFinite(usedCentsThisMonth)
    ? Math.max(0, Math.floor(usedCentsThisMonth))
    : 0;
  return used >= bookingAssistantMonthlyCapCents(planKey);
}

/** True when the inquiry/credits tenant is the platform hub — never bill it. */
export function isHubCreditsTenant(
  tenantId: string | null | undefined,
  hubTenantId: string | null | undefined,
): boolean {
  if (!tenantId || !hubTenantId) return false;
  return tenantId === hubTenantId;
}
