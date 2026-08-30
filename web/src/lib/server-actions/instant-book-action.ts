"use server";

/**
 * Instant-book server action (feature 6.4).
 *
 * Signed-in clients convert with their own session. Guests reuse the request
 * path identity (ensureGuestClientByEmail + HMAC cookie) and convert via the
 * service-role client (auth.role() = service_role).
 */

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import { createInstantBooking } from "@/lib/inquiry/instant-book-engine";
import { loadPlatformOperatingCurrency } from "@/lib/platform/operating-currency";
import {
  convertClientForActor,
  loadOfferingRequireAccount,
  notifyGuestInstantBooking,
  resolveInstantBookActor,
} from "@/lib/scheduling/instant-book-guest";
import { runResolvedInstantBook } from "@/lib/scheduling/instant-book-run";

export type InstantBookFormPayload = {
  talentProfileId: string;
  tenantId: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  eventDate?: string | null;
  eventLocation?: string | null;
  sourcePage?: string | null;
  offeringId?: string | null;
  payInPerson?: boolean;
  variantId?: string | null;
  addOnIds?: string[];
  quantity?: number;
  reservation?: { startsAt: string; endsAt: string; timezone: string } | null;
  captchaToken?: string | null;
  honeypot?: string | null;
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
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const requireAccount = await loadOfferingRequireAccount(payload.offeringId);
    const actor = await resolveInstantBookActor({
      user: user ? { id: user.id, email: user.email } : null,
      tenantId: payload.tenantId,
      requireAccount,
      contactName: payload.contactName,
      contactEmail: payload.contactEmail,
      contactPhone: payload.contactPhone,
      captchaToken: payload.captchaToken,
      honeypot: payload.honeypot,
    });

    const { operatingCurrency } = await loadPlatformOperatingCurrency();
    const convertClient =
      actor.kind === "fail" ? supabase : convertClientForActor(supabase, actor);

    const res = await runResolvedInstantBook({
      actor,
      payload,
      currencyCode: operatingCurrency,
      createBooking: async (engineInput) => {
        const booked = await createInstantBooking(convertClient, {
          tenantId: engineInput.tenantId,
          talentProfileId: engineInput.talentProfileId,
          clientUserId: engineInput.userId,
          actorUserId: engineInput.userId,
          contactName: engineInput.contactName,
          contactEmail: engineInput.contactEmail,
          contactPhone: engineInput.contactPhone,
          eventDate: payload.eventDate ?? null,
          eventLocation: payload.eventLocation ?? null,
          sourcePage: payload.sourcePage ?? null,
          currencyCode: engineInput.currencyCode,
          offeringId: payload.offeringId ?? null,
          payInPerson: payload.payInPerson === true,
          variantId: payload.variantId ?? null,
          addOnIds: payload.addOnIds ?? [],
          quantity: payload.quantity,
          reservation: payload.reservation ?? null,
        });
        if (!booked.ok) {
          if (
            booked.reason !== "instant_book_not_enabled" &&
            booked.reason !== "no_fixed_rate" &&
            booked.reason !== "slot_taken" &&
            booked.reason !== "plan_lacks_capability" &&
            booked.reason !== "not_authenticated"
          ) {
            logServerError("instantBookAction.engine", new Error(`${booked.reason}: ${booked.error ?? ""}`));
          }
          return booked;
        }
        return { ok: true, inquiryId: booked.inquiryId, bookingId: booked.bookingId };
      },
      notifyGuest: async (resolved) => {
        await notifyGuestInstantBooking({
          kind: resolved.kind,
          email: resolved.contactEmail,
          tenantId: payload.tenantId,
        });
      },
    });

    if (!res.ok) return res;
    return {
      ok: true,
      inquiryId: res.inquiryId,
      bookingId: res.bookingId,
      redirectPath: res.redirectPath,
    };
  } catch (err) {
    logServerError("instantBookAction", err);
    return { ok: false, error: "Unexpected error. Please try again." };
  }
}
