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
import { posGuestSessionId, type PosLineInput, type PosSaleView } from "./commands";

type Admin = {
  // Tests inject a fake PostgREST builder. Same seam as expire-orders.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

function num(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

type OrderRow = {
  id: string;
  tenant_id: string;
  status: string;
  currency: string;
  customer_id: string | null;
  guest_session_id: string | null;
  source_page: string | null;
  subtotal_cents: number | string;
  discount_cents: number | string;
  tax_cents: number | string;
  total_cents: number | string;
};

type LineRow = {
  id: string;
  offering_id: string | null;
  variant_id: string | null;
  session_id: string | null;
  label: string;
  units: number | string;
  unit_cents: number | string;
  total_cents: number | string;
};

export type CreateDraftOrderInput = {
  tenantId: string;
  actorUserId: string;
  currency?: string;
  context?: string | null;
  customerId?: string | null;
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
        subtotal_cents: 0,
        discount_cents: 0,
        tax_cents: 0,
        total_cents: 0,
        receipt_code: generateOpaqueCode(),
        source_channel: "pos",
        source_page: input.context ?? "pos",
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
      "id, tenant_id, status, currency, customer_id, guest_session_id, source_page, subtotal_cents, discount_cents, tax_cents, total_cents",
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
    .select("id, offering_id, variant_id, session_id, label, units, unit_cents, total_cents")
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
  orderId: string,
  lines: readonly { unitCents: number; units: number }[],
  discountCents: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const totals = cartTotals(lines, discountCents);
  if (!totalsAreWritable(totals)) return { ok: false, error: "CART_TOTALS_NOT_WRITABLE" };
  const { error } = await admin
    .from("orders")
    .update({
      subtotal_cents: totals.subtotalCents,
      discount_cents: totals.discountCents,
      tax_cents: totals.taxCents,
      total_cents: totals.totalCents,
    })
    .eq("id", orderId)
    .eq("status", "draft");
  if (error) {
    logServerError("pos.writeTotals", error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export type MutateLineResult =
  | { ok: true; orderId: string }
  | { ok: false; reason: "not_found" | "wrong_tenant" | "not_draft" | "unavailable" | "invalid"; error: string };

export async function addLine(
  admin: Admin,
  input: {
    tenantId: string;
    orderId: string;
    line: PosLineInput;
  },
): Promise<MutateLineResult> {
  const loaded = await loadDraft(admin, input.tenantId, input.orderId);
  if ("ok" in loaded) return { ok: false, reason: loaded.reason, error: "Sale is not open." };
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
    talent_profile_id: string | null;
    status: string | null;
  };
  if (off.status !== "published") {
    return { ok: false, reason: "invalid", error: "That item is not for sale." };
  }

  let unitCents = Math.max(0, Math.trunc(num(off.amount_cents)));
  let label = off.title?.trim() || "Item";
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
    if (v.label) label = `${label} · ${v.label}`;
  }

  const units = Math.trunc(input.line.units);
  const totalCents = lineTotalCents({ unitCents, units });
  const talentId = off.talent_profile_id;
  const { error: insErr } = await admin.from("order_lines").insert({
    order_id: input.orderId,
    tenant_id: input.tenantId,
    offering_id: off.id,
    variant_id: input.line.variantId ?? null,
    addon_ids: input.line.addonIds ?? [],
    session_id: input.line.sessionId ?? null,
    label,
    units,
    unit_cents: unitCents,
    total_cents: totalCents,
    talent_profile_id: talentId,
    owner_tenant_id: talentId ? null : input.tenantId,
    talent_cost_cents: talentId ? unitCents : 0,
    sort_order: loaded.lines.length,
  });
  if (insErr) {
    logServerError("pos.addLine.insert", insErr);
    return { ok: false, reason: "unavailable", error: "Could not add the item." };
  }

  const nextLines = [
    ...loaded.lines.map((l) => ({ unitCents: num(l.unit_cents), units: num(l.units) })),
    { unitCents, units },
  ];
  const written = await writeTotals(admin, input.orderId, nextLines, num(loaded.order.discount_cents));
  if (!written.ok) return { ok: false, reason: "unavailable", error: written.error };
  return { ok: true, orderId: input.orderId };
}

export async function updateLine(
  admin: Admin,
  input: { tenantId: string; orderId: string; lineId: string; units: number },
): Promise<MutateLineResult> {
  const loaded = await loadDraft(admin, input.tenantId, input.orderId);
  if ("ok" in loaded) return { ok: false, reason: loaded.reason, error: "Sale is not open." };
  if (!Number.isFinite(input.units) || input.units <= 0) {
    return { ok: false, reason: "invalid", error: "Quantity must be at least one." };
  }
  const line = loaded.lines.find((l) => l.id === input.lineId);
  if (!line) return { ok: false, reason: "not_found", error: "That line is not on this sale." };
  const units = Math.trunc(input.units);
  const unitCents = num(line.unit_cents);
  const { error } = await admin
    .from("order_lines")
    .update({ units, total_cents: lineTotalCents({ unitCents, units }) })
    .eq("id", input.lineId)
    .eq("order_id", input.orderId);
  if (error) {
    logServerError("pos.updateLine", error);
    return { ok: false, reason: "unavailable", error: "Could not update the item." };
  }
  const nextLines = loaded.lines.map((l) =>
    l.id === input.lineId
      ? { unitCents, units }
      : { unitCents: num(l.unit_cents), units: num(l.units) },
  );
  const written = await writeTotals(admin, input.orderId, nextLines, num(loaded.order.discount_cents));
  if (!written.ok) return { ok: false, reason: "unavailable", error: written.error };
  return { ok: true, orderId: input.orderId };
}

export async function removeLine(
  admin: Admin,
  input: { tenantId: string; orderId: string; lineId: string },
): Promise<MutateLineResult> {
  const loaded = await loadDraft(admin, input.tenantId, input.orderId);
  if ("ok" in loaded) return { ok: false, reason: loaded.reason, error: "Sale is not open." };
  const { error } = await admin
    .from("order_lines")
    .delete()
    .eq("id", input.lineId)
    .eq("order_id", input.orderId);
  if (error) {
    logServerError("pos.removeLine", error);
    return { ok: false, reason: "unavailable", error: "Could not remove the item." };
  }
  const nextLines = loaded.lines
    .filter((l) => l.id !== input.lineId)
    .map((l) => ({ unitCents: num(l.unit_cents), units: num(l.units) }));
  const written = await writeTotals(admin, input.orderId, nextLines, num(loaded.order.discount_cents));
  if (!written.ok) return { ok: false, reason: "unavailable", error: written.error };
  return { ok: true, orderId: input.orderId };
}

export type RepriceResult =
  | { ok: true; orderId: string; discountCents: number }
  | {
      ok: false;
      reason: "not_found" | "wrong_tenant" | "not_draft" | "unavailable" | "promo_needs_customer" | "promo_refused";
      error: string;
    };

export async function repriceAndValidate(
  admin: Admin,
  input: { tenantId: string; orderId: string; promoCode?: string | null },
  deps: {
    resolvePromo?: (args: {
      tenantId: string;
      code: string;
      customerId: string;
      lines: Array<{ id: string; totalCents: number; variantId: string | null; eventId: null }>;
    }) => Promise<{ ok: true; discountCents: number } | { ok: false; error: string }>;
  } = {},
): Promise<RepriceResult> {
  const loaded = await loadDraft(admin, input.tenantId, input.orderId);
  if ("ok" in loaded) return { ok: false, reason: loaded.reason, error: "Sale is not open." };

  for (const line of loaded.lines) {
    if (!line.offering_id) continue;
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
    if (!offering) continue;
    let unitCents = Math.max(0, Math.trunc(num((offering as { amount_cents: number | null }).amount_cents)));
    if (line.variant_id) {
      const { data: variant } = await admin
        .from("talent_offering_variants")
        .select("id, amount_cents")
        .eq("id", line.variant_id)
        .maybeSingle();
      const amount = (variant as { amount_cents?: number | null } | null)?.amount_cents;
      if (amount != null) unitCents = Math.max(0, Math.trunc(num(amount)));
    }
    const units = num(line.units);
    const { error: uErr } = await admin
      .from("order_lines")
      .update({ unit_cents: unitCents, total_cents: lineTotalCents({ unitCents, units }) })
      .eq("id", line.id);
    if (uErr) {
      logServerError("pos.reprice.line", uErr);
      return { ok: false, reason: "unavailable", error: "Could not re-read prices." };
    }
    line.unit_cents = unitCents;
    line.total_cents = lineTotalCents({ unitCents, units });
  }

  let discountCents = 0;
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
    if (!resolved.ok) return { ok: false, reason: "promo_refused", error: resolved.error };
    discountCents = resolved.discountCents;
  }

  const nextLines = loaded.lines.map((l) => ({ unitCents: num(l.unit_cents), units: num(l.units) }));
  const written = await writeTotals(admin, input.orderId, nextLines, discountCents);
  if (!written.ok) return { ok: false, reason: "unavailable", error: written.error };
  return { ok: true, orderId: input.orderId, discountCents };
}

export async function loadPosSale(
  admin: Admin,
  input: { tenantId: string; orderId: string },
): Promise<{ ok: true; sale: PosSaleView } | { ok: false; reason: "not_found" | "wrong_tenant" | "unavailable" }> {
  const { data: order, error } = await admin
    .from("orders")
    .select(
      "id, tenant_id, status, currency, customer_id, guest_session_id, source_page, subtotal_cents, discount_cents, tax_cents, total_cents",
    )
    .eq("id", input.orderId)
    .maybeSingle();
  if (error) {
    logServerError("pos.loadSale", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!order) return { ok: false, reason: "not_found" };
  const row = order as OrderRow;
  if (row.tenant_id !== input.tenantId) return { ok: false, reason: "wrong_tenant" };

  const { data: lineRows, error: linesError } = await admin
    .from("order_lines")
    .select("id, offering_id, variant_id, session_id, label, units, unit_cents, total_cents")
    .eq("order_id", input.orderId)
    .order("sort_order", { ascending: true });
  if (linesError) {
    logServerError("pos.loadSale.lines", linesError);
    return { ok: false, reason: "unavailable" };
  }

  const { data: paid } = await admin
    .from("booking_transactions")
    .select("gross_amount_cents, status")
    .eq("order_id", input.orderId);

  let depositPaidCents = 0;
  for (const txn of (paid ?? []) as Array<{ gross_amount_cents: number; status: string }>) {
    if (txn.status === "paid") depositPaidCents += num(txn.gross_amount_cents);
  }

  const totalCents = num(row.total_cents);
  const outstandingCents = Math.max(0, totalCents - depositPaidCents);
  const status = row.status;
  const paymentState =
    status === "paid" || status === "fulfilled"
      ? "paid"
      : status === "cancelled" || status === "refunded"
        ? "cancelled"
        : status === "pending_payment"
          ? "pending"
          : "unpaid";

  return {
    ok: true,
    sale: {
      orderId: row.id,
      tenantId: row.tenant_id,
      status,
      currency: row.currency,
      customerId: row.customer_id,
      guestSessionId: row.guest_session_id,
      context: row.source_page,
      subtotalCents: num(row.subtotal_cents),
      discountCents: num(row.discount_cents),
      taxCents: num(row.tax_cents),
      totalCents,
      depositPaidCents,
      outstandingCents,
      prepState: "not_submitted",
      paymentState,
      lines: ((lineRows ?? []) as LineRow[]).map((l) => ({
        id: l.id,
        offeringId: l.offering_id,
        variantId: l.variant_id,
        sessionId: l.session_id,
        label: l.label,
        units: num(l.units),
        unitCents: num(l.unit_cents),
        totalCents: num(l.total_cents),
      })),
    },
  };
}

export async function listOpenPosSales(
  admin: Admin,
  tenantId: string,
): Promise<{ ok: true; rows: Array<{ id: string; totalCents: number; createdAt: string | null }> } | { ok: false; reason: "unavailable" }> {
  const { data, error } = await admin
    .from("orders")
    .select("id, total_cents, created_at")
    .eq("tenant_id", tenantId)
    .eq("status", "draft")
    .eq("source_channel", "pos")
    .order("created_at", { ascending: false });
  if (error) {
    logServerError("pos.listOpen", error);
    return { ok: false, reason: "unavailable" };
  }
  return {
    ok: true,
    rows: ((data ?? []) as Array<{ id: string; total_cents: number; created_at: string | null }>).map((r) => ({
      id: r.id,
      totalCents: num(r.total_cents),
      createdAt: r.created_at,
    })),
  };
}
