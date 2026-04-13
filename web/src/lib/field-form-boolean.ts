/**
 * HTML checkboxes omit the field when unchecked. Pair each boolean with a hidden
 * sentinel so server actions can persist `false` vs "field omitted from this form".
 */
export const BOOLEAN_FIELD_SENTINEL_SUFFIX = "__bool_sent";

export function booleanFieldSentinelName(fieldName: string): string {
  return `${fieldName}${BOOLEAN_FIELD_SENTINEL_SUFFIX}`;
}

/**
 * @returns `true` / `false` when this boolean was part of the submitted form; `null` if not present.
 */
export function readBooleanFromFormData(formData: FormData, fieldName: string): boolean | null {
  if (formData.get(booleanFieldSentinelName(fieldName)) !== "1") return null;
  const raw = formData.get(fieldName);
  if (raw === null || raw === undefined) return false;
  const s = String(raw).trim();
  if (s === "1" || s === "true" || s === "on") return true;
  if (s === "0" || s === "false") return false;
  return false;
}
