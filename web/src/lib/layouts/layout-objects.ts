/**
 * Layout objects — visual-only vs bookable-resource vs capacity-marker.
 */

export const LAYOUT_OBJECT_ROLES = ["visual_only", "bookable_resource", "capacity_marker"] as const;
export type LayoutObjectRole = (typeof LAYOUT_OBJECT_ROLES)[number];

export type LayoutObject = {
  id: string;
  role: LayoutObjectRole;
  label: string;
  /** SVG / canvas coordinates — ignored for keyboard-list alternative. */
  x: number;
  y: number;
  capacityUnits?: number;
};

export type LayoutVersion = {
  id: string;
  spaceId: string;
  name: string;
  active: boolean;
  objects: readonly LayoutObject[];
};

export function bookableMarkerCount(layout: LayoutVersion): number {
  return layout.objects
    .filter((o) => o.role === "capacity_marker" || o.role === "bookable_resource")
    .reduce((sum, o) => sum + (o.capacityUnits ?? 1), 0);
}

export type RelocationPlan = {
  fromObjectId: string;
  toObjectId: string;
  admissionIds: readonly string[];
};

/** When a sold seat's marker is removed, name where each admission moves. */
export function planSeatRelocation(input: {
  removedObjectId: string;
  remainingMarkers: readonly LayoutObject[];
  admissionIds: readonly string[];
}): { ok: true; plans: RelocationPlan[] } | { ok: false; error: string } {
  const targets = input.remainingMarkers.filter(
    (o) => o.role === "capacity_marker" || o.role === "bookable_resource",
  );
  if (targets.length < input.admissionIds.length) {
    return {
      ok: false,
      error: `Need ${input.admissionIds.length} markers to relocate sold seats; only ${targets.length} remain.`,
    };
  }
  return {
    ok: true,
    plans: input.admissionIds.map((admissionId, i) => ({
      fromObjectId: input.removedObjectId,
      toObjectId: targets[i]!.id,
      admissionIds: [admissionId],
    })),
  };
}
