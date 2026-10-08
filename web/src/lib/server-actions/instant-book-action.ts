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
import { getPublicHostContext } from "@/lib/saas/scope";
import { isDirectTalentChannel } from "@/lib/talent/accepting-readiness";
import { runResolvedInstantBook } from "@/lib/scheduling/instant-book-run";
import { resolveGuestSessionId } from "@/lib/guest/guest-session";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadTalentPreferredLocale } from "@/lib/site-admin/server/talent-locale";
import { normalizeBookingLocale, resolveBookingLocale } from "@/lib/scheduling/booking-locale";
import { unwindFailedCheckout } from "@/lib/orders/unwind-failed-checkout";
import { cleanEventLocation } from "@/lib/scheduling/booking-event-location";
import { notifyBookingConfirmed } from "@/lib/notifications/producers/booking-confirmed-notify";

export type {
  InstantBookActionResult,
  InstantBookFormPayload,
} from "./instant-book-types";
import type { InstantBookActionResult, InstantBookFormPayload } from "./instant-book-types";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";

export async function createInstantBookingAction(
  payload: InstantBookFormPayload,
): Promise<InstantBookActionResult> {
  await requireNotImpersonating();
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Service unavailable. Please try again." };
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // TUL-93: the language the guest was browsing in (the sheet's own locale),
    // then the talent's preferred locale, then the platform default. Stamped on
    // the inquiry so the confirmation email renders in it.
    const requestLocale = await getRequestLocale();
    const bookingLocale = resolveBookingLocale({
      browsing: payload.locale,
      talentPreferred: normalizeBookingLocale(payload.locale)
        ? null
        : await loadTalentPreferredLocale(payload.talentProfileId),
      platformDefault: requestLocale,
    });

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

        // WSF-C §7: the talent's pause applies on their own site and Tulala
        // profile; an agency storefront owns its own routing.
        const host = await getPublicHostContext();
        const agencyRouted = !isDirectTalentChannel({
          hostKind: host.kind,
          hostTenantId: host.tenantId,
          tenantId: engineInput.tenantId,
        });
        const booked = await placeInstantPurchase(convertClient, {
          agencyRouted,
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
          guestSessionId: await resolveGuestSessionId(),
          brief: payload.brief ?? null,
          locale: bookingLocale,
          // TUL-426: the sheet's place, trimmed and capped here (visitor text).
          eventLocation: cleanEventLocation(payload.eventLocation),
        });

        if (!booked.ok) {
          // The pipeline's reasons are its own. `slot_taken` and the policy
          // refusals are customer-facing states; everything else is ours.
          const customerFacing =
            booked.reason === "slot_taken"
            || booked.reason === "too_soon"
            || booked.reason === "inquiry_only"
            || booked.reason === "request_only"
            || booked.reason === "not_accepting_bookings"
            || booked.reason === "bad_duration"
            || booked.reason === "beyond_horizon"
            || booked.reason === "outside_hours"
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
            reason:
              booked.reason === "slot_taken"
                ? ("slot_taken" as const)
                : booked.reason === "too_soon"
                    || booked.reason === "inquiry_only"
                    || booked.reason === "request_only"
                    || booked.reason === "not_accepting_bookings"
                    || booked.reason === "bad_duration"
                    || booked.reason === "beyond_horizon"
                    || booked.reason === "outside_hours"
                  ? booked.reason
                  : ("engine_error" as const),
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
            // The ORDER's currency, never the platform's. The transaction row
            // is already in it, and the webhook refuses a session whose
            // currency differs from the transaction's, so charging the
            // operating currency both overcharged (950 MXN → US$950) and left
            // the booking unpaid.
            currency: booked.currency,
            payerEmail: engineInput.contactEmail,
            inquiryId: booked.inquiryId ?? null,
            bookingId: booked.bookingId,
            // Stripe fills the session id; /checkout/success reads the
            // transaction it paid and only says paid once it is settled.
            successUrl: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancelUrl: `${origin}/checkout/cancel`,
            description: "Booking deposit",
            locale: bookingLocale,
          });
          if (!session.ok) {
            logServerError(
              "instantBookAction.checkout",
              new Error(session.error ?? "checkout session failed"),
            );
            // F5: a DEFINITE failure (Stripe refused, nothing created) means
            // nobody can pay this order: free the slot and cancel the draft
            // now, keeping the rows as the audit trail. An UNCERTAIN failure
            // (timeout, 5xx) may have created a session, so the hold stays
            // until its TTL and a retry reuses the same order (clientOrderKey)
            // and the same session (idempotency key `cs_txn_<id>`).
            const admin = session.uncertain ? null : createServiceRoleClient();
            if (admin) {
              await unwindFailedCheckout(admin, {
                orderId: booked.orderId,
                transactionId: booked.transactionId,
                allocationIds: booked.allocationIds,
                reservationHoldId: booked.reservationHoldId,
                why: "checkout_session_refused",
              });
            }
            return {
              ok: false as const,
              reason: "engine_error" as const,
              error: session.error ?? "Could not open payment.",
            };
          }
          checkoutUrl = session.url;
        } else if (booked.bookingId && booked.inquiryId) {
          // TUL-93: nothing to collect online (free / pay in person), so
          // `markPaid` never runs and its `booking.confirmed` never fires.
          // Emit it here so the guest gets the confirmation email and the
          // talent gets the new-booking notification. Paid bookings keep
          // firing from `markPaid` (same stable eventId, so no duplicate).
          notifyBookingConfirmed({
            tenantId: engineInput.tenantId,
            inquiryId: booked.inquiryId,
            bookingId: booked.bookingId,
          });
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
