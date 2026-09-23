import "server-only";

/**
 * POS draft commands — the existing `orders` row is the cart (L52, L53).
 *
 * Line mutation never applies a promo or holds capacity. Totals come from
 * `cartTotals`. Catalog prices are re-read only in `repriceAndValidate`.
 */

import { logServerError } from "@/lib/server/safe-error";
import { generateOpaqueCode } from "@/lib/links/code";
import { cartTotals, lineTotalCents, totalsAreWritable } from "@/lib/cart/totals";
import { addonCentsOnLine, priceAddons } from "./addons";
import { LINE_COLUMNS, lineDiscountCents, num, totalsInput, type Admin, type LineAuthor, type LineRow, type OrderRow } from "./sale-rows";
import { posGuestSessionId, type PosLineInput } from "./commands";
import { lockedCustomLineIds } from "./custom-line";
import { livePhasePrice } from "@/lib/catalog/price-phases";
import { composeTalentOfferingLabel } from "@/lib/talent/offering-line-label";

export type CreateDraftOrderInput = {
  tenantId: string;
  actorUserId: string;
  currency?: string;
  context?: string | null;
  customerId?: string | null;
  visitId?: string | null;
  spaceId?: string | null;
  sourceChannel?: string;
};

export type CreateDraftOrderResult =
  | { ok: true; orderId: string; guestSessionId: string }
  | { ok: false; reason: "unavailable" | "invalid"; error: string };

export async function createDraftOrder(
  admin: Admin,
  input: CreateDraftOrderInput,
): Promise<CreateDraftOrderResult> {
  if (!input.tenantId) return { ok: false, reason: "invalid", error: "Missing workspace." };
  const guestSessionId = posGuestSessionId();
  const currency = (input.currency ?? "USD").toUpperCase();
  try {
    const { data, error } = await admin
      .from("orders")
      .insert({
        tenant_id: input.tenantId,
        customer_id: input.customerId ?? null,
        status: "draft",
        currency,
        version: 1,
        subtotal_cents: 0,
        discount_cents: 0,
        tax_cents: 0,
        total_cents: 0,
        receipt_code: generateOpaqueCode(),
        source_channel: input.sourceChannel ?? "pos",
        source_page: input.context ?? input.sourceChannel ?? "pos",
        visit_id: input.visitId ?? null,
        space_id: input.spaceId ?? null,
        payout_release_rule: "immediate",
        guest_session_id: input.customerId ? null : guestSessionId,
        created_by: input.actorUserId,
      })
      .select("id")
      .single();
    if (error || !data) {
      logServerError("pos.createDraftOrder", error);
      return { ok: false, reason: "unavailable", error: "Could not open a sale." };
    }
    return { ok: true, orderId: (data as { id: string }).id, guestSessionId };
  } catch (error) {
    logServerError("pos.createDraftOrder", error);
    return { ok: false, reason: "unavailable", error: "Could not open a sale." };
  }
}

