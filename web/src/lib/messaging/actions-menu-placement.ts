/**
 * Where the composer's Actions menu opens, and how tall it may be (D-144).
 *
 * The menu opened upward from the bottom bar with no height bound; with ~14
 * rows it ran past the top of a 1280x720 screen and did not scroll, so
 * "Send options" and "Create or link a record" could not be reached. The
 * menu now opens on the side with more room and is bound to that room, so
 * the rows that do not fit scroll instead of leaving the screen.
 *
 * Pure: the component measures, this decides.
 */
export type ActionsMenuPlacement = {
  readonly side: "above" | "below";
  /** The tallest the menu may be, in CSS px. */
  readonly maxHeight: number;
};

const EDGE_GAP = 8;
const MIN_HEIGHT = 160;

export function actionsMenuPlacement(input: {
  /** The trigger's top edge, viewport px. */
  triggerTop: number;
  /** The trigger's bottom edge, viewport px. */
  triggerBottom: number;
  viewportHeight: number;
}): ActionsMenuPlacement {
  const above = Math.max(0, input.triggerTop - EDGE_GAP);
  const below = Math.max(0, input.viewportHeight - input.triggerBottom - EDGE_GAP);
  const side = below > above ? "below" : "above";
  const room = side === "below" ? below : above;
  return { side, maxHeight: Math.max(MIN_HEIGHT, Math.floor(room - EDGE_GAP)) };
}
