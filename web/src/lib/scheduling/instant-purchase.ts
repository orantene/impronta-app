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
import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

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
};

export type InstantPurchaseResult =
  | PurchaseResult
  | { ok: false; reason: "engine_error"; error: string };

/**
 * `tenantScopedQuery` answers untyped rows. These read the two fields the
 * composition needs off a row, refusing the shape rather than casting it.
 */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function policyOf(row: unknown): { reserveMode: string | null; attributes: unknown } {
  if (!isRecord(row)) return { reserveMode: null, attributes: null };
  return {
    reserveMode: typeof row.reserve_mode === "string" ? row.reserve_mode : null,
    attributes: row.attributes ?? null,
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
    .select("reserve_mode, attributes")
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
    paymentChoice: instantBookPaymentChoice(input.payInPerson, policy.reserveMode),
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
    openThread: input.openThread,
  });
}
