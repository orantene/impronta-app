/** Horizontal block position within the parent (margin-left/right auto). */

export type BlockPosition = "left" | "center" | "right";

export function blockPositionFromStyle(
  style: Record<string, unknown> | undefined,
): BlockPosition | null {
  if (!style) return null;
  const ml = style.marginLeftFree as string | undefined;
  const mr = style.marginRightFree as string | undefined;
  if (ml === "auto" && mr === "auto") return "center";
  if (ml === "auto" && mr === "0") return "right";
  if (ml === "0" && mr === "auto") return "left";
  return null;
}

export function blockPositionStylePatch(
  position: BlockPosition,
): Record<string, string> {
  switch (position) {
    case "center":
      return { marginLeftFree: "auto", marginRightFree: "auto" };
    case "right":
      return { marginLeftFree: "auto", marginRightFree: "0" };
    default:
      return { marginLeftFree: "0", marginRightFree: "auto" };
  }
}

export function clearBlockPositionPatch(): Record<string, undefined> {
  return { marginLeftFree: undefined, marginRightFree: undefined };
}
