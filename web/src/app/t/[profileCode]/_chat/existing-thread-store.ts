/**
 * TUL-954: tiny module-scope flag, set by GuestOfferBanner when the guest's
 * session already owns an open inquiry on this talent, read by the profile's
 * message (paper-plane) button so it reopens THAT thread instead of seeding a
 * blank new inquiry. Module-scope on purpose: the banner and the button are
 * separate React trees on the same page (same seam as pending-offering-store).
 */
let existingThreadId: string | null = null;

export function setExistingGuestThread(id: string | null): void {
  existingThreadId = id;
}

export function getExistingGuestThread(): string | null {
  return existingThreadId;
}
