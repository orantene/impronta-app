/**
 * Apply booking-sheet Chat now handoff when the mini-chat dock opens:
 * Nombre / WhatsApp / email into the gate, composer prefix from pending offering.
 */

import type { PendingGuestContact } from "./pending-guest-contact-store";
import { takePendingGuestContact } from "./pending-guest-contact-store";
import { peekPendingOffering } from "./pending-offering-store";
import { catalogBookingDraftPrefix } from "@/components/public-booking/catalog-booking-chat";
import { splitGuestFullName } from "./mini-chat-styles";

export function consumeBookingSheetChatHandoff(locale: string): {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  draftPrefix?: string;
} {
  const contact: PendingGuestContact | null = takePendingGuestContact();
  const out: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    draftPrefix?: string;
  } = {};
  if (contact?.name?.trim()) {
    const parts = splitGuestFullName(contact.name);
    out.firstName = parts.firstName;
    out.lastName = parts.lastName;
  }
  if (contact?.phone?.trim()) out.phone = contact.phone.trim();
  if (contact?.email?.trim()) out.email = contact.email.trim();
  const pending = peekPendingOffering();
  if (pending) {
    out.draftPrefix = catalogBookingDraftPrefix(pending, pending.selection, locale);
  }
  return out;
}
