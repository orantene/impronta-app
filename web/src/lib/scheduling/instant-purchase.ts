/* eslint-disable ratchet/no-untenanted-from -- talent_booking_hours is one row per person; a tenant filter would hide hours and fork the calendar (same as instant-book-hours). */
/**
 * instant-purchase.ts — how an instant booking becomes ONE `createPurchase`
 * call: the offering's stock pool, the treatment room, the companion
 * therapists, the person's calendar slot, and the payment intent the
 * offering's own policy allows.
 *
 * WHY THIS LEFT `instant-book-action.ts`. That file is `"use server"`, so the
 * composition below could only ever be reached by a browser request from the
 * public `/book` page. The point of sale's Classes mode books the same
 * appointment for a walk-in standing at the desk, and a second copy of
 * "which pools does this offering need" is how a room gets held on one path
 * and not the other. The action now calls this; so does the till. Behaviour
 * is unchanged: this is the block that lived between `loadOfferingCapacityPoolId`
 * and `createPurchase` in the action, moved, not rewritten.
 *
 * WHAT IT DOES NOT DO. No auth, no captcha, no checkout session, no guest
 * notification: those are the caller's, because they differ between a guest
 * on the website and a staff member at a till.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { createPurchase } from "@/lib/orders/purchase";
import { loadOfferingCapacityPoolId } from "@/lib/orders/purchase-catalog";
import type { PurchaseResult } from "@/lib/orders/purchase-types";
import { parseOfferingResourceSet } from "@/lib/resources/offering-resource-set";
import { spaceCapacityPool } from "@/lib/resources/reserve-set";
import { instantBookPaymentChoice } from "@/lib/scheduling/instant-book-payment-choice";
import {
  assertInstantPosture,
  assertReservationMeetsNotice,
} from "@/lib/scheduling/instant-book-gates";
import { parseBookingHours } from "@/lib/scheduling/hours-types";
import { hoursHaveOpenWindow } from "@/lib/scheduling/public-slots";
import {
  bookingDurationMinutes,
  validateReservationWindow,
  type ReservationWindowRefusal,
} from "@/lib/scheduling/reservation-window";
import { loadAddonGroupsForOfferings } from "@/lib/talent/merge-addon-groups";
import { resolveOfferingPolicy } from "@/lib/talent/offering-policy-resolver";
import { logServerError } from "@/lib/server/safe-error";
import { hoursRowHasWorkingHours, loadTalentSiteSwitches } from "@/lib/talent/site-switches-server";
import { instantReadiness, readinessGaps, takesMoneyOnline } from "@/lib/talent/accepting-readiness";
import { isPlatformCheckoutReady } from "@/lib/talent/online-collect-ready";
import { isValidIanaTimeZone } from "@/lib/scheduling/tz";
import { loadPlanAllowsInstant } from "@/lib/talent/plan-instant.server";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { loadLatestPolicyVersionId } from "@/lib/talent-policies/public";
import type { OfferingTaskBrief } from "@/lib/talent/offering-task-brief";

export type InstantPurchaseInput = {
  tenantId: string;
  offeringId: string;
  talentProfileId: string;
  /** Null for a guest. Never invented. */
  actorUserId: string | null;
  contact: { email: string | null; phone: string | null; displayName: string };
  quantity: number;
  variantId: string | null;
  addOnIds: string[];
  reservation: { startsAt: string; endsAt: string } | null;
  /** INTENT. The pipeline re-derives policy from the offering row. */
  payInPerson: boolean | undefined;
  sourceChannel: string;
  sourcePage: string | null;
  /** Per CART, not per click. The idempotency anchor. */
  clientOrderKey: string;
  openThread: boolean;
  /** Cookie guest id so `/c/[inquiryId]` owns the thread after confirm. */
  guestSessionId?: string | null;
  /** Gridline G9b: task-picker brief, onto the thread inquiry's source_context. */
  brief?: OfferingTaskBrief | null;
  /** G13: buyer locale for the intake answers' heading in the thread. */
  locale?: string | null;
  /** TUL-426: where the service happens (sheet payload); stamped onto the inquiry. */
  eventLocation?: string | null;
  /**
   * True only for the point of sale booking a walk-in at the desk. Staff are
   * the confirmation there, so the inquiry-only posture and the public open
   * hours / horizon checks do not apply; duration and notice still do.
   */
  staffDesk?: boolean;
  /**
   * WSF-C §7: an agency storefront booking the talent. The agency owns that
   * routing, so the talent's own "Accept new bookings" switch does not apply.
   * Omitted = a direct channel (own website / Tulala profile): enforced.
   */
  agencyRouted?: boolean;
};

