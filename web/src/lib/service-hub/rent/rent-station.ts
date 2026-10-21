/**
 * TUL-1465 · The station a renting member sits at (pure). The station is a bookable space (chair, room,
 * station, bed) in the studio's workspace, linked to each of the member's offerings through the resource
 * engine (TUL-1375), so every booking of the member holds it and cannot be double-booked.
 */

/**
 * The offering's resource list after moving the member from `previous` station to `next`. Only the
 * member's own previous station is ever removed: resources the studio linked for other reasons stay.
 */
export function mergeStationSpaceIds(current: readonly string[], previous: string | null, next: string | null): string[] {
  const kept = current.filter((id) => id !== previous);
  return [...new Set(next ? [...kept, next] : kept)];
}

export type StationDecision = { ok: true } | { ok: false; reason: "plan_not_accepted" | "space_not_found" | "space_not_bookable" };

/** A station is held only for a member who accepted (active or paused plan), from a bookable space of THIS workspace. */
export function decideStationChange(input: { planStatus: string; spaceInWorkspace: boolean; spaceBookable: boolean }): StationDecision {
  if (input.planStatus !== "active" && input.planStatus !== "paused") return { ok: false, reason: "plan_not_accepted" };
  if (!input.spaceInWorkspace) return { ok: false, reason: "space_not_found" };
  if (!input.spaceBookable) return { ok: false, reason: "space_not_bookable" };
  return { ok: true };
}
