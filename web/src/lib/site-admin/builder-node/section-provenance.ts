/**
 * SECTION PROVENANCE for freeform kit sections: `slotKey` + a namespaced
 * `originRole` on a TOP-LEVEL freeform node (a container / split that a kit
 * builder minted as "the hero", "the contact band", ...).
 *
 * WHY
 * ───
 * A curated `section` node already carries `props.slotKey`. A freeform kit
 * section is a plain container, whose props schema strips any key it does not
 * declare, so without a carrier the identity would be lost on the very first
 * `validateBuilderNodeTree` pass. The talent theme gallery needs that identity
 * to survive: a Design swap, the Free tree guard and "hide / reorder" edits all
 * address sections by slot, not by (regenerated) node id.
 *
 * HOW
 * ───
 *   - `slotKey` is carried by validate's BASE_NODE_FIELD_CARRIERS for every
 *     kind EXCEPT `section`, whose own schema already declares `slotKey` (the
 *     carrier would otherwise delete a null-valued section slot and change the
 *     byte shape of every curated section).
 *   - `originRole` keeps its eject-time element roles (`headline`, ...) and
 *     additionally accepts a NAMESPACED kit role (`talent.hero`). The dot is the
 *     discriminator: element roles never contain one, so `isBuilderNodeRole`
 *     callers (section-eject-repair) are unaffected.
 *
 * Absent values normalize to undefined, so a tree without them round-trips
 * byte-identically (the same guarantee as every other carried field).
 */

/** A namespaced kit section role, e.g. `talent.hero`, `talent.shell.footer`. */
export type BuilderKitSectionRole = `${string}.${string}`;

const KIT_ROLE_RE = /^[a-z][a-z0-9]*(?:\.[a-z0-9][a-z0-9-]*)+$/;
const SLOT_KEY_RE = /^[a-z0-9][a-z0-9_-]*$/i;
const MAX_LEN = 64;

export function isBuilderKitSectionRole(
  value: unknown,
): value is BuilderKitSectionRole {
  return typeof value === "string" && value.length <= MAX_LEN && KIT_ROLE_RE.test(value);
}

/** Normalize a freeform section slot key; junk → undefined (carried nowhere). */
export function normalizeKitSlotKey(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_LEN) return undefined;
  return SLOT_KEY_RE.test(trimmed) ? trimmed : undefined;
}
