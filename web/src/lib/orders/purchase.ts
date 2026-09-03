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

export type PurchaseLineInput = {
  offeringId: string;
  units: number;
  variantId?: string | null;
  addonIds?: string[];
};

export type PurchaseInput = {
  tenantId: string;
  /** Per CART, not per click — the idempotency anchor. */
  clientOrderKey: string;
  /** Null for a guest. Never invented. */
  actorUserId: string | null;
  contact: { email?: string | null; phone?: string | null; displayName?: string | null };
  lines: PurchaseLineInput[];
  /** INTENT, not policy. Re-validated against the offering rows. */
  paymentChoice: PaymentChoice;
  sourceChannel: string;
  sourcePage?: string | null;
  /** Capacity pools this purchase must hold, per line. */
  capacity?: Array<{
    offeringId: string;
    poolId: string;
    startsAt?: string | null;
    endsAt?: string | null;
    units?: number;
  }>;
  locale?: string | null;
  /**
   * Open a conversation for this purchase and post the order card into it.
   *
   * "Any order can open a thread lazily" is the contract; this is the eager
   * form, for channels where staff work the order in Messages today. A menu
   * order takes it, because that is where a menu order is visible NOW, and
   * removing the thread would be a regression dressed as an architecture change.
   *
   * What it does NOT do is run the inquiry state machine: no offer, no approval,
   * no `status: 'approved'` forced under the service role, no version dance.
   * The inquiry here is a CONVERSATION, which is all it was ever needed for.
   */
  openThread?: boolean;
  /**
   * A CALENDAR SLOT this purchase must hold, distinct from capacity units.
   *
   * Capacity answers "are there seats left"; a slot answers "is this person
   * free at this time". A timed appointment needs both, and the instant-book
   * engine held them separately with its own compensation — the one thing it
   * did that Menu never needed.
   *
   * The TTL comes from the POOL, not from this file, so the two clocks agree.
   * Capacity's warning: hold the slot on its own timer and the units come back
   * in fifteen minutes while the slot stays blocked for two days.
   */
  reservation?: {
    talentProfileId: string;
    startsAt: string;
    endsAt: string;
    title?: string | null;
    /** The pool whose TTL governs both holds. */
    poolId?: string | null;
  } | null;
};

export type PurchaseRefusalReason =
  | "empty_order"
  | "unknown_offering"
  | "offering_not_published"
  | "cross_tenant_line"
  | "account_required"
  | "pay_in_person_not_allowed"
  | "deposit_not_offered"
  | "invalid_units"
  | "invalid_payment_choice"
  | "offering_not_priceable"
  | "variant_not_on_offering"
  | "addon_not_on_offering"
  | "amount_out_of_range"
  | "no_contact"
  | "sold_out"
  /** The capacity engine could not be REACHED. A retry, not an absence. */
  | "capacity_unavailable"
  /** Someone else holds that time. Distinct from sold_out: seats remain. */
  | "slot_taken"
  /** A timed offering was booked with no slot. A caller bug OR a stale UI. */
  | "slot_required"
  | "engine_error";

export type PurchaseResult =
  | {
      ok: true;
      orderId: string;
      customerId: string;
      totalCents: number;
      /** What the pipeline decided to collect now. Derived, never sent. */
      collectCents: number;
      /** True when the order is reserved with no card. */
      payInPerson: boolean;
      allocationIds: string[];
      /**
       * The transaction to charge, when there is money to collect. Null for a
       * free reserve or pay-in-person.
       *
       * Stripe is deliberately NOT called from this pipeline: the caller passes
       * this to `createCheckoutSessionForTransaction`, which already carries the
       * `cs_txn_<id>` idempotency key. Keeping the network call out of the
       * orchestrator is what makes the orchestrator testable, and it means there
       * is still exactly one place that talks to Checkout.
       */
      transactionId: string | null;
      /** The operations anchor. See the note at step 9. */
      bookingId: string | null;
      /** The conversation, when one was opened. */
      inquiryId: string | null;
      /** The calendar hold, when a slot was taken. */
      reservationHoldId: string | null;
    }
  | { ok: false; reason: PurchaseRefusalReason; offeringId?: string; error?: string };

