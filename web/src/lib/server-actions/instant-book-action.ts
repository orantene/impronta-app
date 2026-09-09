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
import { createPurchase } from "@/lib/orders/purchase";
import { loadOfferingCapacityPoolId } from "@/lib/orders/purchase-catalog";
import { createCheckoutSessionForTransaction } from "@/lib/payments/stripe-checkout";
import { loadPlatformOperatingCurrency } from "@/lib/platform/operating-currency";
import {
  convertClientForActor,
  loadOfferingRequireAccount,
  notifyGuestInstantBooking,
  resolveInstantBookActor,
} from "@/lib/scheduling/instant-book-guest";
import { instantBookPaymentChoice } from "@/lib/scheduling/instant-book-payment-choice";
import { runResolvedInstantBook } from "@/lib/scheduling/instant-book-run";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { parseOfferingResourceSet } from "@/lib/resources/offering-resource-set";
import { spaceCapacityPool } from "@/lib/resources/reserve-set";

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

        // A read failure REFUSES rather than resolving to "no pool". `null`
        // means unlimited, so treating an error as null would sell unlimited
        // seats on a transient database fault. A failed read is a retry; an
        // oversold event is a person turned away at a door.
        const pool = await loadOfferingCapacityPoolId(convertClient, offeringId);
        if (!pool.ok) {
          logServerError(
            "instantBookAction.poolLookup",
            new Error(`could not confirm availability for offering ${offeringId}`),
          );
          return {
            ok: false as const,
            reason: "engine_error" as const,
            error: "We could not confirm availability. Please try again.",
          };
        }
        const poolId = pool.poolId;

        const { data: offeringPolicy, error: offeringPolicyErr } = await tenantScopedQuery(
          convertClient,
          "talent_offerings",
          engineInput.tenantId,
        )
          .select("reserve_mode, attributes")
          .eq("id", offeringId)
          .maybeSingle();
        if (offeringPolicyErr) {
          logServerError("instantBookAction.reserveMode", offeringPolicyErr);
          return {
            ok: false as const,
            reason: "engine_error" as const,
            error: "We could not confirm how this is paid. Please try again.",
          };
        }

        const reservation = payload.reservation;
        const resourceSet = parseOfferingResourceSet(
          (offeringPolicy as { attributes?: unknown } | null)?.attributes,
        );
        const companionIds = resourceSet.companionTalentIds.filter(
          (id) => id !== engineInput.talentProfileId,
        );
        if (companionIds.length > 0) {
          const { data: roster, error: rosterErr } = await tenantScopedQuery(
            convertClient,
            "agency_talent_roster",
            engineInput.tenantId,
          )
            .select("talent_profile_id")
            .in("talent_profile_id", companionIds)
            .eq("status", "active");
          if (rosterErr) {
            logServerError("instantBookAction.companions", rosterErr);
            return {
              ok: false as const,
              reason: "engine_error" as const,
              error: "We could not confirm who this treatment needs.",
            };
          }
          const onRoster = new Set(
            ((roster ?? []) as Array<{ talent_profile_id: unknown }>).map((r) =>
              String(r.talent_profile_id),
            ),
          );
          if (companionIds.some((id) => !onRoster.has(id))) {
            return {
              ok: false as const,
              reason: "engine_error" as const,
              error: "That treatment is missing a therapist.",
            };
          }
        }

        const capacity: Array<{
          offeringId: string;
          poolId: string;
          units: number;
          startsAt?: string;
          endsAt?: string;
        }> = [];
        if (poolId) {
          capacity.push({
            offeringId,
            poolId,
            units: payload.quantity ?? 1,
            ...(reservation
              ? { startsAt: reservation.startsAt, endsAt: reservation.endsAt }
              : {}),
          });
        }
        if (resourceSet.spaceId && reservation) {
          const room = await spaceCapacityPool(convertClient, {
            tenantId: engineInput.tenantId,
            spaceId: resourceSet.spaceId,
          });
          if (!room.ok) {
            return {
              ok: false as const,
              reason: "engine_error" as const,
              error: "That treatment room is not on sale.",
            };
          }
          capacity.push({
            offeringId,
            poolId: room.poolId,
            units: 1,
            startsAt: reservation.startsAt,
            endsAt: reservation.endsAt,
          });
        }

        const booked = await createPurchase(convertClient, {
          tenantId: engineInput.tenantId,
          // Per CART. Stable for one attempt at one offering by one buyer, so a
          // double-tapped Confirm cannot mint two bookings.
          clientOrderKey: `instant:${engineInput.tenantId}:${offeringId}:${engineInput.contactEmail}`,
          actorUserId: engineInput.userId ?? null,
          contact: {
            email: engineInput.contactEmail,
            phone: engineInput.contactPhone ?? null,
            displayName: engineInput.contactName,
          },
          lines: [
            {
              offeringId,
              units: payload.quantity ?? 1,
              variantId: payload.variantId ?? null,
              addonIds: payload.addOnIds ?? [],
            },
          ],
          // INTENT, never policy. The pipeline re-derives reserve_mode,
          // deposit_pct, allow_pay_in_person and require_account_to_book from
          // the offering row and refuses if the client's choice disagrees.
          // A deposit offering used to send "full" and charge the whole total.
          paymentChoice: instantBookPaymentChoice(
            payload.payInPerson,
            (offeringPolicy as { reserve_mode?: string | null } | null)?.reserve_mode,
          ),
          sourceChannel: "instant_book",
          sourcePage: payload.sourcePage ?? null,
          capacity: capacity.length > 0 ? capacity : undefined,
          // The calendar slot, when this purchase takes someone's time. Capacity
          // and the slot are two different questions and both are on the
          // pipeline's unwind ledger.
          reservation: reservation
            ? {
                talentProfileId: engineInput.talentProfileId,
                startsAt: reservation.startsAt,
                endsAt: reservation.endsAt,
                poolId,
              }
            : null,
          // Several people (couples). Reserved with the primary slot as one set.
          holds:
            reservation && companionIds.length > 0
              ? companionIds.map((talentProfileId) => ({
                  talentProfileId,
                  startsAt: reservation.startsAt,
                  endsAt: reservation.endsAt,
                  title: "Couples therapist",
                }))
              : undefined,
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
