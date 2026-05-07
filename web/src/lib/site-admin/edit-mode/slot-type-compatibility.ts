export interface SlotTypeDefinition {
  key: string;
  label: string;
  allowedSectionTypes: readonly string[] | null;
}

export type SlotTypeCompatibilityCode =
  | "SLOT_UNKNOWN"
  | "SECTION_TYPE_MISSING"
  | "SECTION_TYPE_NOT_ALLOWED";

export type SlotTypeCompatibilityResult =
  | { ok: true }
  | {
      ok: false;
      code: SlotTypeCompatibilityCode;
      message: string;
    };

export function checkSlotTypeCompatibility(input: {
  slotDefs: ReadonlyArray<SlotTypeDefinition>;
  targetSlotKey: string;
  sectionTypeKey: string | null | undefined;
}): SlotTypeCompatibilityResult {
  const slot = input.slotDefs.find((item) => item.key === input.targetSlotKey);
  if (!slot) {
    return {
      ok: false,
      code: "SLOT_UNKNOWN",
      message: `Target slot "${input.targetSlotKey}" is not available on this page.`,
    };
  }

  const allowed = slot.allowedSectionTypes;
  if (!allowed || allowed.length === 0) return { ok: true };

  const sectionTypeKey = input.sectionTypeKey?.trim();
  if (!sectionTypeKey) {
    return {
      ok: false,
      code: "SECTION_TYPE_MISSING",
      message: "Section type is missing. Reload and try again.",
    };
  }

  if (allowed.includes(sectionTypeKey)) return { ok: true };
  return {
    ok: false,
    code: "SECTION_TYPE_NOT_ALLOWED",
    message: `The ${slot.label} slot only accepts ${allowed.join(", ")}. "${sectionTypeKey}" can't be moved there.`,
  };
}