/** Only used when a pool cannot tell us its own TTL. */
const FALLBACK_HOLD_TTL_SECONDS = 15 * 60;

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
    const priced = pricePurchase(input.lines, {
      offerings: catalog.offerings,
      variants: catalog.variants,
      addons: catalog.addons,
    });
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
    const { data: orderRow, error: orderErr } = await admin
      .from("orders")
      .insert({
        tenant_id: input.tenantId,
        customer_id: customer.customerId,
        status: "draft",
        currency: "USD",
        subtotal_cents: priced.subtotalCents,
        discount_cents: 0,
        tax_cents: 0,
        total_cents: priced.subtotalCents,
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

      const reserved = await reserveCapacityBatch(
        needs.map((need) => ({
          poolId: need.poolId,
          startsAt: need.startsAt ?? null,
          endsAt: need.endsAt ?? null,
          units: need.units ?? 1,
          orderLineId: lineIdByOffering.get(need.offeringId) ?? null,
        })),
        {
          ttlSeconds: shortestTtlSeconds ?? FALLBACK_HOLD_TTL_SECONDS,
          createdBy: input.actorUserId,
        },
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

type Catalog =
  | {
      ok: true;
      policies: Map<string, OfferingPolicy>;
      /** Columns only the slot gate needs, kept off the priced shape. */
      rawOfferings: Map<string, { kind: string; durationMinutes: number | null; talentProfileId: string | null }>;
      offerings: Map<string, PricedOffering>;
      variants: Map<string, PricedVariant>;
      addons: Map<string, PricedAddon>;
    }
  | { ok: false; error: string };

async function loadCatalog(admin: SupabaseClient, offeringIds: string[]): Promise<Catalog> {
  const { data: offeringRows, error: offeringErr } = await admin
    .from("talent_offerings")
    .select(
      "id, tenant_id, title, status, price_type, amount_cents, talent_profile_id, " +
        "reserve_mode, deposit_pct, allow_pay_in_person, require_account_to_book, cancellation_hours, " +
        "kind, duration_minutes",
    )
    .in("id", offeringIds);

  if (offeringErr) {
    logServerError("orders.loadCatalog/offerings", offeringErr);
    return { ok: false, error: "Could not load the items." };
  }

  const [variantResult, addonResult] = await Promise.all([
    admin
      .from("talent_offering_variants")
      .select("id, offering_id, label, amount_cents")
      .in("offering_id", offeringIds),
    admin
      .from("talent_offering_addons")
      .select("id, offering_id, label, amount_cents")
      .in("offering_id", offeringIds),
  ]);

  if (variantResult.error) {
    logServerError("orders.loadCatalog/variants", variantResult.error);
    return { ok: false, error: "Could not load the options." };
  }
  if (addonResult.error) {
    logServerError("orders.loadCatalog/addons", addonResult.error);
    return { ok: false, error: "Could not load the extras." };
  }

  type OfferingRow = {
    id: string;
    tenant_id: string | null;
    title: string | null;
    status: string | null;
    price_type: string | null;
    amount_cents: number | null;
    talent_profile_id: string | null;
    reserve_mode: string | null;
    deposit_pct: number | null;
    allow_pay_in_person: boolean | null;
    require_account_to_book: boolean | null;
    cancellation_hours: number | null;
  };

  const policies = new Map<string, OfferingPolicy>();
  const offerings = new Map<string, PricedOffering>();
  const rawOfferings = new Map<
    string,
    { kind: string; durationMinutes: number | null; talentProfileId: string | null }
  >();

  for (const row of (offeringRows ?? []) as unknown as OfferingRow[]) {
    policies.set(row.id, {
      offeringId: row.id,
      status:
        row.status === "published" || row.status === "draft" || row.status === "archived"
          ? row.status
          : "draft",
      tenantId: row.tenant_id ?? "",
      reserveMode:
        row.reserve_mode === "deposit" || row.reserve_mode === "free" ? row.reserve_mode : "full",
      depositPct:
        typeof row.deposit_pct === "number" && row.deposit_pct > 0 && row.deposit_pct < 100
          ? Math.round(row.deposit_pct)
          : null,
      allowPayInPerson: row.allow_pay_in_person === true,
      requireAccountToBook: row.require_account_to_book === true,
      cancellationHours:
        typeof row.cancellation_hours === "number" && row.cancellation_hours >= 0
          ? row.cancellation_hours
          : null,
    });

    offerings.set(row.id, {
      offeringId: row.id,
      label: row.title ?? "Item",
      amountCents: row.amount_cents,
      priceType: row.price_type ?? "fixed",
      talentProfileId: row.talent_profile_id,
      ownerTenantId: row.talent_profile_id ? null : row.tenant_id,
      talentCostCents: row.talent_profile_id ? (row.amount_cents ?? 0) : 0,
    });

    rawOfferings.set(row.id, {
      kind: (row as unknown as { kind?: string | null }).kind ?? "service",
      durationMinutes:
        (row as unknown as { duration_minutes?: number | null }).duration_minutes ?? null,
      talentProfileId: row.talent_profile_id,
    });
  }

  type VariantRow = { id: string; offering_id: string; label: string | null; amount_cents: number | null };
  type AddonRow = { id: string; offering_id: string; label: string | null; amount_cents: number | null };

  const variants = new Map<string, PricedVariant>();
  for (const row of (variantResult.data ?? []) as unknown as VariantRow[]) {
    variants.set(row.id, {
      variantId: row.id,
      offeringId: row.offering_id,
      label: row.label ?? "",
      amountCents: row.amount_cents,
    });
  }

  const addons = new Map<string, PricedAddon>();
  for (const row of (addonResult.data ?? []) as unknown as AddonRow[]) {
    if (typeof row.amount_cents !== "number" || row.amount_cents < 0) continue;
    addons.set(row.id, {
      addonId: row.id,
      offeringId: row.offering_id,
      label: row.label ?? "",
      amountCents: row.amount_cents,
    });
  }

  return { ok: true, policies, rawOfferings, offerings, variants, addons };
}

/**
 * Capacity refusal → what the buyer is told.
 *
 * Three classes, and collapsing them is a real bug the Capacity Engine Manager
 * found in production: an outage was reaching customers as "this does not
 * exist". A person told a thing is gone leaves; a person told to try again
 * tries again.
 *
 *   sold_out / ancestor_full / pool_not_found / pool_inactive
 *       → genuinely not available. `ancestor_full` means a parent is booked out
 *         (the room is bought out, so its tables are gone), which is a sold-out
 *         state however it reads internally.
 *
 *   unavailable
 *       → the engine could not be REACHED. Not a refusal at all, and the one
 *         outcome a buyer can act on.
 *
 *   invalid_units / invalid_window / invalid_ttl / empty_batch
 *       → CALLER BUGS. A well-formed pipeline cannot produce them, so they must
 *         alert rather than render. Showing a customer "invalid window" tells
 *         them nothing and tells us nothing either.
 */
function mapCapacityRefusal(reason: CapacityRefusalReason): PurchaseRefusalReason {
  switch (reason) {
    case "sold_out":
    case "ancestor_full":
    case "pool_not_found":
    case "pool_inactive":
      return "sold_out";
    case "unavailable":
      return "capacity_unavailable";
    case "invalid_units":
    case "invalid_window":
    case "invalid_ttl":
    case "empty_batch":
      logServerError(
        "orders.createPurchase/capacity-caller-bug",
        `capacity refused with ${reason} — a well-formed pipeline cannot produce this`,
      );
      return "engine_error";
    default: {
      // Exhaustiveness: a reason added upstream must not silently become
      // "sold out". This fails the typecheck instead.
      const unhandled: never = reason;
      logServerError("orders.createPurchase/capacity-unknown", `unhandled reason ${String(unhandled)}`);
      return "engine_error";
    }
  }
}

/**
 * The capacity pool an offering draws from, or null when it is unlimited.
 *
 * Lives here rather than in the caller so every channel asks the same question
 * the same way. The instant-book engine read `offering.capacityPoolId` off a
 * loader of its own and the menu engine did not ask at all — which is how one
 * path could oversell and the other could not.
 */
export async function loadOfferingCapacityPoolId(
  admin: SupabaseClient,
  offeringId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("talent_offerings")
    .select("capacity_pool_id")
    .eq("id", offeringId)
    .maybeSingle();

  if (error) {
    // Fail CLOSED to "no pool" rather than guessing one. A wrong pool id
    // reserves someone else's units; no pool reserves nothing and the purchase
    // proceeds unlimited, which is what an offering without a pool means.
    logServerError("orders.loadOfferingCapacityPoolId", error);
    return null;
  }
  return (data as { capacity_pool_id?: string | null } | null)?.capacity_pool_id ?? null;
}
