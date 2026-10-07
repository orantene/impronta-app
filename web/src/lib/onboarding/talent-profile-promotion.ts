/**
 * Shared by 1A ("both" build) and 1E (Settings "How you work"): a bookable
 * owner's talent profile ends live. draft/hidden → approved/public; already
 * live states (approved, published, public) are never touched or downgraded.
 */

export type ProfileState = { workflow_status: string; visibility: string };

export function planProfilePromotion(p: ProfileState): Partial<ProfileState> | null {
  const patch: Partial<ProfileState> = {};
  if (p.workflow_status === "draft" || p.workflow_status === "hidden") patch.workflow_status = "approved";
  if (p.visibility === "hidden") patch.visibility = "public";
  return Object.keys(patch).length ? patch : null;
}
