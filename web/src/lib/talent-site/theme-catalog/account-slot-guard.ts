/**
 * Release guard for the client account entry (TUL-695).
 *
 * The entry is added at RENDER time (never baked into design payloads, so
 * authored-overlay hashes stay put). Two render paths reach it:
 *   - "item": a `site_header` landmark with header regions; `withAccountItem` adds the item;
 *   - "overlay": any other header root; the document paints the shared overlay slot.
 * A landmark with no regions has neither path, so a theme published that way
 * would silently lose the entry. `validateDesign` refuses it ("none").
 */
export type AccountSlotPath = "item" | "overlay" | "none";

type Node = { kind?: string; props?: Record<string, unknown> };

export function accountSlotPath(shellTree: readonly unknown[]): AccountSlotPath {
  const nodes = shellTree as Node[];
  const landmark = nodes.find((n) => n?.kind === "section" && n.props?.sectionTypeKey === "site_header");
  if (!landmark) return nodes.length > 0 ? "overlay" : "none";
  const regions = (landmark.props?.sectionProps as { regions?: unknown } | undefined)?.regions;
  const hasZone = !!regions && typeof regions === "object" && Object.values(regions as object).some(Array.isArray);
  return hasZone ? "item" : "none";
}
