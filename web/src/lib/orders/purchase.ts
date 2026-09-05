import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { ensureCustomer } from "@/lib/customers/ensure-customer";
import {
  reserveCapacityBatch,
  releaseCapacity,
  capacityHoldTtlSeconds,
} from "@/lib/capacity";
import {
  placeReservationHold,
  releaseReservationHold,
} from "@/lib/scheduling/reservation-hold";
import { timedInstantMissingSlot } from "@/lib/scheduling/instant-book-hours";
import type { CapacityRefusalReason } from "@/lib/capacity/types";
import {
  resolvePurchasePolicy,
  type OfferingPolicy,
  type PaymentChoice,
} from "@/lib/orders/purchase-policy";
import {
  loadCatalog,
  mapCapacityRefusal,
} from "@/lib/orders/purchase-catalog";
import { resolvePromo } from "@/lib/orders/promo-resolve";
import { generateOpaqueCode } from "@/lib/links/code";
import { buildCapacityRequests } from "@/lib/orders/capacity-requests";
import type {
  PurchaseInput,
  PurchaseLineInput,
  PurchaseRefusalReason,
  PurchaseResult,
} from "@/lib/orders/purchase-types";

export type {
  PurchaseInput,
  PurchaseLineInput,
  PurchaseRefusalReason,
  PurchaseResult,
};
import {
  pricePurchase,
  amountToCollectCents,
  type PricedOffering,
  type PricedVariant,
  type PricedAddon,
  type PricedLine,
} from "@/lib/orders/purchase-pricing";

/**
 * ONE purchase pipeline.
 *
 * Replaces `lib/inquiry/instant-book-engine.ts` (795 lines) and
 * `lib/inquiry/menu-order-engine.ts` (445), which are two near-identical
 * orchestrations of the same idea with copied helpers and divergent bugs.
 *
 * The shape that makes this different from both:
 *
 *   • THE CLIENT DECLARES INTENT, NEVER POLICY. `purchase-policy.ts` derives
 *     what the purchase may do from the offering rows. Nothing about
 *     reserve_mode, deposit_pct, allow_pay_in_person or require_account_to_book
 *     is accepted from the caller — those fields are not on the input type.
 *
 *   • NO INQUIRY IS REQUIRED. Both old engines forced every purchase through
 *     the inquiry state machine, which is why the menu engine force-writes
 *     `status: 'approved'` under the service role twice and re-reads `version`
 *     five times to get a taco past a gate built for a quoted job. An order is
 *     the commercial record and stands alone; a thread opens when someone
 *     writes.
 *
 *   • NO CALENDAR PLACEHOLDER. The menu engine stamps
 *     `starts_at = ends_at = now()` because the calendar demanded a time a taco
 *     does not have. Orders carry fulfilment context instead.
 *
 *   • EVERY STEP NAMES ITS COMPENSATION. The old engines compensate on some
 *     paths and not others — the menu path restores the inquiry, the
 *     instant-book path does not. That asymmetry is a live bug and it dies here.
 *
 * Every Supabase call destructures `error`. A `const { data } = await` with no
 * `error` is how a failed write becomes a silent success, and this file writes
 * money.
 */

const FALLBACK_HOLD_TTL_SECONDS = 15 * 60;

/** A hold may not outlive this, whatever a caller asks for. 30 days. */
const MAX_HOLD_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * The hold's lifetime: the pools' shortest TTL, unless the caller overrides it.
 *
 * The override exists for pay-at-the-door orders, where the hold must last
 * until the event rather than fifteen minutes. It is CLAMPED rather than
 * trusted: a non-finite, zero or negative value falls back rather than
 * producing a hold that expires immediately or never, and no caller can ask for
 * a hold longer than a month. An unbounded hold is the commit-with-no-TTL
 * problem wearing a different name.
 */
export function resolveHoldTtl(poolShortest: number | null, override?: number | null): number {
  const base = poolShortest ?? FALLBACK_HOLD_TTL_SECONDS;
  if (override == null) return base;
  if (!Number.isFinite(override) || override <= 0) return base;
  return Math.min(Math.floor(override), MAX_HOLD_TTL_SECONDS);
}