export type InstantPurchaseResult =
  | PurchaseResult
  | {
      ok: false;
      reason:
        | "engine_error"
        | "too_soon"
        | "inquiry_only"
        | "request_only"
        | "not_accepting_bookings"
        | ReservationWindowRefusal;
      error: string;
    };

/**
 * `tenantScopedQuery` answers untyped rows. These read the two fields the
 * composition needs off a row, refusing the shape rather than casting it.
 */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

type OfferingPolicyRow = {
  reserveMode: string | null;
  depositPct: number | null;
  cancellationHours: number | null;
  bookingMode: string | null;
  durationMinutes: number | null;
  attributes: unknown;
  kind: string | null;
};

function policyOf(row: unknown): OfferingPolicyRow {
  if (!isRecord(row)) {
    return {
      reserveMode: null,
      depositPct: null,
      cancellationHours: null,
      bookingMode: null,
      durationMinutes: null,
      attributes: null,
      kind: null,
    };
  }
  return {
    reserveMode: typeof row.reserve_mode === "string" ? row.reserve_mode : null,
    depositPct: numOrNull(row.deposit_pct),
    cancellationHours: numOrNull(row.cancellation_hours),
    bookingMode: typeof row.booking_mode === "string" ? row.booking_mode : null,
    durationMinutes: numOrNull(row.duration_minutes),
    attributes: row.attributes ?? null,
    kind: typeof row.kind === "string" ? row.kind : null,
  };
}

function talentProfileIdOf(row: unknown): string | null {
  if (!isRecord(row)) return null;
  return typeof row.talent_profile_id === "string" ? row.talent_profile_id : null;
}

