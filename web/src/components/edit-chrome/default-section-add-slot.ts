import type {
  CompositionSectionRef,
  CompositionSlotDef,
} from "@/lib/site-admin/edit-mode/composition-actions";

/** Pick the slot used when inserting from library / empty-navigator flows. */
export function defaultSectionAddSlot(
  slotDefs: CompositionSlotDef[],
  slots: Record<string, CompositionSectionRef[]>,
): string {
  const emptyRequired = slotDefs.find(
    (def) => def.required && (slots[def.key]?.length ?? 0) === 0,
  );
  if (emptyRequired) return emptyRequired.key;

  const flexible = slotDefs.find((def) => def.allowedSectionTypes === null);
  if (flexible) return flexible.key;

  return slotDefs[0]?.key ?? "body";
}