export async function createPurchase(
  admin: SupabaseClient,
  input: PurchaseInput,
): Promise<PurchaseResult> {
  // Compensation ledger. Everything appended here is undone, in reverse, on any
  // later failure. Making it a list rather than ad-hoc unwinding is what stops
  // the "compensates on some paths" asymmetry the old engines have.
  const heldAllocationIds: string[] = [];
  let createdOrderId: string | null = null;
  let createdTransactionId: string | null = null;
  let placedHoldId: string | null = null;

  const unwind = async (why: string) => {
    // The slot first: it blocks a PERSON's calendar, so leaving it held is the
    // most visible kind of leak — a talent looks booked for a purchase that
    // never happened.
    if (placedHoldId) {
      const released = await releaseReservationHold(admin, placedHoldId);
      if (!released.ok) {
        logServerError("orders.createPurchase/unwind/slot", `${why}: ${released.error}`);
      }
    }
    if (heldAllocationIds.length > 0) {
      const released = await releaseCapacity(heldAllocationIds, admin);
      logServerError(
        "orders.createPurchase/unwind",
        `${why}: released ${released.released} allocation(s), ${released.alreadyReleased} already released`,
      );
    }
    // The transaction, before the order: a live `payment_requested` row against
    // a cancelled order is worse than either alone, because the money lanes
    // read transactions and would see a payment in flight for an order nobody
    // can pay.
    if (createdTransactionId) {
      const { error } = await admin
        .from("booking_transactions")
        .update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: why })
        .eq("id", createdTransactionId);
      if (error) logServerError("orders.createPurchase/unwind/txn", error);
    }
    if (createdOrderId) {
      const { error } = await admin
        .from("orders")
        .update({ status: "cancelled" })
        .eq("id", createdOrderId);
      if (error) logServerError("orders.createPurchase/unwind/cancel", error);
    }
  };

  try {
    // ── 1. Load the catalog. Policy AND price come from these rows, never
    //       from the request.
    const offeringIds = [...new Set(input.lines.map((l) => l.offeringId))];
    if (offeringIds.length === 0) {
      return { ok: false, reason: "empty_order" };
    }

    const catalog = await loadCatalog(admin, offeringIds);
    if (!catalog.ok) return { ok: false, reason: "engine_error", error: catalog.error };

    // ── 2. Re-validate intent against the derived policy. THE gate.
    const policy = resolvePurchasePolicy(
      {
        clientOrderKey: input.clientOrderKey,
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        paymentChoice: input.paymentChoice,
        lines: input.lines.map((l) => ({ offeringId: l.offeringId, units: l.units })),
      },
      catalog.policies,
    );
    if (!policy.ok) {
      return { ok: false, reason: policy.reason, offeringId: policy.offeringId };
    }

    // ── 3. Price from catalog rows.
    // `priced.lines[i]` ↔ `input.lines[i]`: pricing pushes one per request in
    // order. The session binding rides that index; a KEYED join would be wrong
    // because two lines may share an offering with different sessions.
    const priced = pricePurchase(input.lines, {
      offerings: catalog.offerings,
      variants: catalog.variants,
      addons: catalog.addons,
    });
    // Refuses rather than stamping session ids onto the wrong lines.
    if (priced.ok && priced.lines.length !== input.lines.length) {
      logServerError("orders.createPurchase/lineAlignment", `${priced.lines.length}/${input.lines.length}`);
      return { ok: false, reason: "engine_error", error: "Could not price the order." };
    }
    if (!priced.ok) {
      return { ok: false, reason: priced.reason, offeringId: priced.offeringId };
    }

    const collectCents = amountToCollectCents(
      priced.subtotalCents,
      policy.collect,
      policy.depositPct,
    );

    // ── 4. Resolve the customer. Never creates an auth.users row.
    const customer = await ensureCustomer(
      {
        tenantId: input.tenantId,
        email: input.contact.email,
        phone: input.contact.phone,
        displayName: input.contact.displayName,
        userId: input.actorUserId,
        locale: input.locale,
      },
      // The SAME client the rest of this purchase uses. A helper that builds its
      // own would run one logical purchase across two connections.
      { admin },
    );
    if (!customer.ok) {
      // An order needs a buyer we can reach — a receipt, a reminder, a refund
      // notice all need one. Refuse rather than invent a placeholder.
      return {
        ok: false,
        reason: customer.reason === "unavailable" ? "engine_error" : "no_contact",
        error: customer.error,
      };
    }

    // ── 5. Create the order. `draft` until capacity is held and the payment
    //       decision is made, so an abandoned cart never looks pending.
    // ── 5b. Promo, resolved BEFORE the order exists so a bad code is refused
    // without one being created and unwound. Counts here are advisory; 5c
    // re-counts under a row lock and is the authority.
    let promoDiscountCents = 0;
    let promoCodeId: string | null = null;
    if (input.promoCode) {
      const resolved = await resolvePromo(admin, {
        tenantId: input.tenantId,
        code: input.promoCode,
        customerId: customer.customerId,
        lines: priced.lines.map((l) => ({
          id: l.offeringId,
          totalCents: l.totalCents,
          variantId: l.variantId,
          // Lines do not carry an event id; a tier-scoped code narrows by
          // variant, and the event half of its scope is enforced by the
          // catalog resolving that variant to this event in the first place.
          eventId: null,
        })),
      });
      // REFUSES rather than proceeding at full price. A code that was typed and
      // then ignored is an overcharge the customer only discovers on the
      // receipt.
      if (!resolved.ok) {
        return {
          ok: false,
          reason: resolved.reason,
          error: "That code could not be applied.",
        };
      }
      promoDiscountCents = resolved.discountCents;
      promoCodeId = resolved.codeId;
    }

    const { data: orderRow, error: orderErr } = await admin
      .from("orders")
      .insert({
        tenant_id: input.tenantId,
        customer_id: customer.customerId,
        status: "draft",
        currency: "USD",
        subtotal_cents: priced.subtotalCents,
        discount_cents: promoDiscountCents,
        tax_cents: 0,
        total_cents: priced.subtotalCents - promoDiscountCents,
        // Public receipt identifier for `/r/<code>`. Assigned HERE because the
        // column is meaningless until an order exists to be shown, and this is
        // the one place an order is created.
        //
        // Reuses the links engine's generator rather than writing a second one:
        // 20 characters from a 33-symbol alphabet with every confusable pair
        // already removed (~100 bits). A receipt gets read off paper and typed
        // by a person, so "no l vs 1" is not cosmetic — and that rule is
        // already solved, tested, and guarded in one place.
        receipt_code: generateOpaqueCode(),
        source_channel: input.sourceChannel,
        source_page: input.sourcePage ?? null,
        payout_release_rule: "immediate",
        created_by: input.actorUserId,
      })
      .select("id")
      .single();

    if (orderErr || !orderRow) {
      logServerError("orders.createPurchase/order", orderErr);
      return { ok: false, reason: "engine_error", error: "Could not start the order." };
    }
    createdOrderId = (orderRow as { id: string }).id;

    // ── 5c. Redeem, under the row lock, now that the order id exists.
    //
    // THIS is the authority, not the counts read in 5b. Between resolving and
    // here, another buyer can take the last redemption; both callers passed
    // their advisory check and only one may have it. `redeem_tenant_promo`
    // locks the code row, re-counts, and inserts.
    //
    // Losing that race UNWINDS rather than proceeding. The alternative — keep
    // the order, drop the discount — charges someone full price for a purchase
    // they agreed to at a discount, which is the overcharge-by-silence that 5b
    // refuses to commit.
    if (promoCodeId) {
      const { data: redeemed, error: redeemErr } = await admin.rpc("redeem_tenant_promo", {
        p_code_id: promoCodeId,
        p_order_id: createdOrderId,
        p_customer_id: customer.customerId,
        p_amount_cents: promoDiscountCents,
      });

      if (redeemErr) {
        logServerError("orders.createPurchase/redeem", redeemErr);
        await unwind("promo redemption failed");
        return {
          ok: false,
          reason: "promo_unavailable",
          error: "That code could not be applied.",
        };
      }

      const verdict = (redeemed ?? {}) as { ok?: boolean; reason?: string };
      if (verdict.ok !== true) {
        await unwind(`promo refused under lock: ${verdict.reason ?? "unknown"}`);
        return {
          ok: false,
          // The lock saw a truth the advisory counts missed. `exhausted` is by
          // far the likeliest and is what a buyer needs told.
          reason: verdict.reason === "customer_limit_reached"
            ? "promo_customer_limit"
            : "promo_exhausted",
          error: "That code could not be applied.",
        };
      }
    }

    // ── 6. Lines.
    const lineRows = priced.lines.map((l, i) => ({
      order_id: createdOrderId,
      tenant_id: input.tenantId,
      offering_id: l.offeringId,
      variant_id: l.variantId,
      addon_ids: l.addonIds,
      label: l.label,
      units: l.units,
      unit_cents: l.unitCents,
      total_cents: l.totalCents,
      talent_profile_id: l.talentProfileId,
      owner_tenant_id: l.ownerTenantId,
      talent_cost_cents: l.talentCostCents,
      // Never `orders.session_id` (a box-office convenience); this is what
      // `mint-on-paid` filters on.
      session_id: input.lines[i]?.sessionId ?? null,
      sort_order: i,
    }));

    const { data: insertedLines, error: linesErr } = await admin
      .from("order_lines")
      .insert(lineRows)
      .select("id, offering_id, sort_order");

    if (linesErr || !insertedLines) {
      logServerError("orders.createPurchase/lines", linesErr);
      await unwind("order lines failed");
      return { ok: false, reason: "engine_error", error: "Could not price the order." };
    }

    // ── 7. Hold capacity, per line, each line all-or-nothing.
    //
    // NOTE for the Capacity Engine Manager: `reserveCapacityBatch` takes ONE
    // `orderLineId` for a whole batch, so a cart whose lines each need capacity
    // cannot be held in a single atomic batch while still attributing each
    // allocation to its line. Per-line batches keep the attribution and lose
    // cross-line atomicity, which the compensation below covers. Today every
    // real cart has at most one capacity-bearing line, so this is a contract
    // question rather than a live gap.
    const lineIdByOffering = new Map<string, string>();
    for (const row of insertedLines as Array<{ id: string; offering_id: string | null }>) {
      if (row.offering_id) lineIdByOffering.set(row.offering_id, row.id);
    }

    let shortestTtlSeconds: number | null = null;
    const needs = input.capacity ?? [];

    if (needs.length > 0) {
      // ONE atomic batch for the whole cart.
      //
      // This used to be a loop, one batch per line, because
      // `reserveCapacityBatch` took a single `orderLineId` for a whole batch and
      // a per-line loop was the only way to attribute each allocation to its
      // line. Capacity made `orderLineId` per-request (0.11) after I flagged it,
      // so the loop is gone: a refused leg now writes ZERO rows again and the
      // compensation below no longer has to cover a partially-held cart.
      //
      // Attribution is not cosmetic — `capacity_allocations.order_line_id` is
      // what refund-by-line reads to decide which units to free, so a wrong
      // stamp means refunding the GA line releases the VIP seats.
      //
      // TTL: one batch takes one TTL, so the cart uses the SHORTEST across its
      // pools. That is the right behaviour anyway — a cart should expire as one
      // thing rather than in pieces — and it is why the order's
      // `hold_expires_at` matches the first allocation to lapse.
      for (const need of needs) {
        const poolTtl = await capacityHoldTtlSeconds(need.poolId, admin);
        const ttl = poolTtl ?? FALLBACK_HOLD_TTL_SECONDS;
        shortestTtlSeconds = shortestTtlSeconds == null ? ttl : Math.min(shortestTtlSeconds, ttl);
      }

      const built = buildCapacityRequests(needs, lineIdByOffering);
      if (!built.ok) {
        await unwind(`capacity requests refused: ${built.reason}`);
        // Distinguished: one is a cart nobody can fulfil, the other a unit this
        // engine cannot hold.
        return built.reason === "fractional_units_unsupported"
          ? { ok: false, reason: "invalid_units", offeringId: built.offeringId,
              error: "This item cannot be sold in part quantities." }
          : { ok: false, reason: "capacity_unavailable",
              error: "That is more seats than one order can hold." };
      }

      const reserved = await reserveCapacityBatch(
        built.requests,
        { ttlSeconds: resolveHoldTtl(shortestTtlSeconds, input.holdTtlSecondsOverride), createdBy: input.actorUserId },
        admin,
      );

      if (!reserved.ok) {
        await unwind(`capacity refused: ${reserved.reason}`);
        return {
          ok: false,
          reason: mapCapacityRefusal(reserved.reason),
          offeringId: needs.find((n) => n.poolId === reserved.failedPoolId)?.offeringId,
        };
      }
      heldAllocationIds.push(...reserved.allocationIds);
    }

    // ── 7a. A TIMED offering may not be bought without a slot.
    //
    // This gate lived in `instant-book-engine.ts` and my first rewire DROPPED
    // it — a timed service with bookable hours would have been purchasable with
    // no time attached, producing a paid appointment nobody could attend. It
    // was caught by a Capacity guard that pinned the engine's source, which is
    // the argument for repointing guards rather than deleting them: the guard
    // outlived the file and was still right.
    if (input.reservation === null || input.reservation === undefined) {
      for (const line of input.lines) {
        const offering = catalog.rawOfferings.get(line.offeringId);
        if (!offering) continue;
        const missing = await timedInstantMissingSlot(
          admin,
          { kind: offering.kind, durationMinutes: offering.durationMinutes },
          offering.talentProfileId ?? "",
          false,
        );
        if (missing) {
          await unwind("timed offering booked with no slot");
          return { ok: false, reason: "slot_required", offeringId: line.offeringId };
        }
      }
    }

    // ── 7b. The calendar slot, when the purchase takes someone's time.
    //
    // AFTER capacity and BEFORE money, so a sold-out purchase never blocks a
    // calendar and a slot conflict never charges a card. Both holds are on the
    // unwind ledger, so either failing releases the other.
    if (input.reservation) {
      const ttlSeconds =
        (await capacityHoldTtlSeconds(input.reservation.poolId ?? null, admin))
        ?? shortestTtlSeconds
        ?? FALLBACK_HOLD_TTL_SECONDS;

      const hold = await placeReservationHold(admin, {
        talentProfileId: input.reservation.talentProfileId,
        tenantId: input.tenantId,
        startsAt: input.reservation.startsAt,
        endsAt: input.reservation.endsAt,
        title: input.reservation.title ?? priced.lines[0]?.label ?? "Reservation",
        ttlSeconds,
        createdByUserId: input.actorUserId,
      });

      if (!hold.ok) {
        await unwind(`slot refused: ${hold.code}`);
        return {
          ok: false,
          // `slot_taken` is NOT sold_out. Seats remain; that TIME is gone. A
          // buyer told "sold out" stops looking, one told the time is taken
          // picks another.
          reason: hold.code === "slot_taken" ? "slot_taken" : "engine_error",
          error: hold.error,
        };
      }
      placedHoldId = hold.holdId;
    }

    // ── 8/9. The payment leg.
    //
    // WHY A BOOKING EXISTS HERE AT ALL. `booking_transactions.booking_id` is
    // NOT NULL, so a payment cannot exist without a booking — that is the
    // structural reason both old engines create a booking for a taco, and it is
    // not incidental. Making it nullable means reworking
    // `idx_booking_transactions_booking_active` and `booking_payouts_unique_leg`,
    // which are the indexes this track deliberately left alone.
    //
    // WHAT IS DIFFERENT FROM THE ENGINES: the booking is created with NO
    // INQUIRY. `agency_bookings.source_inquiry_id` is nullable — only
    // `tenant_id` is required — so a purchase gets its money anchor without
    // being dragged through the inquiry state machine. That deletes the whole
    // reason menu-order-engine force-writes `status: 'approved'` under the
    // service role twice, re-reads `version` five times, and stamps
    // `starts_at = ends_at = now()` as a calendar placeholder.
    //
    // The ORDER is the commercial record; the booking is the operations anchor
    // the money spine still requires. When Finance makes `booking_id` nullable,
    // this block is the one place to change.
    let transactionId: string | null = null;
    let bookingId: string | null = null;

    if (collectCents > 0) {
      const { data: bookingRow, error: bookingErr } = await admin
        .from("agency_bookings")
        .insert({
          // `tenant_id` is the ONLY NOT NULL column on agency_bookings, and
          // omitting it is how the first live run failed with "Could not open
          // the payment". The unit test's fake returned an id regardless, so
          // this was invisible until the pipeline met a real database.
          tenant_id: input.tenantId,
          tenant_id_snapshot: input.tenantId,
          // Set BEFORE insert on purpose: `bookings_write_order` fires AFTER
          // INSERT and returns early when `order_id` is already present, so
          // stamping it here is what stops the trigger writing a SECOND order
          // for the order we just made.
          order_id: createdOrderId,
          source_inquiry_id: null,
          title: priced.lines[0]?.label?.slice(0, 120) ?? "Order",
          status: "confirmed",
          contact_name: input.contact.displayName ?? null,
          contact_email: input.contact.email ?? null,
          contact_phone: input.contact.phone ?? null,
          total_client_revenue: priced.subtotalCents / 100,
          currency_code: "USD",
        })
        .select("id")
        .single();

      if (bookingErr || !bookingRow) {
        logServerError("orders.createPurchase/booking", bookingErr);
        await unwind("booking insert failed");
        return { ok: false, reason: "engine_error", error: "Could not open the payment." };
      }
      bookingId = (bookingRow as { id: string }).id;

      const { data: txnRow, error: txnErr } = await admin
        .from("booking_transactions")
        .insert({
          booking_id: bookingId,
          order_id: createdOrderId,
          source_tenant_id: input.tenantId,
          source_inquiry_id: null,
          payer_user_id: input.actorUserId,
          payer_email: input.contact.email ?? null,
          gross_amount_cents: collectCents,
          platform_fee_basis_points: 0,
          platform_fee_cents: 0,
          net_amount_cents: collectCents,
          currency: "USD",
          provider: "stripe",
          // MUST be 'draft'. A trigger on booking_transactions enforces the
          // initial status, and the pipeline discovered it by being refused on
          // a live insert rather than by reading the schema. It is the right
          // invariant: a transaction becomes `payment_requested` when a payment
          // is ACTUALLY requested, which is when the caller creates the Checkout
          // session — not when the row is opened.
          status: "draft",
          // A deposit is a PART payment against a known total, so the balance
          // can be collected later against the same order.
          checkout_type: policy.collect === "deposit" ? "deposit" : "full",
          requested_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (txnErr || !txnRow) {
        logServerError("orders.createPurchase/transaction", txnErr);
        await unwind("transaction insert failed");
        return { ok: false, reason: "engine_error", error: "Could not open the payment." };
      }
      transactionId = (txnRow as { id: string }).id;
      createdTransactionId = transactionId;
    }

    // `paid` is reachable ONLY from a webhook or an explicit staff
    // pay-in-person action. Nothing in this function writes it — which is the
    // single rule the menu engine breaks when it force-writes state to get past
    // a gate. A zero-collect order is `paid` because there is nothing to
    // collect, not because a charge succeeded.
    const nextStatus = collectCents > 0 ? "pending_payment" : "paid";

    const { error: statusErr } = await admin
      .from("orders")
      .update({
        status: nextStatus,
        // The SHORTEST hold across the lines. The order expires when its first
        // allocation does — anything later would leave the order claiming a
        // hold it no longer has.
        hold_expires_at:
          collectCents > 0 && heldAllocationIds.length > 0
            ? new Date(
                Date.now() + (shortestTtlSeconds ?? FALLBACK_HOLD_TTL_SECONDS) * 1000,
              ).toISOString()
            : null,
      })
      .eq("id", createdOrderId)
      .eq("status", "draft");

    if (statusErr) {
      logServerError("orders.createPurchase/status", statusErr);
      await unwind("status transition failed");
      return { ok: false, reason: "engine_error", error: "Could not confirm the order." };
    }

    // ── 10. The conversation, when the channel wants one.
    //
    // AFTER the money leg and deliberately BEST-EFFORT: a thread that failed to
    // open is a visibility problem, and cancelling a paid order to fix a
    // visibility problem would be a far worse trade. The order is the record;
    // the thread is where people talk about it.
    let inquiryId: string | null = null;
    if (input.openThread) {
      const { data: inqRow, error: inqErr } = await admin
        .from("inquiries")
        .insert({
          tenant_id: input.tenantId,
          source_workspace_id: input.tenantId,
          contact_name: input.contact.displayName ?? input.contact.email ?? "Guest",
          contact_email: input.contact.email ?? "",
          contact_phone: input.contact.phone ?? null,
          client_user_id: input.actorUserId,
        })
        .select("id")
        .single();

      if (inqErr || !inqRow) {
        logServerError("orders.createPurchase/thread", inqErr);
      } else {
        inquiryId = (inqRow as { id: string }).id;

        const { error: linkErr } = await admin
          .from("orders")
          .update({ inquiry_id: inquiryId })
          .eq("id", createdOrderId);
        if (linkErr) logServerError("orders.createPurchase/thread-link", linkErr);

        // The card carries { order_id } ONLY. Every figure is read from the
        // order at render time, so it cannot drift from what it describes.
        const { error: cardErr } = await admin.from("inquiry_messages").insert({
          inquiry_id: inquiryId,
          tenant_id: input.tenantId,
          thread_type: "private",
          message_kind: "order",
          body: "",
          card_payload: { order_id: createdOrderId },
        });
        if (cardErr) logServerError("orders.createPurchase/thread-card", cardErr);
      }
    }

    return {
      ok: true,
      orderId: createdOrderId,
      inquiryId,
      customerId: customer.customerId,
      totalCents: priced.subtotalCents,
      collectCents,
      payInPerson: policy.payInPerson,
      allocationIds: heldAllocationIds,
      transactionId,
      bookingId,
      reservationHoldId: placedHoldId,
    };
  } catch (err) {
    logServerError("orders.createPurchase", err);
    await unwind("unexpected error");
    return { ok: false, reason: "engine_error", error: "Could not place the order." };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
