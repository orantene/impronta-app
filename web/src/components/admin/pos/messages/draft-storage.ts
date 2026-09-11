const PREFIX = "pos-messages-draft";

export function draftStorageKey(tenantId: string, locationSlug: string, inquiryId: string): string {
  return `${PREFIX}:${tenantId}:${locationSlug}:${inquiryId}`;
}

export function readDraft(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

export function writeDraft(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    if (value.trim() === "") window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* device storage can be full; the composer still holds the typed value */
  }
}