async function loadDraft(
  admin: Admin,
  tenantId: string,
  orderId: string,
): Promise<{ order: OrderRow; lines: LineRow[] } | { ok: false; reason: "not_found" | "wrong_tenant" | "not_draft" | "unavailable" }> {
  const { data: order, error } = await admin
    .from("orders")
    .select(
      "id, tenant_id, status, currency, customer_id, guest_session_id, source_page, visit_id, space_id, version, subtotal_cents, discount_cents, tax_cents, total_cents, tip_cents, promo_code_id",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (error) {
    logServerError("pos.loadDraft", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!order) return { ok: false, reason: "not_found" };
  const row = order as OrderRow;
  if (row.tenant_id !== tenantId) return { ok: false, reason: "wrong_tenant" };
  if (row.status !== "draft") return { ok: false, reason: "not_draft" };
  const { data: lineRows, error: linesError } = await admin
    .from("order_lines")
    .select(LINE_COLUMNS)
    .eq("order_id", orderId)
    .order("sort_order", { ascending: true });
  if (linesError) {
    logServerError("pos.loadDraft.lines", linesError);
    return { ok: false, reason: "unavailable" };
  }
  return { order: row, lines: (lineRows ?? []) as LineRow[] };
}

async function writeTotals(
  admin: Admin,
  input: { tenantId: string; orderId: string; discountCents: number; version: number; promoCodeId?: string | null; tipCents?: number },
  lines: readonly { unitCents: number; units: number; addonCents?: number }[],
): Promise<{ ok: true; version: number } | { ok: false; reason: "conflict" | "unavailable"; error: string }> {
  const totals = cartTotals(lines, input.discountCents, input.tipCents ?? 0);
  if (!totalsAreWritable(totals)) return { ok: false, reason: "unavailable", error: "CART_TOTALS_NOT_WRITABLE" };

  if (typeof admin.rpc === "function") {
    const { data, error } = await admin.rpc("pos_apply_draft_totals", {
      p_tenant_id: input.tenantId,
      p_order_id: input.orderId,
      p_expected_version: input.version,
      p_discount_cents: totals.discountCents,
    });
    if (error) {
      logServerError("pos.writeTotals.rpc", error);
      return { ok: false, reason: "unavailable", error: error.message };
    }
    const reply = (data ?? {}) as { ok?: boolean; reason?: string; version?: number };
    if (reply.ok !== true) {
      const reason = reply.reason === "conflict" ? "conflict" : "unavailable";
      return { ok: false, reason, error: reason === "conflict" ? "This sale was just changed. Reload." : "Could not save the sale." };
    }
    if (input.promoCodeId !== undefined) {
      await admin
        .from("orders")
        .update({ promo_code_id: input.promoCodeId })
        .eq("id", input.orderId)
        .eq("tenant_id", input.tenantId);
    }
    return { ok: true, version: Number(reply.version) || input.version + 1 };
  }

  const patch: Record<string, unknown> = {
    subtotal_cents: totals.subtotalCents,
    discount_cents: totals.discountCents,
    tax_cents: totals.taxCents,
    total_cents: totals.totalCents,
    version: input.version + 1,
  };
  if (input.promoCodeId !== undefined) patch.promo_code_id = input.promoCodeId;
  const { data, error } = await admin
    .from("orders")
    .update(patch)
    .eq("id", input.orderId)
    .eq("status", "draft")
    .eq("version", input.version)
    .select("id")
    .maybeSingle();
  if (error) {
    logServerError("pos.writeTotals", error);
    return { ok: false, reason: "unavailable", error: error.message };
  }
  if (!data) {
    return { ok: false, reason: "conflict", error: "This sale was just changed. Reload." };
  }
  return { ok: true, version: input.version + 1 };
}

async function mutateDraftLine(
  admin: Admin,
  input: {
    tenantId: string;
    orderId: string;
    expectedVersion: number;
    op: "add" | "update" | "remove";
    line: Record<string, unknown>;
  },
): Promise<MutateLineResult | "fallback"> {
  if (typeof admin.rpc !== "function") return "fallback";
  const { data, error } = await admin.rpc("pos_mutate_draft_line", {
    p_tenant_id: input.tenantId,
    p_order_id: input.orderId,
    p_expected_version: input.expectedVersion,
    p_op: input.op,
    p_line: input.line,
  });
  if (error) {
    const message = error.message ?? "";
    if (/does not exist|42883|pos_mutate_draft_line/i.test(message)) return "fallback";
    logServerError("pos.mutateDraftLine.rpc", error);
    return { ok: false, reason: "unavailable", error: "Could not save the sale." };
  }
  const reply = (data ?? {}) as { ok?: boolean; reason?: string; line_id?: string | null };
  if (reply.ok !== true) {
    const reason =
      reply.reason === "conflict"
        ? "conflict"
        : reply.reason === "not_found"
          ? "not_found"
          : reply.reason === "wrong_tenant"
            ? "wrong_tenant"
            : reply.reason === "not_draft"
              ? "not_draft"
              : reply.reason === "invalid"
                ? "invalid"
                : "unavailable";
    return {
      ok: false,
      reason,
      error: reason === "conflict" ? "This sale was just changed. Reload." : "Could not save the sale.",
    };
  }
  return { ok: true, orderId: input.orderId, lineId: typeof reply.line_id === "string" ? reply.line_id : null };
}

export type MutateLineResult =
  | { ok: true; orderId: string; lineId?: string | null }
  | { ok: false; reason: "not_found" | "wrong_tenant" | "not_draft" | "unavailable" | "invalid" | "conflict"; error: string };

/**
 * The discount the fallback totals writer applies: the order's own discount
 * (promo or manual) plus every per-line discount (S5). `pos_mutate_draft_line`
 * sums the same two in SQL, so both writers land on one `orders.discount_cents`.
 * The stored value already holds the line sum from the previous write, so the
 * order's own part is what is left after taking the lines it had out, and the
 * lines it will have go back in.
 */
function orderDiscountCents(order: OrderRow, before: readonly LineRow[], after: readonly LineRow[]): number {
  const own = Math.max(0, num(order.discount_cents) - lineDiscountCents(before));
  return own + lineDiscountCents(after);
}

export type ConfirmLinesResult =
  | { ok: true; orderId: string; confirmedLineIds: string[] }
  | { ok: false; reason: "not_found" | "wrong_tenant" | "not_draft" | "unavailable" | "invalid"; error: string };

/**
 * Staff confirm the lines a client proposed (owner decision 3: picks hold,
 * staff confirm). Writes `confirmed_at` / `confirmed_by`; the line trigger
 * records the confirmation on the history. Exported for S3's confirm; no
 * caller in this lane. A line already confirmed is left as it was (the first
 * confirmation is the one that counts), so a repeat is idempotent.
 */
export async function confirmLines(
  admin: Admin,
  input: { tenantId: string; orderId: string; lineIds: readonly string[]; actor: { kind: LineAuthor; id: string | null } },
): Promise<ConfirmLinesResult> {
  if (input.actor.kind !== "staff" && input.actor.kind !== "system") {
    return { ok: false, reason: "invalid", error: "Only staff confirm a line." };
  }
  const ids = [...new Set(input.lineIds.filter((id) => typeof id === "string" && id.length > 0))];
  if (ids.length === 0) return { ok: false, reason: "invalid", error: "Nothing to confirm." };
  const loaded = await loadDraft(admin, input.tenantId, input.orderId);
  if ("ok" in loaded) return { ok: false, reason: loaded.reason, error: "Sale is not open." };
  const onSale = new Set(loaded.lines.map((l) => l.id));
  const missing = ids.filter((id) => !onSale.has(id));
  if (missing.length > 0) return { ok: false, reason: "not_found", error: "That line is not on this sale." };
  const toConfirm = ids.filter((id) => !loaded.lines.find((l) => l.id === id)?.confirmed_at);
  if (toConfirm.length === 0) return { ok: true, orderId: input.orderId, confirmedLineIds: [] };
  const { error } = await admin
    .from("order_lines")
    .update({ confirmed_at: new Date().toISOString(), confirmed_by: input.actor.id })
    .eq("order_id", input.orderId)
    .eq("tenant_id", input.tenantId)
    .in("id", toConfirm);
  if (error) {
    logServerError("pos.confirmLines", error);
    return { ok: false, reason: "unavailable", error: "Could not confirm the lines." };
  }
  return { ok: true, orderId: input.orderId, confirmedLineIds: toConfirm };
}

export async function addLine(
  admin: Admin,
  input: {
    tenantId: string;
    orderId: string;
    line: PosLineInput;
    expectedVersion?: number;
    /**
     * Who is putting the line on the draft (S5, D-MSG-30). The guest link
     * passes `client`; the counter and Messages pass `staff`; an automatic
     * writer passes `system`. Default `staff`: every pre-S5 caller is one.
     */
    proposedBy?: LineAuthor;
    /** The user behind a staff add, written on the line's history event. */
    actorId?: string | null;
  },
): Promise<MutateLineResult> {
  const proposedBy: LineAuthor = input.proposedBy ?? "staff";
  const loaded = await loadDraft(admin, input.tenantId, input.orderId);
  if ("ok" in loaded) return { ok: false, reason: loaded.reason, error: "Sale is not open." };
  const loadedVersion = Number(loaded.order.version) || 1;
  if (input.expectedVersion != null && input.expectedVersion !== loadedVersion) {
    return { ok: false, reason: "conflict", error: "This sale was just changed. Reload." };
  }
  if (!Number.isFinite(input.line.units) || input.line.units <= 0) {
    return { ok: false, reason: "invalid", error: "Quantity must be at least one." };
  }

  const { data: offering, error: offErr } = await admin
    .from("talent_offerings")
    .select("id, title, amount_cents, currency, talent_profile_id, status")
    .eq("id", input.line.offeringId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (offErr) {
    logServerError("pos.addLine.offering", offErr);
    return { ok: false, reason: "unavailable", error: "Could not read the catalog." };
  }
  if (!offering) return { ok: false, reason: "invalid", error: "That item is not in this catalog." };
  const off = offering as {
    id: string;
    title: string | null;
    amount_cents: number | null;
    currency?: string | null;
    talent_profile_id: string | null;
    status: string | null;
  };
  if (off.status !== "published") {
    return { ok: false, reason: "invalid", error: "That item is not for sale." };
  }
  const offeringCurrency = (off.currency || "USD").toUpperCase();
  const orderCurrency = (loaded.order.currency || "USD").toUpperCase();
  if (off.talent_profile_id && offeringCurrency !== orderCurrency) {
    return { ok: false, reason: "invalid", error: "That price is in a different currency than this sale." };
  }

  let sessionTitle: string | null = null;
  if (input.line.sessionId) {
    const { data: session, error: sessErr } = await admin
      .from("sessions")
      .select("id, tenant_id, offering_id, status, title")
      .eq("id", input.line.sessionId)
      .maybeSingle();
    if (sessErr) {
      logServerError("pos.addLine.session", sessErr);
      return { ok: false, reason: "unavailable", error: "Could not read that class." };
    }
    if (!session) return { ok: false, reason: "invalid", error: "That class is not here." };
    const sess = session as {
      tenant_id: string;
      offering_id: string | null;
      status: string;
      title: string | null;
    };
    if (sess.tenant_id !== input.tenantId) {
      return { ok: false, reason: "wrong_tenant", error: "That class is not here." };
    }
    if (sess.offering_id && sess.offering_id !== off.id) {
      return { ok: false, reason: "invalid", error: "That class is not this item." };
    }
    if (sess.status !== "scheduled") {
      return { ok: false, reason: "invalid", error: "That class is not open." };
    }
    sessionTitle = sess.title?.trim() || null;
  }

  let unitCents = Math.max(0, Math.trunc(num(off.amount_cents)));
  let label = off.title?.trim() || "Item";
  if (sessionTitle) label = `${label} · ${sessionTitle}`;
  // The raw catalog price at the add (offering, or the variant when it prices
  // itself), BEFORE a live phase replaces it. Stamped on the line so the UI
  // can say "catalog price now X" against the catalog later (D-MSG-30).
  let catalogCents = unitCents;
  if (input.line.variantId) {
    const { data: variant, error: vErr } = await admin
      .from("talent_offering_variants")
      .select("id, label, amount_cents, offering_id")
      .eq("id", input.line.variantId)
      .maybeSingle();
    if (vErr) {
      logServerError("pos.addLine.variant", vErr);
      return { ok: false, reason: "unavailable", error: "Could not read the option." };
    }
    const v = variant as { offering_id?: string; label?: string; amount_cents?: number | null } | null;
    if (!v || v.offering_id !== off.id) {
      return { ok: false, reason: "invalid", error: "That option does not belong to this item." };
    }
    if (v.amount_cents != null) unitCents = Math.max(0, Math.trunc(num(v.amount_cents)));
    catalogCents = unitCents;
    if (v.label) {
      if (off.talent_profile_id) {
        label = composeTalentOfferingLabel({ title: off.title?.trim() || "Item", variantLabel: v.label });
        if (sessionTitle) label = `${label} · ${sessionTitle}`;
      } else {
        label = `${label} · ${v.label}`;
      }
    }
  }

  // The live price phase, on FIRST price (D-138). The contract stamps the
  // phase id when the line is first priced; on the counter that is the add.
  // Only `repriceAndValidate` read phases before, and the counter runs it
  // only from the Discount sheet, so a live phase never priced a plain sale.
  // Same rule as the reprice: the phase's price replaces the list price and
  // the id is stamped so later phases do not rewrite the price that sold.
  const phase = await livePhasePrice(admin, {
    tenantId: input.tenantId,
    offeringId: off.id,
    variantId: input.line.variantId ?? null,
  });
  if (!phase.ok) return { ok: false, reason: "unavailable", error: "Could not read the price." };
  const pricePhaseId = phase.priceCents != null ? phase.phaseId : null;
  if (phase.priceCents != null) unitCents = Math.max(0, Math.trunc(phase.priceCents));

  // The extras, priced. Before the line is written, because a refused add-on
  // must leave the sale untouched rather than add a mispriced line and then
  // report an error the operator reads after the item is already on screen.
  const addons = await priceAddons(admin, {
    tenantId: input.tenantId,
    offeringId: off.id,
    addonIds: input.line.addonIds,
  });
  if (!addons.ok) return { ok: false, reason: addons.reason, error: addons.error };
  const { addonIds, addonCents, labelSuffix } = addons.priced;
  if (labelSuffix) label += labelSuffix;

  const units = Math.trunc(input.line.units);
  const totalCents = lineTotalCents({ unitCents, units, addonCents });
  const talentId = off.talent_profile_id;
  const expectedVersion = input.expectedVersion ?? loadedVersion;
  const viaRpc = await mutateDraftLine(admin, {
    tenantId: input.tenantId,
    orderId: input.orderId,
    expectedVersion,
    op: "add",
    line: {
      offering_id: off.id,
      variant_id: input.line.variantId ?? null,
      addon_ids: addonIds,
      session_id: input.line.sessionId ?? null,
      label,
      units,
      unit_cents: unitCents,
      total_cents: totalCents,
      talent_profile_id: talentId,
      owner_tenant_id: talentId ? null : input.tenantId,
      talent_cost_cents: talentId ? unitCents : 0,
      sort_order: loaded.lines.length,
      price_phase_id: pricePhaseId,
      proposed_by: proposedBy,
      actor_kind: proposedBy,
      actor_id: input.actorId ?? null,
      // The price this line sold at. Never rewritten by a later catalog
      // change; `repriceAndValidate` is the one command that re-reads prices
      // and it writes `unit_cents`, not this.
      price_snapshot_cents: unitCents,
      catalog_price_cents_at_add: catalogCents,
    },
  });
  if (viaRpc !== "fallback") {
    // The RPC does not carry the phase column; the stamp is a second write
    // on the line it made. The price it wrote is already the phase's.
    if (viaRpc.ok && pricePhaseId && viaRpc.lineId) {
      const { error: stampErr } = await admin
        .from("order_lines")
        .update({ price_phase_id: pricePhaseId })
        .eq("id", viaRpc.lineId)
        .eq("tenant_id", input.tenantId);
      if (stampErr) logServerError("pos.addLine.pricePhase", stampErr);
    }
    return viaRpc;
  }

  const { error: insErr } = await admin.from("order_lines").insert({
    order_id: input.orderId,
    tenant_id: input.tenantId,
    offering_id: off.id,
    variant_id: input.line.variantId ?? null,
    addon_ids: addonIds,
    session_id: input.line.sessionId ?? null,
    label,
    units,
    unit_cents: unitCents,
    total_cents: totalCents,
    talent_profile_id: talentId,
    owner_tenant_id: talentId ? null : input.tenantId,
    talent_cost_cents: talentId ? unitCents : 0,
    sort_order: loaded.lines.length,
    price_phase_id: pricePhaseId,
    proposed_by: proposedBy,
    price_snapshot_cents: unitCents,
    catalog_price_cents_at_add: catalogCents,
    discount_cents: 0,
    tax_cents: 0,
  });
  if (insErr) {
    logServerError("pos.addLine.insert", insErr);
    return { ok: false, reason: "unavailable", error: "Could not add the item." };
  }

  const nextLines = [...loaded.lines.map(totalsInput), { unitCents, units, addonCents }];
  const written = await writeTotals(
    admin,
    {
      tenantId: input.tenantId,
      orderId: input.orderId,
      discountCents: orderDiscountCents(loaded.order, loaded.lines, loaded.lines),
      version: expectedVersion,
      tipCents: num(loaded.order.tip_cents),
    },
    nextLines,
  );
  if (!written.ok) return { ok: false, reason: written.reason, error: written.error };
  return { ok: true, orderId: input.orderId };
}

export async function updateLine(
  admin: Admin,
  input: { tenantId: string; orderId: string; lineId: string; units: number; expectedVersion?: number },
): Promise<MutateLineResult> {
  const loaded = await loadDraft(admin, input.tenantId, input.orderId);
  if ("ok" in loaded) return { ok: false, reason: loaded.reason, error: "Sale is not open." };
  const loadedVersion = Number(loaded.order.version) || 1;
  if (input.expectedVersion != null && input.expectedVersion !== loadedVersion) {
    return { ok: false, reason: "conflict", error: "This sale was just changed. Reload." };
  }
  if (!Number.isFinite(input.units) || input.units <= 0) {
    return { ok: false, reason: "invalid", error: "Quantity must be at least one." };
  }
  const line = loaded.lines.find((l) => l.id === input.lineId);
  if (!line) return { ok: false, reason: "not_found", error: "That line is not on this sale." };
  const units = Math.trunc(input.units);
  const unitCents = num(line.unit_cents);
  // The extras survive a quantity change unchanged, because they are charged
  // per line. Re-reading their catalog price here would silently reprice a line
  // the operator only wanted more of.
  const addonCents = addonCentsOnLine({ unitCents, units: num(line.units), totalCents: num(line.total_cents) });
  const nextTotal = lineTotalCents({ unitCents, units, addonCents });
  const expectedVersion = input.expectedVersion ?? loadedVersion;
  const viaRpc = await mutateDraftLine(admin, {
    tenantId: input.tenantId,
    orderId: input.orderId,
    expectedVersion,
    op: "update",
    line: {
      id: input.lineId,
      units,
      unit_cents: unitCents,
      total_cents: nextTotal,
    },
  });
  if (viaRpc !== "fallback") return viaRpc;
  const { error } = await admin
    .from("order_lines")
    .update({ units, total_cents: nextTotal })
    .eq("id", input.lineId)
    .eq("order_id", input.orderId);
  if (error) {
    logServerError("pos.updateLine", error);
    return { ok: false, reason: "unavailable", error: "Could not update the item." };
  }
  const nextLines = loaded.lines.map((l) =>
    l.id === input.lineId ? { unitCents, units, addonCents } : totalsInput(l),
  );
  const written = await writeTotals(
    admin,
    {
      tenantId: input.tenantId,
      orderId: input.orderId,
      discountCents: orderDiscountCents(loaded.order, loaded.lines, loaded.lines),
      version: expectedVersion,
      tipCents: num(loaded.order.tip_cents),
    },
    nextLines,
  );
  if (!written.ok) return { ok: false, reason: written.reason, error: written.error };
  return { ok: true, orderId: input.orderId };
}

export async function removeLine(
  admin: Admin,
  input: { tenantId: string; orderId: string; lineId: string; expectedVersion?: number },
): Promise<MutateLineResult> {
  const loaded = await loadDraft(admin, input.tenantId, input.orderId);
  if ("ok" in loaded) return { ok: false, reason: loaded.reason, error: "Sale is not open." };
  const loadedVersion = Number(loaded.order.version) || 1;
  if (input.expectedVersion != null && input.expectedVersion !== loadedVersion) {
    return { ok: false, reason: "conflict", error: "This sale was just changed. Reload." };
  }
  const expectedVersion = input.expectedVersion ?? loadedVersion;
  const viaRpc = await mutateDraftLine(admin, {
    tenantId: input.tenantId,
    orderId: input.orderId,
    expectedVersion,
    op: "remove",
    line: { id: input.lineId },
  });
  if (viaRpc !== "fallback") return viaRpc;
  const { error } = await admin
    .from("order_lines")
    .delete()
    .eq("id", input.lineId)
    .eq("order_id", input.orderId);
  if (error) {
    logServerError("pos.removeLine", error);
    return { ok: false, reason: "unavailable", error: "Could not remove the item." };
  }
  const remaining = loaded.lines.filter((l) => l.id !== input.lineId);
  const nextLines = remaining.map(totalsInput);
  const written = await writeTotals(
    admin,
    {
      tenantId: input.tenantId,
      orderId: input.orderId,
      discountCents: orderDiscountCents(loaded.order, loaded.lines, remaining),
      version: input.expectedVersion ?? loadedVersion,
      tipCents: num(loaded.order.tip_cents),
    },
    nextLines,
  );
  if (!written.ok) return { ok: false, reason: written.reason, error: written.error };
  return { ok: true, orderId: input.orderId };
}

export type RepriceResult =
  | { ok: true; orderId: string; discountCents: number }
  | {
      ok: false;
      reason: "not_found" | "wrong_tenant" | "not_draft" | "unavailable" | "invalid" | "promo_needs_customer" | "promo_refused" | "conflict" | "over_limit";
      error: string;
    };

export async function repriceAndValidate(
  admin: Admin,
  input: { tenantId: string; orderId: string; promoCode?: string | null; expectedVersion?: number },
  deps: {
    resolvePromo?: (args: {
      tenantId: string;
      code: string;
      customerId: string;
      lines: Array<{ id: string; totalCents: number; variantId: string | null; eventId: null }>;
    }) => Promise<
      | { ok: true; discountCents: number; codeId: string }
      /** `over_limit`: the discount is real but the actor's role may not apply it (D-139). */
      | { ok: false; error: string; reason?: "over_limit" }
    >;
  } = {},
): Promise<RepriceResult> {
  const loaded = await loadDraft(admin, input.tenantId, input.orderId);
  if ("ok" in loaded) return { ok: false, reason: loaded.reason, error: "Sale is not open." };
  const loadedVersion = Number(loaded.order.version) || 1;
  if (input.expectedVersion != null && input.expectedVersion !== loadedVersion) {
    return { ok: false, reason: "conflict", error: "This sale was just changed. Reload." };
  }

  const locked = await lockedCustomLineIds(admin, { tenantId: input.tenantId, orderId: input.orderId });
  if (!locked.ok) return { ok: false, reason: "unavailable", error: "Could not re-read prices." };
  if (locked.lockedLineIds.length > 0) {
    return { ok: false, reason: "over_limit", error: "A custom amount on this sale still needs a manager." };
  }

  for (const line of loaded.lines) {
    if (!line.offering_id) continue;
    // A stamped phase is the price that sold. Later phases do not rewrite it.
    if (line.price_phase_id) continue;
    const phase = await livePhasePrice(admin, {
      tenantId: input.tenantId,
      offeringId: line.offering_id,
      variantId: line.variant_id,
    });
    if (!phase.ok) return { ok: false, reason: "unavailable", error: "Could not re-read prices." };
    const { data: offering, error } = await admin
      .from("talent_offerings")
      .select("id, amount_cents, title")
      .eq("id", line.offering_id)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();
    if (error) {
      logServerError("pos.reprice.offering", error);
      return { ok: false, reason: "unavailable", error: "Could not re-read prices." };
    }
    if (!offering && phase.priceCents == null) continue;
    let unitCents = Math.max(0, Math.trunc(num((offering as { amount_cents: number | null } | null)?.amount_cents)));
    if (line.variant_id) {
      const { data: variant, error: variantError } = await admin
        .from("talent_offering_variants")
        .select("id, amount_cents")
        .eq("id", line.variant_id)
        .maybeSingle();
      if (variantError) {
        logServerError("pos.reprice.variant", variantError);
        return { ok: false, reason: "unavailable", error: "Could not re-read prices." };
      }
      const amount = (variant as { amount_cents?: number | null } | null)?.amount_cents;
      if (amount != null) unitCents = Math.max(0, Math.trunc(num(amount)));
    }
    if (phase.priceCents != null) unitCents = phase.priceCents;
    // Extras are repriced from the catalog like everything else here. This is
    // the one command whose job is to answer "what does this cost NOW", and an
    // add-on left at its stored price would be the only stale number on a
    // receipt that claims to be current.
    //
    // An add-on that has since been deleted or moved to another offering makes
    // the whole reprice REFUSE. Silently dropping it would take money off the
    // sale while the kitchen ticket still promises the extra.
    const addons = await priceAddons(admin, {
      tenantId: input.tenantId,
      offeringId: line.offering_id,
      addonIds: line.addon_ids,
    });
    if (!addons.ok) return { ok: false, reason: addons.reason, error: addons.error };
    const units = num(line.units);
    const totalCents = lineTotalCents({ unitCents, units, addonCents: addons.priced.addonCents });
    const { error: uErr } = await admin
      .from("order_lines")
      .update({
        unit_cents: unitCents,
        total_cents: totalCents,
        ...(phase.phaseId ? { price_phase_id: phase.phaseId } : {}),
      })
      .eq("id", line.id);
    if (uErr) {
      logServerError("pos.reprice.line", uErr);
      return { ok: false, reason: "unavailable", error: "Could not re-read prices." };
    }
    line.unit_cents = unitCents;
    line.total_cents = totalCents;
    if (phase.phaseId) line.price_phase_id = phase.phaseId;
  }

  let discountCents = 0;
  let promoCodeId: string | null = null;
  const code = input.promoCode?.trim() ?? "";
  if (code) {
    if (!loaded.order.customer_id) {
      return { ok: false, reason: "promo_needs_customer", error: "A code needs a named buyer." };
    }
    if (!deps.resolvePromo) {
      return { ok: false, reason: "unavailable", error: "Promo resolution is not wired." };
    }
    const resolved = await deps.resolvePromo({
      tenantId: input.tenantId,
      code,
      customerId: loaded.order.customer_id,
      lines: loaded.lines.map((l) => ({
        id: l.offering_id ?? l.id,
        totalCents: num(l.total_cents),
        variantId: l.variant_id,
        eventId: null,
      })),
    });
    if (!resolved.ok) return { ok: false, reason: resolved.reason ?? "promo_refused", error: resolved.error };
    discountCents = resolved.discountCents;
    promoCodeId = resolved.codeId;
  }

  const nextLines = loaded.lines.map(totalsInput);
  const written = await writeTotals(
    admin,
    {
      tenantId: input.tenantId,
      orderId: input.orderId,
      // The promo replaces the order's own discount; the per-line discounts
      // (S5) stay on their lines and ride along.
      discountCents: discountCents + lineDiscountCents(loaded.lines),
      version: input.expectedVersion ?? loadedVersion,
      promoCodeId,
      tipCents: num(loaded.order.tip_cents),
    },
    nextLines,
  );
  if (!written.ok) return { ok: false, reason: written.reason === "conflict" ? "conflict" : "unavailable", error: written.error };
  return { ok: true, orderId: input.orderId, discountCents };
}

/**
 * The read side lives in `sale-read.ts`, re-exported here so the twelve call
 * sites that import `@/lib/pos/draft` keep working. The split is commands
 * versus queries and happened when this file hit the 800-line cap; moving the
 * import path as well would have turned a size fix into a rename in files that
 * had nothing to do with it.
 */
export { loadPosSale, listOpenPosSales } from "./sale-read";
