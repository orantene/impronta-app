/**
 * Instant-book engine (feature 6.4).
 *
 * A talent can opt in to instant-book at a fixed rate (talent_profiles.
 * booking_terms.{instantBookOptIn, fixedRateCents}); the tenant gates it on
 * agencies.settings.commercialTerms.instantBookEnabled. When both are on, an
 * authenticated client can press "Book now" and the system runs the entire
 * inquiry → offer → approval → booking → payment-request flow in one server
 * call — skipping negotiation and the talent's manual approval (they pre-
 * authorised by opting in).
 *
 * Auth model (important):
 *   - Most steps run under the SERVICE-ROLE client so RLS doesn't block the
 *     orchestration. The offer steps (create/update/send) are staff-gated, so
 *     they're driven with a resolved tenant STAFF actor (validateActorPermission
 *     short-circuits for staff).
 *   - engine_convert_to_booking RPC hard-requires auth.uid() == p_actor_user_id
 *     and EXECUTE is granted to anon — so it can only be satisfied by a real
 *     session, NOT service-role. We therefore convert with the CLIENT's own
 *     authenticated session (the client is a real authenticated user on their
 *     own already-approved inquiry; the RPC permits this) and then re-stamp the
 *     booking's owner/creator to the tenant staff actor.
 *
 * v1 is single-talent. The client is charged the SAME total a normal offer
 * would bill for the same fixed rate — subtotal + the platform's client-side
 * surcharge (+ workspace base fee), read back from the booking's commission
 * snapshot (A2) — NOT the bare talent rate. When the resolved offer terms carry
 * a deposit, the first charge is the deposit (balance collected later, like the
 * offer path); otherwise the full amount is charged in one go. Multi-talent is an
 * explicit non-goal here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { submitInquiry } from "./inquiry-engine-submit";
import { createOffer, updateOfferDraft, sendOffer } from "./inquiry-engine-offers";
import {
  persistBookingCommissionSnapshot,
  sumBookingGrossChargedCents,
  sumBookingPlatformFeeCents,
} from "@/lib/billing/commission-engine";
import { enrichBookingFromReservation } from "@/lib/scheduling/reservation-convert";
import {
  attachReservationHoldToInquiry,
  placeReservationHold,
  releaseReservationHold,
} from "@/lib/scheduling/reservation-hold";
import {
  assertInstantPlanCeiling,
  reservationStampForInstant,
  type InstantReservationWindow,
} from "@/lib/scheduling/instant-book-gates";
import { emitInstantReservationConfirmed } from "@/lib/scheduling/instant-book-confirm-notify";
import { readOfferTermsFromRow } from "@/lib/billing/offer-commercial-terms";
import {
  createBookingTransaction,
  requestPayment,
  setTransactionPayoutReceiver,
  loadPayoutReceiverCandidatesForBooking,
} from "@/lib/bookings/transactions";
import { parseTalentBookingTerms, parseTenantCommercialTerms } from "@/lib/billing/commercial-terms";
import { normalizeServicesMenu, findInstantBookService } from "@/lib/talent/services-menu-types";
import { rowToOffering, offeringIsDirectlyBookable, type TalentOfferingRow } from "@/lib/talent/offerings-types";
import { QUANTITY_UNITS } from "@/lib/talent/offerings-offer";

export type InstantBookInput = {
  tenantId: string;
  talentProfileId: string;
  clientUserId: string;
  actorUserId: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string | null;
  eventDate?: string | null;
  eventLocation?: string | null;
  sourcePage?: string | null;
  sourceWorkspaceId?: string | null;
  currencyCode?: string;
  /**
   * Storefront direct booking: book THIS offering (talent_offerings.id) instead
   * of the legacy single instant-book menu item / fixed rate. The offering must
   * pass offeringIsDirectlyBookable (booking_mode=instant, published, exact
   * price) — a quote/custom offering is uncharge-able by construction.
   */
  offeringId?: string | null;
  /**
   * Client chose "pay at the appointment" (honored ONLY when the offering has
   * allow_pay_in_person). The booking + transaction are still created; the
   * card payment request is skipped — staff/talent collect in person and mark
   * paid (payment_method cash) from the Messages shell.
   */
  payInPerson?: boolean;
  /**
   * D4 — the chosen option (talent_offering_variants.id). Loaded + validated
   * server-side (must belong to the offering); its amount_cents overrides the
   * base price (null = base applies). A variantId that doesn't belong refuses.
   */
  variantId?: string | null;
  /** D4 — chosen extras (talent_offering_addons.id[]); each becomes its own offer line. */
  addOnIds?: string[];
  /**
   * D5 — client-picked quantity. Applies only to per-unit price types
   * (QUANTITY_UNITS) and products; clamped 1..999 (products further capped by
   * atomic stock reserve). Everything else books as 1.
   */
  quantity?: number;
  /**
   * P2 — timed slot. When set, a firm hold is placed BEFORE confirm and
   * released on any later failure (same compensation slot as releaseStock).
   */
  reservation?: InstantReservationWindow | null;
};

