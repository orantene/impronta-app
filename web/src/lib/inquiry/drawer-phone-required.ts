/**
 * The public InquiryDrawer requires a guest phone / WhatsApp. This lives next
 * to the drawer's own submit action on purpose: validateIntentForSubmit is
 * shared with other surfaces (chat, staff forms) and must not change.
 */
import { guestPhoneError, normalizeGuestPhone } from "@/lib/phone/guest-phone";

export type DrawerPhoneCheck =
  | { ok: true; phone: string }
  | { ok: false; message: string };

export function checkDrawerPhone(
  requester: { phone?: string | null } | null | undefined,
  locale?: string | null,
): DrawerPhoneCheck {
  const message = guestPhoneError(requester?.phone, locale);
  if (message) return { ok: false, message };
  return { ok: true, phone: normalizeGuestPhone(requester?.phone) as string };
}
