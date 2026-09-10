"use server";

/**
 * Instant-book server action (feature 6.4).
 *
 * Signed-in clients convert with their own session. Guests reuse the request
 * path identity (ensureGuestClientByEmail + HMAC cookie) and convert via the
 * service-role client (auth.role() = service_role).
 */

import { headers } from "next/headers";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import { getRequestLocale } from "@/i18n/request-locale";
import { createCheckoutSessionForTransaction } from "@/lib/payments/stripe-checkout";
import { loadPlatformOperatingCurrency } from "@/lib/platform/operating-currency";
import {
  convertClientForActor,
  loadOfferingRequireAccount,
  notifyGuestInstantBooking,
  resolveInstantBookActor,
} from "@/lib/scheduling/instant-book-guest";
import { placeInstantPurchase } from "@/lib/scheduling/instant-purchase";
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
        // Re-homed onto the ONE purchase pipeline. The engine this replaces
        // reserved stock through `reserve_offering_stock` — a shim that frees a
        // QUANTITY newest-first and can release a DIFFERENT allocation than the
        // caller reserved. The pipeline reserves and releases by allocation ID
        // through the capacity engine, which is what makes refund-by-line able
        // to free exactly the units a line held.
        const offeringId = payload.offeringId ?? null;
        if (!offeringId) {
          return { ok: false, reason: "no_fixed_rate" as const, error: "No offering to book." };
        }

        const booked = await placeInstantPurchase(convertClient, {
          tenantId: engineInput.tenantId,
          offeringId,
          talentProfileId: engineInput.talentProfileId,
          actorUserId: engineInput.userId ?? null,
          contact: {
            email: engineInput.contactEmail,
            phone: engineInput.contactPhone ?? null,
            displayName: engineInput.contactName,
          },
          quantity: payload.quantity ?? 1,
          variantId: payload.variantId ?? null,
          addOnIds: payload.addOnIds ?? [],
          reservation: payload.reservation
            ? { startsAt: payload.reservation.startsAt, endsAt: payload.reservation.endsAt }
            : null,
          payInPerson: payload.payInPerson,
          sourceChannel: "instant_book",
          sourcePage: payload.sourcePage ?? null,
          // Per CART. Stable for one attempt at one offering by one buyer, so a
          // double-tapped Confirm cannot mint two bookings.
          clientOrderKey: `instant:${engineInput.tenantId}:${offeringId}:${engineInput.contactEmail}`,
          // Instant bookings are worked in Messages exactly as before.
          openThread: true,
        });

        if (!booked.ok) {
          // The pipeline's reasons are its own. `slot_taken` and the policy
          // refusals are customer-facing states; everything else is ours.
          const customerFacing =
            booked.reason === "slot_taken"
            || booked.reason === "sold_out"
            || booked.reason === "account_required"
            || booked.reason === "pay_in_person_not_allowed"
            || booked.reason === "deposit_not_offered"
            || booked.reason === "offering_not_priceable"
            || booked.reason === "offering_not_published"
            || booked.reason === "unknown_offering";
          if (!customerFacing) {
            logServerError("instantBookAction.pipeline", new Error(`${booked.reason}: ${booked.error ?? ""}`));
          }
          return {
            ok: false as const,
            reason: booked.reason === "slot_taken" ? ("slot_taken" as const) : ("engine_error" as const),
            error: booked.error,
          };
        }
        let checkoutUrl: string | null = null;
        if (booked.collectCents > 0 && booked.transactionId && booked.bookingId) {
          const hdrs = await headers();
          const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost";
          const proto = hdrs.get("x-forwarded-proto") ?? "https";
          const origin = process.env.NEXT_PUBLIC_BASE_URL ?? `${proto}://${host}`;
          const session = await createCheckoutSessionForTransaction({
            transactionId: booked.transactionId,
            amountCents: booked.collectCents,
            currency: operatingCurrency || "USD",
            payerEmail: engineInput.contactEmail,
            inquiryId: booked.inquiryId ?? null,
            bookingId: booked.bookingId,
            successUrl: `${origin}/checkout/success`,
            cancelUrl: `${origin}/checkout/cancel`,
            description: "Booking deposit",
            locale: await getRequestLocale(),
          });
          if (!session.ok) {
            logServerError(
              "instantBookAction.checkout",
              new Error(session.error ?? "checkout session failed"),
            );
            return {
              ok: false as const,
              reason: "engine_error" as const,
              error: session.error ?? "Could not open payment.",
            };
          }
          checkoutUrl = session.url;
        }
        return {
          ok: true,
          inquiryId: booked.inquiryId ?? "",
          bookingId: booked.bookingId ?? "",
          checkoutUrl,
        };
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
