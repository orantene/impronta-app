/**
 * Live public-slot fetch for CatalogBookingSheet.
 * Duration is base offering + selected extras (BUF-5).
 */

import { isDevGuestCaptchaSkipHostname } from "@/lib/scheduling/guest-captcha-dev-skip";

import { LIVE_SLOT_STRIP_DAYS, buildLiveDayStrip } from "./catalog-booking-logic";

export type CatalogSlotsResult = {
  slots: string[];
  timezone: string;
  /** Talent home city for the zone chip when the IANA namesake differs. */
  placeCity?: string | null;
  /** YYYY-MM-DD sent as `?from=` — the live strip starts on this day. */
  fromYmd?: string;
};

/** The 14-day live strip for a slots result (empty days kept). */
export function liveDayStripFromResult(r: CatalogSlotsResult) {
  const fromYmd =
    r.fromYmd ?? r.slots.map((s) => s.slice(0, 10)).sort()[0] ?? new Date().toISOString().slice(0, 10);
  return buildLiveDayStrip({ slots: r.slots, timezone: r.timezone, fromYmd, dayCount: LIVE_SLOT_STRIP_DAYS });
}

export type CatalogSlotsFn = (
  offeringId: string,
  durationMinutes: number,
) => Promise<CatalogSlotsResult>;

export function shouldSkipGuestCaptchaOnHost(): boolean {
  if (typeof window === "undefined") return false;
  if (!isDevGuestCaptchaSkipHostname(window.location.hostname)) return false;
  // Mirrors instant-book-guest: only with the same flag that unlocks /dev.
  return (
    process.env.NEXT_PUBLIC_TULALA_ALLOW_DEV_SURFACES === "1" ||
    process.env.NODE_ENV === "development"
  );
}

export async function fetchLiveSlots(
  offeringId: string,
  durationMinutes: number,
): Promise<CatalogSlotsResult> {
  const fromYmd = new Date().toISOString().slice(0, 10);
  const params = new URLSearchParams({
    offering: offeringId,
    from: fromYmd,
    days: String(LIVE_SLOT_STRIP_DAYS),
    duration: String(durationMinutes),
  });
  const res = await fetch(`/api/public/booking/slots?${params.toString()}`, { cache: "no-store" });
  const body = (await res.json()) as { slots?: string[]; timezone?: string; placeCity?: string };
  if (!res.ok) return { slots: [], timezone: "UTC", fromYmd };
  return {
    slots: Array.isArray(body.slots) ? body.slots : [],
    timezone: typeof body.timezone === "string" && body.timezone.trim() ? body.timezone.trim() : "UTC",
    placeCity: typeof body.placeCity === "string" && body.placeCity.trim() ? body.placeCity.trim() : null,
    fromYmd,
  };
}
