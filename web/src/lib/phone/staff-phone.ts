/**
 * Staff-entered forms: the phone is OPTIONAL, and becomes required only when
 * the staff action needs to reach the client on it (WhatsApp/SMS confirmation,
 * payment link by WhatsApp, or a WhatsApp channel). Stored values are E.164;
 * existing stored values are never rewritten, `readStaffPhone` is a read-time fallback.
 */
import { normalizeGuestPhone } from "./guest-phone";

export type StaffPhoneNeeds = {
  sendConfirmation?: boolean;
  sendPaymentLinkByWhatsapp?: boolean;
  channel?: string | null;
};

/** Pure "required-when" rule. */
export function staffPhoneRequired(needs: StaffPhoneNeeds): boolean {
  return (
    needs.sendConfirmation === true ||
    needs.sendPaymentLinkByWhatsapp === true ||
    (needs.channel ?? "").toLowerCase() === "whatsapp"
  );
}

export type StaffPhoneResult = { ok: true; phone: string | null } | { ok: false; error: string };

/** Validate + normalize for saving. Empty is fine unless required; non-empty must be a plausible number. */
export function checkStaffPhone(
  raw: string | null | undefined,
  needs: StaffPhoneNeeds,
  locale?: string | null,
): StaffPhoneResult {
  const es = (locale ?? "").toLowerCase().startsWith("es");
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    return staffPhoneRequired(needs)
      ? { ok: false, error: es ? "Falta el teléfono (WhatsApp) para enviar el mensaje." : "A phone (WhatsApp) is needed to send this message." }
      : { ok: true, phone: null };
  }
  const e164 = normalizeGuestPhone(trimmed);
  return e164
    ? { ok: true, phone: e164 }
    : { ok: false, error: es ? "Revisa el teléfono (WhatsApp)." : "Check the phone number (WhatsApp)." };
}

/** Read-time fallback: E.164 when stored value is parseable, else the stored value untouched. */
export function readStaffPhone(stored: string | null | undefined): string {
  if (!stored) return "";
  return normalizeGuestPhone(stored) ?? stored;
}

/** Small non-blocking hint shown when a client or booking has no phone. */
export function noPhoneHint(locale?: string | null): string {
  return (locale ?? "").toLowerCase().startsWith("es")
    ? "Sin teléfono: no podrás enviar recordatorios por WhatsApp"
    : "No phone: WhatsApp reminders won't be sent";
}
