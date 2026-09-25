/**
 * Pending guest contact — seam between the booking sheet (Nombre / WhatsApp)
 * and the mini-chat gate. Module-scope so CatalogBookingSheet and MiniChatPanel
 * (separate trees) share one handoff without props drilling.
 */

export type PendingGuestContact = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
};

let pending: PendingGuestContact | null = null;

export function setPendingGuestContact(next: PendingGuestContact | null): void {
  pending = next;
}

export function peekPendingGuestContact(): PendingGuestContact | null {
  return pending;
}

export function takePendingGuestContact(): PendingGuestContact | null {
  const cur = pending;
  pending = null;
  return cur;
}

export function clearPendingGuestContact(): void {
  pending = null;
}
