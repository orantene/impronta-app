"use server";

/**
 * Instant-book server action (feature 6.4).
 *
 * Thin wrapper over createInstantBooking. Runs with the authenticated client's
 * SSR session (auth.uid() == the client) — REQUIRED because the convert RPC
 * inside the engine checks auth.uid(). Resolves the operating currency + maps
 * the engine's structured failure reasons to user-facing copy.
 */

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import { createInstantBooking } from "@/lib/inquiry/instant-book-engine";
import { loadPlatformOperatingCurrency } from "@/lib/platform/operating-currency";

export type InstantBookFormPayload = {
  talentProfileId: string;
  tenantId: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  eventDate?: string | null;
  eventLocation?: string | null;
  sourcePage?: string | null;
  /** Storefront direct booking — the chosen talent_offerings.id. */
  offeringId?: string | null;
  /** Client chose "pay at the appointment" (honored only if the offering allows it). */
  payInPerson?: boolean;
  /** D4 — chosen option (talent_offering_variants.id); engine re-validates ownership + price. */
  variantId?: string | null;
  /** D4 — chosen extras (talent_offering_addons.id[]); engine re-validates ownership + prices. */
  addOnIds?: string[];
  /** D5 — client-picked quantity; engine clamps + gates on per-unit price types / products. */
  quantity?: number;
  /** P2 — chosen slot. Engine places a firm hold before confirm. */
  reservation?: { startsAt: string; endsAt: string; timezone: string } | null;
};

export type InstantBookActionResult =
  | { ok: true; inquiryId: string; bookingId: string; redirectPath: string }
  | {
      ok: false;
      error: string;
      needsAuth?: boolean;
      upgrade?: boolean;
      slotTaken?: boolean;
    };

export async function createInstantBookingAction(
  payload: InstantBookFormPayload,
): Promise<InstantBookActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Service unavailable. Please try again." };
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Please sign in to book instantly.", needsAuth: true };

    const { operatingCurrency } = await loadPlatformOperatingCurrency();
    const res = await createInstantBooking(supabase, {
      tenantId: payload.tenantId,
      talentProfileId: payload.talentProfileId,
      clientUserId: user.id,
      actorUserId: user.id,
      contactName: (payload.contactName || user.email || "Client").toString(),
      contactEmail: (payload.contactEmail || user.email || "").toString(),
      contactPhone: payload.contactPhone ?? null,
      eventDate: payload.eventDate ?? null,
      eventLocation: payload.eventLocation ?? null,
      sourcePage: payload.sourcePage ?? null,
      currencyCode: operatingCurrency,
      offeringId: payload.offeringId ?? null,
      payInPerson: payload.payInPerson === true,
      variantId: payload.variantId ?? null,
      addOnIds: payload.addOnIds ?? [],
      quantity: payload.quantity,
      reservation: payload.reservation ?? null,
    });

    if (!res.ok) {
      if (
        res.reason !== "instant_book_not_enabled" &&
        res.reason !== "no_fixed_rate" &&
        res.reason !== "slot_taken" &&
        res.reason !== "plan_lacks_capability"
      ) {
        logServerError("instantBookAction.engine", new Error(`${res.reason}: ${res.error ?? ""}`));
      }
      const msg =
        res.reason === "instant_book_not_enabled"
          ? "Instant booking isn't available for this talent right now."
          : res.reason === "no_fixed_rate"
            ? "This talent hasn't set an instant-book rate yet."
            : res.reason === "not_authenticated"
              ? "Please sign in to book instantly."
              : res.reason === "slot_taken"
                ? res.error ?? "That time was just taken. Pick another time."
                : res.reason === "plan_lacks_capability"
                  ? res.error ?? "This plan cannot auto-confirm. Send a request or upgrade."
                  : "We couldn't complete the booking. Please try the inquiry option instead.";
      return {
        ok: false,
        error: msg,
        needsAuth: res.reason === "not_authenticated",
        upgrade: res.reason === "plan_lacks_capability",
        slotTaken: res.reason === "slot_taken",
      };
    }

    return {
      ok: true,
      inquiryId: res.inquiryId,
      bookingId: res.bookingId,
      redirectPath: `/c/${res.inquiryId}?instant_booked=1`,
    };
  } catch (err) {
    logServerError("instantBookAction", err);
    return { ok: false, error: "Unexpected error. Please try again." };
  }
}
