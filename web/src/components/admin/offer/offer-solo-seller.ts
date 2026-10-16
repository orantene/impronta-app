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

/**
 * TUL-380 follow-up: in her own talent workspace, a talent who is the only
 * talent on the inquiry is not "coordinating" anyone, so the coordinator
 * banner and pill stay hidden. An unknown lineup count keeps them shown.
 */
export function isSoloOwnerThread(input: {
  workspaceType: string | null | undefined;
  lineupTotal: number | undefined;
}): boolean {
  if (input.workspaceType !== "talent") return false;
  return input.lineupTotal !== undefined && input.lineupTotal < 2;
}
