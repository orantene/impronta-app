/**
 * TUL-59: the booking sheet's in-progress state survives close/reopen within the
 * browser session. Keyed by talent site (host) so two sites never share a draft.
 * Cleared only after a successful booking or an explicit "Start over".
 * The captcha token is never stored.
 */

export type BookingDraft = {
  offeringId: string;
  step: "choose" | "when" | "who";
  variantId: string | null;
  addOnIds: string[];
  dayIndex: number;
  /** ISO date (yyyy-mm-dd) of the picked day, to validate dayIndex on restore. */
  dayKey: string | null;
  time: string | null;
  liveStarts: string | null;
  name: string;
  email: string;
  phone: string;
};

const PREFIX = "tulala:booking-draft:";

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function bookingDraftKey(siteKey: string | null | undefined): string {
  return `${PREFIX}${siteKey || (typeof window !== "undefined" ? window.location.host : "site")}`;
}

export function saveBookingDraft(key: string, draft: BookingDraft): void {
  try {
    storage()?.setItem(key, JSON.stringify(draft));
  } catch {
    /* storage full or blocked: the draft is a convenience */
  }
}

/** The stored draft, only when it belongs to `offeringId` (a different service is a fresh start). */
export function loadBookingDraft(key: string, offeringId: string): BookingDraft | null {
  try {
    const raw = storage()?.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as BookingDraft;
    if (!d || d.offeringId !== offeringId) return null;
    if (d.step !== "choose" && d.step !== "when" && d.step !== "who") return null;
    return {
      ...d,
      addOnIds: Array.isArray(d.addOnIds) ? d.addOnIds : [],
      name: d.name ?? "",
      email: d.email ?? "",
      phone: d.phone ?? "",
    };
  } catch {
    return null;
  }
}

export function clearBookingDraft(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    /* ignore */
  }
}