export async function placeInstantPurchase(
  admin: SupabaseClient,
  input: InstantPurchaseInput,
): Promise<InstantPurchaseResult> {
  const { offeringId, tenantId } = input;

  // A read failure REFUSES rather than resolving to "no pool". `null`
  // means unlimited, so treating an error as null would sell unlimited
  // seats on a transient database fault. A failed read is a retry; an
  // oversold event is a person turned away at a door.
  const pool = await loadOfferingCapacityPoolId(admin, offeringId);
  if (!pool.ok) {
    logServerError(
      "instantPurchase.poolLookup",
      new Error(`could not confirm availability for offering ${offeringId}`),
    );
    return {
      ok: false,
      reason: "engine_error",
      error: "We could not confirm availability. Please try again.",
    };
  }
  const poolId = pool.poolId;

  const { data: offeringPolicy, error: offeringPolicyErr } = await tenantScopedQuery(
    admin,
    "talent_offerings",
    tenantId,
  )
    .select("reserve_mode, deposit_pct, cancellation_hours, booking_mode, duration_minutes, attributes, kind")
    .eq("id", offeringId)
    .maybeSingle();
  if (offeringPolicyErr) {
    logServerError("instantPurchase.reserveMode", offeringPolicyErr);
    return {
      ok: false,
      reason: "engine_error",
      error: "We could not confirm how this is paid. Please try again.",
    };
  }

  const reservation = input.reservation;
  const policy = policyOf(offeringPolicy);

  // Talent defaults + hours row, read once: posture, deposit, buffers,
  // notice and the window check all resolve from these two rows.
  const [talentDefaultsRes, hoursRes, addOnRes, addOnGroups] = await Promise.all([
    admin
      .from("talent_profiles")
      .select("selling_defaults")
      .eq("id", input.talentProfileId)
      .maybeSingle(),
    // talent_booking_hours is one row per person (same as instant-book-hours).
    admin
      .from("talent_booking_hours")
      .select(
        "timezone, weekly, exceptions, slot_minutes, buffer_before_min, buffer_after_min, min_notice_min, horizon_days",
      )
      .eq("talent_profile_id", input.talentProfileId)
      .maybeSingle(),
    reservation && input.addOnIds.length > 0
      ? admin
          .from("talent_offering_addons")
          .select("id, duration_minutes")
          .eq("offering_id", offeringId)
          .in("id", input.addOnIds)
      : Promise.resolve({ data: [] as unknown[], error: null }),
    // Shared extras (talent_addon_groups) reach the sheet as add-ons too, with
    // the group id; their minutes lengthen the slot the same way.
    reservation && input.addOnIds.length > 0
      ? loadAddonGroupsForOfferings(admin, input.talentProfileId, [offeringId])
      : Promise.resolve([]),
  ]);
  if (talentDefaultsRes.error || hoursRes.error || addOnRes.error) {
    logServerError(
      "instantPurchase.bookingRules",
      talentDefaultsRes.error ?? hoursRes.error ?? addOnRes.error,
    );
    return {
      ok: false,
      reason: "engine_error",
      error: "We could not confirm the booking rules. Please try again.",
    };
  }
  const defaultsRaw = isRecord(talentDefaultsRes.data)
    ? (talentDefaultsRes.data.selling_defaults ?? {})
    : {};
  const hoursRow = isRecord(hoursRes.data) ? hoursRes.data : null;


  const effective = resolveOfferingPolicy(
    {
      reserveMode: policy.reserveMode,
      depositPct: policy.depositPct,
      cancellationHours: policy.cancellationHours,
      attributes: policy.attributes,
    },
    defaultsRaw,
    hoursRow
      ? {
          bufferBeforeMin: numOrNull(hoursRow.buffer_before_min),
          bufferAfterMin: numOrNull(hoursRow.buffer_after_min),
          minNoticeMin: numOrNull(hoursRow.min_notice_min),
        }
      : null,
  );

  // WSF-C: the talent's own "Accept new bookings" switch (direct channels
  // only, §7) and instant readiness (§1 row 4: hours, duration, payouts when
  // money is taken online). Not ready = instant falls back to request.
  const staffDesk = input.staffDesk === true;
  const switches =
    staffDesk || input.agencyRouted === true
      ? null
      : await loadTalentSiteSwitches(admin, input.talentProfileId);
  // F27: the plan ceiling is enforced here too, so a crafted request cannot
  // book instantly on a plan whose public site only offers request.
  const planAllowsInstant =
    staffDesk || input.agencyRouted === true
      ? undefined
      : (await loadPlanAllowsInstant(admin, [input.talentProfileId])).get(input.talentProfileId);
  const readiness = staffDesk
    ? null
    : instantReadiness(
        readinessGaps({
          kind: policy.kind,
          hasWorkingHours: hoursRowHasWorkingHours(hoursRow),
          durationMinutes: policy.durationMinutes,
          takesMoneyOnline: takesMoneyOnline(effective.reserveMode, input.payInPerson === true),
          payoutsReady: isPlatformCheckoutReady(),
          planAllowsInstant,
        }),
      );

  // F4: refuse unless the EFFECTIVE mode is instant (master switch, then the
  // offering's own mode, then the talent's default posture, then readiness).
  // The till books walk-ins at the desk and is exempt: staff are the
  // confirmation.
  const postureGate = assertInstantPosture({
    sellingDefaults: defaultsRaw,
    bookingMode: policy.bookingMode,
    staffDesk,
    accepting: switches ? switches.acceptingBookings : null,
    readiness,
  });
  if (!postureGate.ok) return postureGate;

  if (reservation) {
    const noticeGate = assertReservationMeetsNotice({
      startsAt: reservation.startsAt,
      minNoticeMin: effective.minNoticeMin,
    });
    if (!noticeGate.ok) {
      return { ok: false, reason: "too_soon", error: noticeGate.error };
    }

    // F3: the window is recomputed from rows, never trusted from the page.
    const addOnMinutes = ((addOnRes.data ?? []) as unknown[])
      .filter(isRecord)
      .map((r) => ({
        id: String(r.id),
        durationMinutes: numOrNull(r.duration_minutes),
      }))
      .concat(addOnGroups.map((g) => ({ id: g.id, durationMinutes: g.durationMinutes })));
    const expectedDurationMin = bookingDurationMinutes(
      policy.durationMinutes,
      addOnMinutes,
      input.addOnIds,
    );
    // The till books the desk's own clock; open hours and horizon are the
    // public page's contract.
    // A row with no open window is "no hours" to the slot engine too
    // (`no_booking_hours`), so it gets the same pass as a missing row.
    const parsedHours = input.staffDesk || !hoursRow ? null : parseBookingHours(hoursRow);
    const hours = parsedHours && hoursHaveOpenWindow(parsedHours) ? parsedHours : null;
    const windowGate = validateReservationWindow({
      startsAt: reservation.startsAt,
      endsAt: reservation.endsAt,
      expectedDurationMin,
      hours,
    });
    if (!windowGate.ok) {
      return { ok: false, reason: windowGate.reason, error: windowGate.error };
    }
  }

  const resourceSet = parseOfferingResourceSet(policy.attributes);
  const companionIds = resourceSet.companionTalentIds.filter((id) => id !== input.talentProfileId);
  if (companionIds.length > 0) {
    const { data: roster, error: rosterErr } = await tenantScopedQuery(
      admin,
      "agency_talent_roster",
      tenantId,
    )
      .select("talent_profile_id")
      .in("talent_profile_id", companionIds)
      .eq("status", "active");
    if (rosterErr) {
      logServerError("instantPurchase.companions", rosterErr);
      return {
        ok: false,
        reason: "engine_error",
        error: "We could not confirm who this treatment needs.",
      };
    }
    const onRoster = new Set(
      (roster ?? []).map(talentProfileIdOf).filter((id): id is string => id !== null),
    );
    if (companionIds.some((id) => !onRoster.has(id))) {
      return {
        ok: false,
        reason: "engine_error",
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
      units: input.quantity,
      ...(reservation ? { startsAt: reservation.startsAt, endsAt: reservation.endsAt } : {}),
    });
  }
  if (resourceSet.spaceId && reservation) {
    const room = await spaceCapacityPool(admin, { tenantId, spaceId: resourceSet.spaceId });
    if (!room.ok) {
      return {
        ok: false,
        reason: "engine_error",
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

  // Buffers: offering attr, then talent default, then the hours row, then 0.
  // The slot engine (applySellingTimeToHours over the hours row) uses the
  // same chain, so the hold pads exactly what the offered slot assumed.
  const bufferBeforeSeconds = effective.bufferBeforeMin * 60;
  const bufferAfterSeconds = effective.bufferAfterMin * 60;

  return createPurchase(admin, {
    tenantId,
    clientOrderKey: input.clientOrderKey,
    actorUserId: input.actorUserId,
    contact: {
      email: input.contact.email,
      phone: input.contact.phone,
      displayName: input.contact.displayName,
    },
    lines: [
      {
        offeringId,
        units: input.quantity,
        variantId: input.variantId,
        addonIds: input.addOnIds,
      },
    ],
    // INTENT, never policy. The pipeline re-derives reserve_mode,
    // deposit_pct, allow_pay_in_person and require_account_to_book from
    // the offering row and refuses if the client's choice disagrees.
    // A deposit offering used to send "full" and charge the whole total.
    paymentChoice: instantBookPaymentChoice(input.payInPerson, effective.reserveMode),
    sourceChannel: input.sourceChannel,
    sourcePage: input.sourcePage,
    capacity: capacity.length > 0 ? capacity : undefined,
    // The calendar slot, when this purchase takes someone's time. Capacity
    // and the slot are two different questions and both are on the
    // pipeline's unwind ledger.
    reservation: reservation
      ? {
          talentProfileId: input.talentProfileId,
          startsAt: reservation.startsAt,
          endsAt: reservation.endsAt,
          poolId,
          bufferBeforeSeconds,
          bufferAfterSeconds,
          timezone:
            typeof hoursRow?.timezone === "string" && isValidIanaTimeZone(hoursRow.timezone)
              ? hoursRow.timezone
              : null,
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
            bufferBeforeSeconds,
            bufferAfterSeconds,
          }))
        : undefined,
    openThread: input.openThread,
    guestSessionId: input.guestSessionId ?? null,
    brief: input.brief ?? null,
    locale: input.locale ?? null,
    eventLocation: input.eventLocation ?? null,
    // Snapshot: the talent's published policy the buyer saw at checkout.
    policyVersionId: await loadLatestPolicyVersionId(admin, input.talentProfileId),
  });
}