export type InstantBookReason =
  | "instant_book_not_enabled"
  | "no_fixed_rate"
  | "not_authenticated"
  | "multi_talent_unsupported"
  | "engine_error"
  | "slot_taken"
  | "plan_lacks_capability";

export type InstantBookResult =
  | { ok: true; inquiryId: string; bookingId: string; transactionId: string }
  | { ok: false; reason: InstantBookReason; error?: string; maxMode?: string };

export type InstantBookEligibility = {
  eligible: boolean;
  fixedRateCents: number | null;
  fixedRateDollars: number | null;
  currencyCode: string;
};

/**
 * Resolve a staff actor for a tenant — preferring owner > admin > manager —
 * so the staff-gated offer steps pass validateActorPermission. Falls back to a
 * super_admin profile so a hub-owned talent (no agency staff) still works.
 */
async function resolveTenantStaffActor(
  admin: SupabaseClient,
  tenantId: string,
): Promise<string | null> {
  const { data: members } = await admin
    .from("agency_memberships")
    .select("profile_id, role")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .in("role", ["owner", "admin", "manager"]);
  const rows = (members ?? []) as { profile_id: string; role: string }[];
  const rank: Record<string, number> = { owner: 0, admin: 1, manager: 2 };
  rows.sort((a, b) => (rank[a.role] ?? 9) - (rank[b.role] ?? 9));
  if (rows[0]?.profile_id) return rows[0].profile_id;

  const { data: sa } = await admin
    .from("profiles")
    .select("id")
    .eq("app_role", "super_admin")
    .limit(1)
    .maybeSingle();
  return (sa?.id as string | undefined) ?? null;
}

/**
 * Eligibility for the public talent-profile CTA. Reads the talent opt-in +
 * fixed rate and the tenant switch; returns the display rate. Pure read.
 */
export async function loadInstantBookEligibility(
  talentProfileId: string,
  tenantId: string,
  currencyCode = "USD",
): Promise<InstantBookEligibility> {
  const out: InstantBookEligibility = {
    eligible: false,
    fixedRateCents: null,
    fixedRateDollars: null,
    currencyCode,
  };
  const admin = createServiceRoleClient();
  if (!admin) return out;
  try {
    const [{ data: tp }, { data: ag }] = await Promise.all([
      admin
        .from("talent_profiles")
        .select("booking_terms, services_menu")
        .eq("id", talentProfileId)
        .maybeSingle(),
      admin.from("agencies").select("settings").eq("id", tenantId).maybeSingle(),
    ]);
    const talentTerms = parseTalentBookingTerms(tp?.booking_terms ?? null);
    const tenantTerms = parseTenantCommercialTerms(ag?.settings ?? null);
    // S16 — a services-menu service flagged instant-book (priced, active) is the
    // newer talent-facing surface; it drives instant-book and takes precedence
    // over the legacy booking_terms.fixedRateCents. Its presence also satisfies
    // opt-in (flagging a service IS opting in for that service).
    const menuItem = findInstantBookService(
      normalizeServicesMenu((tp as { services_menu?: unknown } | null)?.services_menu),
    );
    const menuRateCents = menuItem?.amountCents ?? null;
    const optIn = talentTerms?.instantBookOptIn === true || menuItem != null;
    const fixed = menuRateCents ?? talentTerms?.fixedRateCents ?? null;
    const tenantOn = tenantTerms?.instantBookEnabled === true;
    out.fixedRateCents = fixed;
    out.fixedRateDollars = fixed != null ? fixed / 100 : null;
    out.eligible = optIn && tenantOn && fixed != null && fixed > 0;
    return out;
  } catch (err) {
    logServerError("instantBook.eligibility", err);
    return out;
  }
}

