/**
 * TUL-1238: a draft inquiry is seeded with the English placeholder contact name
 * "Guest" (NOT NULL column). Show a localized label until the guest gives a real name.
 */
export const GUEST_PLACEHOLDER_NAME = "Guest";

export function displayGuestName(name: string | null | undefined, t: (key: string) => string): string {
  const trimmed = (name ?? "").trim();
  return trimmed === GUEST_PLACEHOLDER_NAME ? t("public.guestChat.guestPlaceholderName") : trimmed;
}

/** True for the seeded English placeholder, so editable fields start empty instead of showing "Guest". */
export function isPlaceholderGuestName(name: string | null | undefined): boolean {
  return (name ?? "").trim() === GUEST_PLACEHOLDER_NAME;
}
