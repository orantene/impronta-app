import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { ensureCustomer } from "@/lib/customers/ensure-customer";
import { reserveCapacityBatch, releaseCapacity } from "@/lib/capacity";
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
    }
  | { ok: false; reason: PurchaseRefusalReason; offeringId?: string; error?: string };

const HOLD_TTL_SECONDS = 15 * 60;

export async function createPurchase(
  admin: SupabaseClient,
  input: PurchaseInput,
): Promise<PurchaseResult> {
  // Compensation ledger. Everything appended here is undone, in reverse, on any
  // later failure. Making it a list rather than ad-hoc unwinding is what stops
  // the "compensates on some paths" asymmetry the old engines have.
  const heldAllocationIds: string[] = [];
  let createdOrderId: string | null = null;

  const unwind = async (why: string) => {
    if (heldAllocationIds.length > 0) {
      const released = await releaseCapacity(heldAllocationIds, admin);
      logServerError(
        "orders.createPurchase/unwind",
        `${why}: released ${released.released} allocation(s), ${released.alreadyReleased} already released`,
      );
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
    const customer = await ensureCustomer({
      tenantId: input.tenantId,
      email: input.contact.email,
      phone: input.contact.phone,
      displayName: input.contact.displayName,
      userId: input.actorUserId,
      locale: input.locale,
    });
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

    for (const need of input.capacity ?? []) {
      const orderLineId = lineIdByOffering.get(need.offeringId) ?? null;
      const reserved = await reserveCapacityBatch(
        [
          {
            poolId: need.poolId,
            startsAt: need.startsAt ?? null,
            endsAt: need.endsAt ?? null,
            units: need.units ?? 1,
          },
        ],
        { ttlSeconds: HOLD_TTL_SECONDS, orderLineId, createdBy: input.actorUserId },
        admin,
      );

      if (!reserved.ok) {
        await unwind(`capacity refused: ${reserved.reason}`);
        return {
          ok: false,
          // Every capacity refusal reads as "sold out" to a buyer. The specific
          // reason is logged, not shown: "ancestor_full" means nothing to
          // someone trying to book a table.
          reason: "sold_out",
          offeringId: need.offeringId,
        };
      }
      heldAllocationIds.push(...reserved.allocationIds);
    }

    // ── 8. The payment decision, derived in step 2 and applied here.
    //
    // `paid` is reachable ONLY from a webhook or an explicit staff
    // pay-in-person action. Nothing in this function writes it — which is the
    // single rule the menu engine breaks when it force-writes state to get past
    // a gate.
    const nextStatus = collectCents > 0 ? "pending_payment" : "paid";

    const { error: statusErr } = await admin
      .from("orders")
      .update({
        status: nextStatus,
        hold_expires_at:
          collectCents > 0 && heldAllocationIds.length > 0
            ? new Date(Date.now() + HOLD_TTL_SECONDS * 1000).toISOString()
            : null,
      })
      .eq("id", createdOrderId)
      .eq("status", "draft");

    if (statusErr) {
      logServerError("orders.createPurchase/status", statusErr);
      await unwind("status transition failed");
      return { ok: false, reason: "engine_error", error: "Could not confirm the order." };
    }

    return {
      ok: true,
      orderId: createdOrderId,
      customerId: customer.customerId,
      totalCents: priced.subtotalCents,
      collectCents,
      payInPerson: policy.payInPerson,
      allocationIds: heldAllocationIds,
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
        "reserve_mode, deposit_pct, allow_pay_in_person, require_account_to_book, cancellation_hours",
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

  return { ok: true, policies, offerings, variants, addons };
}