/**
 * Run the full instant-book flow. `clientSb` MUST be the authenticated client's
 * session client (used for the convert RPC's auth.uid() check). All other
 * writes go through the service-role client created here.
 */
export async function createInstantBooking(
  clientSb: SupabaseClient,
  input: InstantBookInput,
): Promise<InstantBookResult> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "engine_error", error: "Database not available." };
  if (!input.clientUserId) return { ok: false, reason: "not_authenticated" };

  try {
    // ── Step 0 — eligibility (server-side, every call) ──────────────────────
    const [{ data: tp }, { data: ag }] = await Promise.all([
      admin
        .from("talent_profiles")
        .select("booking_terms, display_name, services_menu")
        .eq("id", input.talentProfileId)
        .maybeSingle(),
      admin.from("agencies").select("settings, plan_tier").eq("id", input.tenantId).maybeSingle(),
    ]);
    const talentTerms = parseTalentBookingTerms(tp?.booking_terms ?? null);
    const tenantTerms = parseTenantCommercialTerms(ag?.settings ?? null);
    const planGate = assertInstantPlanCeiling(
      (ag as { plan_tier?: string | null } | null)?.plan_tier,
    );
    if (!planGate.ok) {
      return {
        ok: false,
        reason: "plan_lacks_capability",
        error: "This plan cannot auto-confirm. Send a request or upgrade.",
        maxMode: planGate.maxMode,
      };
    }
    // S16 — same precedence as loadInstantBookEligibility: a priced, active
    // services-menu instant-book service drives the rate + satisfies opt-in.
    const menuItem = findInstantBookService(
      normalizeServicesMenu((tp as { services_menu?: unknown } | null)?.services_menu),
    );
    // ── Storefront direct booking (offering-driven) ─────────────────────────
    // A talent_offerings row with booking_mode='instant' IS the talent's
    // per-service opt-in; the tenant gate stays respected when EXPLICITLY
    // disabled (instantBookEnabled === false blocks; unset allows — the
    // per-service choice is the sharper signal).
    let offering: ReturnType<typeof rowToOffering> | null = null;
    if (input.offeringId) {
      const { data: offRow } = await admin
        .from("talent_offerings")
        .select("*")
        .eq("id", input.offeringId)
        .eq("talent_profile_id", input.talentProfileId)
        .maybeSingle();
      if (!offRow) return { ok: false, reason: "no_fixed_rate" };
      offering = rowToOffering(offRow as TalentOfferingRow);
      if (!offeringIsDirectlyBookable(offering)) {
        return { ok: false, reason: "instant_book_not_enabled" };
      }
      if (tenantTerms?.instantBookEnabled === false) {
        return { ok: false, reason: "instant_book_not_enabled" };
      }
    }

    // D4 — resolve the chosen variant + add-ons SERVER-SIDE (never trust client
    // cents). A submitted id that doesn't belong to this offering refuses.
    type ChosenVariant = { id: string; label: string; amount_cents: number | null };
    let variant: ChosenVariant | null = null;
    let chosenAddOns: { id: string; label: string; amount_cents: number }[] = [];
    if (offering && input.variantId) {
      const { data: vRow } = await admin
        .from("talent_offering_variants")
        .select("id, label, amount_cents")
        .eq("id", input.variantId)
        .eq("offering_id", offering.id)
        .maybeSingle();
      if (!vRow) return { ok: false, reason: "no_fixed_rate", error: "unknown_variant" };
      variant = vRow as ChosenVariant;
    }
    if (offering && (input.addOnIds?.length ?? 0) > 0) {
      const ids = [...new Set(input.addOnIds!)].slice(0, 30);
      const { data: aRows } = await admin
        .from("talent_offering_addons")
        .select("id, label, amount_cents")
        .in("id", ids)
        .eq("offering_id", offering.id);
      chosenAddOns = ((aRows ?? []) as typeof chosenAddOns).filter(
        (a) => typeof a.amount_cents === "number" && a.amount_cents >= 0,
      );
      if (chosenAddOns.length !== ids.length) {
        return { ok: false, reason: "no_fixed_rate", error: "unknown_addon" };
      }
    }

    // D5 — quantity: per-unit price types and products only; everything else 1.
    const qtyEligible =
      offering != null &&
      ((QUANTITY_UNITS as readonly string[]).includes(offering.priceType) || offering.kind === "product");
    const quantity = qtyEligible
      ? Math.max(1, Math.min(999, Math.round(input.quantity ?? 1)))
      : 1;

    // W3-8 — PRODUCT stock: atomically reserve the units before any money step;
    // a sold-out product refuses cleanly (no inquiry/offer/charge is created).
    // Compensation: released on any later engine failure in this call.
    let stockReserved = false;
    if (offering && offering.kind === "product" && offering.inventoryQty != null) {
      const { data: got } = await admin.rpc("reserve_offering_stock", {
        p_offering_id: offering.id,
        p_qty: quantity,
      });
      if (got !== true) return { ok: false, reason: "no_fixed_rate", error: "sold_out" };
      stockReserved = true;
    }
    let placedHoldId: string | null = null;
    const releaseStock = async () => {
      if (stockReserved && offering) {
        await admin.rpc("release_offering_stock", { p_offering_id: offering.id, p_qty: quantity });
      }
      if (placedHoldId) {
        await releaseReservationHold(admin, placedHoldId);
        placedHoldId = null;
      }
    };

    const optIn = offering != null || talentTerms?.instantBookOptIn === true || menuItem != null;
    if (!optIn || (offering == null && tenantTerms?.instantBookEnabled !== true)) {
      return { ok: false, reason: "instant_book_not_enabled" };
    }
    // D4/D5 price resolution: the chosen variant's price (when set) overrides
    // the offering's base; quantity multiplies the unit; extras stack on top.
    // Legacy menu/fixed-rate paths keep booking exactly one unit at base.
    const unitCents =
      variant?.amount_cents ?? offering?.amountCents ?? menuItem?.amountCents ?? talentTerms?.fixedRateCents ?? null;
    if (unitCents == null || unitCents <= 0) {
      return { ok: false, reason: "no_fixed_rate" };
    }
    const addOnTotalCents = chosenAddOns.reduce((s, a) => s + a.amount_cents, 0);
    const orderTotalCents = unitCents * quantity + addOnTotalCents;
    const unitDollars = unitCents / 100;
    const orderTotalDollars = orderTotalCents / 100;
    const currency = (offering?.currency ?? input.currencyCode ?? "USD").toUpperCase();
    const talentName = (tp?.display_name as string | null)?.trim() || "Talent";
    const payInPerson = input.payInPerson === true && offering?.allowPayInPerson === true;
    // Reserve mode (W2-A): free = confirm the reservation without a card
    // request (staff collect later); deposit = bill offering.depositPct now via
    // the existing deposit/balance rail (offer terms drive Step 8's split).
    const freeReserve = offering?.reserveMode === "free";
    const offeringDepositPct =
      offering?.reserveMode === "deposit" && offering.depositPct ? offering.depositPct : null;

    const staffActor = await resolveTenantStaffActor(admin, input.tenantId);
    if (!staffActor) return { ok: false, reason: "engine_error", error: "No staff actor for tenant." };

    const reservationWindow = input.reservation ?? null;
    const offeringIdForStamp = offering?.id ?? input.offeringId ?? null;
    if (reservationWindow && offeringIdForStamp) {
      const hold = await placeReservationHold(admin, {
        talentProfileId: input.talentProfileId,
        tenantId: input.tenantId,
        startsAt: reservationWindow.startsAt,
        endsAt: reservationWindow.endsAt,
        title: offering?.title ?? "Reservation",
        createdByUserId: input.clientUserId,
      });
      if (!hold.ok) {
        await releaseStock();
        return {
          ok: false,
          reason: hold.code === "slot_taken" ? "slot_taken" : "engine_error",
          error: hold.error,
        };
      }
      placedHoldId = hold.holdId;
    }

    const reservationStamp =
      reservationWindow && offeringIdForStamp
        ? reservationStampForInstant({
            offeringId: offeringIdForStamp,
            window: reservationWindow,
            durationMinutes: offering?.durationMinutes ?? 60,
            holdId: placedHoldId,
          })
        : null;

    // ── Step 1 — create the inquiry (client-initiated) ──────────────────────
    const inq = await submitInquiry(admin, {
      contact_name: input.contactName,
      contact_email: input.contactEmail,
      contact_phone: input.contactPhone ?? null,
      event_date: input.eventDate ?? null,
      event_location: input.eventLocation ?? null,
      source_page: input.sourcePage ?? null,
      source_channel: "instant_book",
      source_context: {
        ...(offering
          ? {
              offering: {
                offering_id: offering.id,
                title: offering.title,
                amount_cents: offering.amountCents,
                currency: offering.currency,
                price_type: offering.priceType,
                kind: offering.kind,
                pay_in_person: payInPerson,
                reserve: offering.reserveMode,
                stock_reserved: stockReserved,
                stock_reserved_qty: stockReserved ? quantity : 0,
                quantity,
                variant_id: variant?.id ?? null,
                variant_label: variant?.label ?? null,
                add_ons: chosenAddOns.map((a) => ({
                  id: a.id,
                  label: a.label,
                  amount_cents: a.amount_cents,
                })),
                order_total_cents: orderTotalCents,
              },
            }
          : {}),
        ...(reservationStamp ? { reservation: reservationStamp } : {}),
      },
      client_user_id: input.clientUserId,
      talent_profile_ids: [input.talentProfileId],
      actorUserId: input.clientUserId,
      initiator_role: "client",
      tenant_id: input.tenantId,
      source_workspace_id: input.sourceWorkspaceId ?? input.tenantId,
      quantity,
      message: offering ? `Direct booking: ${offering.title}` : "Instant booking",
    });
    if (!(inq as { success?: boolean }).success) {
      await releaseStock();
      return { ok: false, reason: "engine_error", error: "submit:" + JSON.stringify(inq) };
    }
    const inquiryId = (inq as { data: { inquiryId: string } }).data.inquiryId;
    if (placedHoldId) {
      await attachReservationHoldToInquiry(admin, placedHoldId, inquiryId);
    }

    // The talent participant's owning party (engine_send_offer needs it set for
    // line-item talents); resolveOwningPartyForTalent already stamped it at
    // submit. No override needed for the common roster path.

    // ── Step 2 — create the draft offer (staff) ─────────────────────────────
    const off = await createOffer(admin, {
      inquiryId,
      tenantId: input.tenantId,
      actorUserId: staffActor,
      expectedVersion: 1,
      currencyCode: currency,
    });
    if (!(off as { success?: boolean }).success) {
      await releaseStock();
      return { ok: false, reason: "engine_error", error: "createOffer:" + JSON.stringify(off) };
    }
    const offerId = (off as { data: { offerId: string } }).data.offerId;

    // ── Step 3 — populate the fixed-rate line item (staff) ──────────────────
    const inqV2 = await admin.from("inquiries").select("version").eq("id", inquiryId).maybeSingle();
    const offV1 = await admin.from("inquiry_offers").select("version").eq("id", offerId).maybeSingle();
    const upd = await updateOfferDraft(admin, {
      inquiryId,
      tenantId: input.tenantId,
      offerId,
      actorUserId: staffActor,
      inquiryExpectedVersion: Number((inqV2.data as { version: number } | null)?.version ?? 1),
      offerExpectedVersion: Number((offV1.data as { version: number } | null)?.version ?? 1),
      total_client_price: orderTotalDollars,
      coordinator_fee: 0,
      currency_code: currency,
      notes: null,
      lineItems: [
        {
          talent_profile_id: input.talentProfileId,
          // Name the line after the booked offering/service when driven by one;
          // a chosen variant rides in the label so the thread reads the order.
          label:
            (offering?.title ?? menuItem?.name ?? talentName) + (variant ? ` (${variant.label})` : ""),
          pricing_unit: offering?.priceType ?? "event",
          units: quantity,
          unit_price: unitDollars,
          total_price: Math.round(unitCents * quantity) / 100,
          // PER-UNIT (the resolver computes talent_full = Σ units × talent_cost
          // and refuses talent_cost > unit_price) — never the line total.
          talent_cost: unitDollars,
          notes: null,
          sort_order: 0,
          source_service_id: offering?.id ?? menuItem?.id ?? null, // S18 — audit stamp
        },
        // D4 — each chosen extra is its own line (full provenance in the offer).
        ...chosenAddOns.map((a, i) => ({
          talent_profile_id: input.talentProfileId,
          label: a.label,
          pricing_unit: "flat_package" as const,
          units: 1,
          unit_price: a.amount_cents / 100,
          total_price: a.amount_cents / 100,
          talent_cost: a.amount_cents / 100,
          notes: null,
          sort_order: i + 1,
          source_service_id: offering?.id ?? null,
        })),
      ],
    });
    if (!(upd as { success?: boolean }).success) {
      await releaseStock();
      return { ok: false, reason: "engine_error", error: "updateOffer:" + JSON.stringify(upd) };
    }

    // Offering-chosen deposit: stamp the offer terms BEFORE send/convert so the
    // existing Step-8 deposit derivation (readOfferTermsFromRow) bills exactly
    // the talent's configured reserve percentage.
    if (offeringDepositPct != null) {
      const { error: depTermErr } = await admin
        .from("inquiry_offers")
        .update({ deposit_pct: offeringDepositPct })
        .eq("id", offerId)
        .eq("tenant_id", input.tenantId);
      if (depTermErr) logServerError("instantBook.offering_deposit_terms", depTermErr);
    }

    // ── Step 4 — send the offer (seeds approvals; staff) ────────────────────
    const inqV3 = await admin.from("inquiries").select("version").eq("id", inquiryId).maybeSingle();
    const offV2 = await admin.from("inquiry_offers").select("version").eq("id", offerId).maybeSingle();
    const sent = await sendOffer(admin, {
      inquiryId,
      tenantId: input.tenantId,
      offerId,
      actorUserId: staffActor,
      inquiryExpectedVersion: Number((inqV3.data as { version: number } | null)?.version ?? 1),
      offerExpectedVersion: Number((offV2.data as { version: number } | null)?.version ?? 1),
    });
    if (!(sent as { success?: boolean }).success) {
      await releaseStock();
      return { ok: false, reason: "engine_error", error: "sendOffer:" + JSON.stringify(sent) };
    }

    // ── Steps 5+6 — accept ALL approvals (talent opted in; client clicked
    // "Book now" = implicit accept) so the inquiry flips to 'approved'. Driven
    // via engine_submit_approval under service-role with each participant's own
    // user_id as the actor — the engine's own all-accepted check then advances
    // the inquiry. (The talent's instant-book opt-in IS their authorisation; the
    // RPC has no auth.uid() guard, unlike convert.)
    const { data: apprRows } = await admin
      .from("inquiry_approvals")
      .select("id, participant_id")
      .eq("inquiry_id", inquiryId)
      .eq("offer_id", offerId);
    const { data: partRows } = await admin
      .from("inquiry_participants")
      .select("id, user_id")
      .eq("inquiry_id", inquiryId);
    const userByParticipant = new Map<string, string | null>(
      ((partRows ?? []) as { id: string; user_id: string | null }[]).map((p) => [p.id, p.user_id]),
    );
    for (const a of (apprRows ?? []) as { id: string; participant_id: string }[]) {
      const inqVa = await admin.from("inquiries").select("version").eq("id", inquiryId).maybeSingle();
      const actor = userByParticipant.get(a.participant_id) ?? input.clientUserId;
      const { error: apprErr } = await admin.rpc("engine_submit_approval", {
        p_inquiry_id: inquiryId,
        p_offer_id: offerId,
        p_participant_id: a.participant_id,
        p_actor_user_id: actor,
        p_inquiry_expected_version: Number((inqVa.data as { version: number } | null)?.version ?? 1),
        p_decision: "accepted",
      });
      if (apprErr) {
        return { ok: false, reason: "engine_error", error: "approval:" + apprErr.message };
      }
    }

    // ── Step 7 — convert to booking (client session: auth.uid()==client) ────
    const inqV5 = await admin.from("inquiries").select("version, status").eq("id", inquiryId).maybeSingle();
    const expectedVersion = Number((inqV5.data as { version: number } | null)?.version ?? 1);
    const { data: bookingIdData, error: convertErr } = await clientSb.rpc("engine_convert_to_booking", {
      p_inquiry_id: inquiryId,
      p_actor_user_id: input.clientUserId,
      p_inquiry_expected_version: expectedVersion,
      p_override_reason: null,
    });
    if (convertErr || !bookingIdData) {
      return { ok: false, reason: "engine_error", error: "convert:" + (convertErr?.message ?? "no booking id") };
    }
    const bookingId = bookingIdData as string;
    // Re-stamp owner/creator to the tenant staff actor (the convert ran as the
    // client for the auth.uid() gate; the booking belongs to the agency staff).
    // Also stamp booking_sub_type='product' so the payout gate defers this
    // booking's transfer until the item ships (see transfers.ts / fulfillment.ts).
    await admin
      .from("agency_bookings")
      .update({
        owner_staff_id: staffActor,
        created_by_staff_id: staffActor,
        ...(offering?.kind === "product" ? { booking_sub_type: "product" } : {}),
      })
      .eq("id", bookingId);

    // Persist the commission snapshot — convertToBooking's TS wrapper does this
    // after the RPC, but we call the RPC directly (client session), so it's our
    // job. FATAL (matches the coordinator path's P1 money-hardening): a booking
    // with no snapshot can never pay the talent AND the payment fallback would
    // bill the raw rate (no surcharge). Compensate: return the reserved stock,
    // delete the orphan booking (cascades its children), and fail the call —
    // the client can retry or use the inquiry path; the inquiry itself stays
    // for coordinator follow-up.
    // A pay-in-person booking settles OFF-PLATFORM (cash/efectivo): stamp the
    // snapshot payment_method='cash' at creation. Defaulting to 'card' (the prior
    // behavior) mis-ledgered every efectivo booking as an on-platform card charge
    // — the settlement logic then waited on a Stripe charge that never comes
    // (transaction stuck draft, payment_status unpaid), and the Messages-shell
    // "mark as cash" couldn't reclassify an existing card snapshot. Stamping cash
    // up front makes the off-platform balance accrue correctly.
    const snap = await persistBookingCommissionSnapshot(
      admin,
      bookingId,
      payInPerson ? "cash" : "card",
      payInPerson ? "pay_in_person" : null,
    );
    if (!snap.ok) {
      logServerError("instantBook.commission_snapshot", new Error(`booking ${bookingId}: ${snap.reason ?? "persist_failed"}`));
      await releaseStock();
      await admin.from("agency_bookings").delete().eq("id", bookingId);
      return { ok: false, reason: "engine_error", error: `commission_snapshot:${snap.reason ?? "persist_failed"}` };
    }

    // P2: stamp is on source_context.reservation — enrichment writes times,
    // inserts talent_bookings, deletes the hold.
    try {
      const enriched = await enrichBookingFromReservation(admin, {
        inquiryId,
        bookingId,
        actorUserId: staffActor,
      });
      if (!enriched.ok) {
        logServerError("instantBook.reservation_enrichment", new Error(enriched.error));
        if (reservationStamp) {
          await releaseStock();
          await admin.from("agency_bookings").delete().eq("id", bookingId);
          return { ok: false, reason: "engine_error", error: enriched.error };
        }
      } else if (reservationStamp && enriched.applied) {
        placedHoldId = null;
        await emitInstantReservationConfirmed(admin, {
          inquiryId,
          tenantId: input.tenantId,
          actorUserId: input.clientUserId,
          stamp: reservationStamp,
          agencySettings: ag?.settings,
        });
      }
    } catch (enrichErr) {
      logServerError("instantBook.reservation_enrichment", enrichErr);
      if (reservationStamp) {
        await releaseStock();
        await admin.from("agency_bookings").delete().eq("id", bookingId);
        return {
          ok: false,
          reason: "engine_error",
          error: enrichErr instanceof Error ? enrichErr.message : String(enrichErr),
        };
      }
    }

    // ── Step 8 — create + request the payment ───────────────────────────────
    // A2 — charge the SAME client total a normal offer would for this fixed rate:
    // subtotal + platform surcharge (+ workspace base fee), NOT the bare talent
    // rate. The commission snapshot persisted above froze gross_charged_cents
    // (subtotal + client surcharge + base fee) and platform_fee_cents; bill those
    // — exactly as the offer path does in admin/_pipeline-actions.ts. Charging the
    // raw fixedRateCents undercharged the client (the platform's client-side
    // surcharge was never collected) vs. the offer path for identical inputs.
    //
    // The surcharge percentage is NOT hand-rolled here: it is computed by the
    // shared commission resolver inside persistBookingCommissionSnapshot and read
    // back via these snapshot sums. Falls back to the bare fixed rate only when no
    // snapshot exists (rare — the snapshot persist above failed).
    const grossChargedCents = await sumBookingGrossChargedCents(admin, bookingId);
    const fullGrossCents = grossChargedCents > 0 ? grossChargedCents : orderTotalCents;
    const snapshotPlatformFeeCents = await sumBookingPlatformFeeCents(admin, bookingId);

    // A2 — apply a deposit when the offer's resolved terms specify one. The offer
    // carries the negotiated/defaulted deposit terms (W6a, set in updateOfferDraft);
    // derive the deposit from the FULL client gross (mirrors the offer path's
    // deposit-from-fullGross derivation in _pipeline-actions.ts) so the deposit is
    // never under-billed relative to the surcharge-inclusive total. Absent a valid
    // deposit (0 or ≥ full), charge the full amount in one go.
    const { data: offerTermsRow } = await admin
      .from("inquiry_offers")
      .select("deposit_pct, deposit_amount_cents, balance_collection_method, refund_policy_key")
      .eq("id", offerId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();
    const offerTerms = readOfferTermsFromRow(
      (offerTermsRow as {
        deposit_pct?: number | string | null;
        deposit_amount_cents?: number | string | null;
        balance_collection_method?: string | null;
        refund_policy_key?: string | null;
      } | null) ?? null,
      fullGrossCents,
    );
    const depositCents =
      offerTerms != null
        ? Math.round((fullGrossCents * offerTerms.depositPct) / 100)
        : 0;
    const isDeposit = depositCents > 0 && depositCents < fullGrossCents;
    const grossAmountCents = isDeposit ? depositCents : fullGrossCents;

    // When a deposit is charged, snapshot the agreed terms onto the booking the
    // way convertToBooking's TS wrapper (snapshotOfferTermsOntoBooking) does —
    // the raw convert RPC we drive here skips that step. Without it the
    // deposit-paid → balance-due lifecycle (markPaid's balance card + the later
    // balance charge) has no deposit context on agency_bookings. Non-fatal.
    if (isDeposit && offerTerms != null) {
      const { error: depErr } = await admin
        .from("agency_bookings")
        .update({
          deposit_pct: offerTerms.depositPct,
          deposit_amount_cents: depositCents,
          deposit_currency: currency,
          balance_collection_method: offerTerms.balanceMethod,
          refund_policy_key: offerTerms.refundPolicy,
        })
        .eq("id", bookingId);
      if (depErr) logServerError("instantBook.deposit_terms_snapshot", depErr);
    }

    // Pro-rate the snapshot platform fee to the charged slice (matches the offer
    // path); null when there's no snapshot fee to pro-rate.
    const platformFeeOverride =
      grossChargedCents > 0 && snapshotPlatformFeeCents > 0
        ? Math.round(snapshotPlatformFeeCents * (grossAmountCents / fullGrossCents))
        : null;

    const txn = await createBookingTransaction({
      bookingId,
      sourceTenantId: input.tenantId,
      sourceInquiryId: inquiryId,
      planTier: "agency",
      grossAmountCents,
      platformFeeCentsOverride: platformFeeOverride,
      currency,
      payerUserId: input.clientUserId,
      payerEmail: input.contactEmail,
      createdByProfileId: staffActor,
      checkoutType: isDeposit ? "deposit" : "full",
    });
    if (!txn.ok) {
      return { ok: false, reason: "engine_error", error: "txn:" + txn.error };
    }
    const candidates = await loadPayoutReceiverCandidatesForBooking({
      tenantId: input.tenantId,
      bookingId,
      supabase: admin,
    });
    // Prefer the talent's own payout account; fall back to any other candidate
    // (the workspace is the seller-of-record — Connect transfers fan out from
    // it), so a card "Book now" still produces a payment request when the
    // talent hasn't connected Stripe yet. No candidate at all → the txn stays
    // draft and staff request payment from the Messages Offer tab.
    const talentCand =
      candidates.find((c) => c.receiverKind === "talent") ?? candidates[0] ?? null;
    if (talentCand) {
      await setTransactionPayoutReceiver({
        transactionId: txn.data.id,
        payoutAccountId: talentCand.payoutAccountId,
        sourceTenantId: input.tenantId,
      });
      // Pay-in-person: the reservation stands (booking confirmed, transaction
      // drafted with the surcharge-inclusive gross) but NO card request is
      // emitted — staff/talent collect at the appointment and mark it paid
      // (payment_method cash) from the Messages shell.
      if (!payInPerson && !freeReserve) {
        await requestPayment(txn.data.id);
      }
    }

    return { ok: true, inquiryId, bookingId, transactionId: txn.data.id };
  } catch (err) {
    logServerError("instantBook.create", err);
    return { ok: false, reason: "engine_error", error: err instanceof Error ? err.message : String(err) };
  }
}
