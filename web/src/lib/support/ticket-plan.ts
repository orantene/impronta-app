/**
 * Which plan badge a support ticket carries.
 *
 * Tickets a talent files from their own workspace are stored against the
 * network hub tenant (plan `network`), so the desk painted a NETWORK badge on
 * a Max talent's ticket. On the hub the badge must describe the person who
 * asked, i.e. their talent plan. Workspace tickets keep the workspace plan.
 */
export function ticketPlanTier(input: {
  tenantKind: string | null;
  tenantPlan: string | null;
  talentPlanKey: string | null;
  /** True when the ticket is tied to a talent profile (plan row may be empty). */
  hasTalent?: boolean;
}): string | null {
  const onHub = input.tenantKind === "hub";
  if (onHub && (input.talentPlanKey || input.hasTalent)) {
    return input.talentPlanKey ?? "talent_basic";
  }
  return input.tenantPlan ?? null;
}
