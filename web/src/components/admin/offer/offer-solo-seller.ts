/**
 * TUL-380: an owner-talent selling her own work has no agency to pay, so the
 * offer editor hides the workspace fee input and the "workspace keeps" row.
 * Solo = a talent workspace, the viewer has her own talent profile, and every
 * talent-attributed line is hers. Anything else keeps the agency view.
 */
export function isSoloSeller(input: {
  workspaceType: string | null | undefined;
  ownTalentProfileId: string | null | undefined;
  lineTalentProfileIds: ReadonlyArray<string | null | undefined>;
}): boolean {
  if (input.workspaceType !== "talent") return false;
  const own = input.ownTalentProfileId;
  if (!own) return false;
  return input.lineTalentProfileIds.every((id) => !id || id === own);
}
