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
import { loadActiveTicketForOrder } from "@/lib/preparation/tickets";
import { posGuestSessionId, type PosLineInput, type PosSaleView } from "./commands";

type Admin = {
  // Tests inject a fake PostgREST builder. Same seam as expire-orders.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // Real PostgREST rpc() is thenable; tests inject a Promise.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc?: (fn: string, args: Record<string, unknown>) => any;
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
  visit_id: string | null;
  space_id: string | null;
  version: number;
  subtotal_cents: number | string;
  discount_cents: number | string;
  tax_cents: number | string;
  total_cents: number | string;
  promo_code_id?: string | null;
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
  visitId?: string | null;
  spaceId?: string | null;
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
        source_channel: "pos",
        source_page: input.context ?? "pos",
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
      "id, tenant_id, status, currency, customer_id, guest_session_id, source_page, visit_id, space_id, version, subtotal_cents, discount_cents, tax_cents, total_cents, promo_code_id",
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
  input: { tenantId: string; orderId: string; discountCents: number; version: number; promoCodeId?: string | null },
  lines: readonly { unitCents: number; units: number }[],
): Promise<{ ok: true; version: number } | { ok: false; reason: "conflict" | "unavailable"; error: string }> {
  const totals = cartTotals(lines, input.discountCents);
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
  const reply = (data ?? {}) as { ok?: boolean; reason?: string };
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
  return { ok: true, orderId: input.orderId };
}

export type MutateLineResult =
  | { ok: true; orderId: string }
  | { ok: false; reason: "not_found" | "wrong_tenant" | "not_draft" | "unavailable" | "invalid" | "conflict"; error: string };

export async function addLine(
  admin: Admin,
  input: {
    tenantId: string;
    orderId: string;
    line: PosLineInput;
    expectedVersion?: number;
  },
): Promise<MutateLineResult> {
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
    talent_profile_id: string | null;
    status: string | null;
  };
  if (off.status !== "published") {
    return { ok: false, reason: "invalid", error: "That item is not for sale." };
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
  const expectedVersion = input.expectedVersion ?? loadedVersion;
  const viaRpc = await mutateDraftLine(admin, {
    tenantId: input.tenantId,
    orderId: input.orderId,
    expectedVersion,
    op: "add",
    line: {
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
    },
  });
  if (viaRpc !== "fallback") return viaRpc;

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
  const written = await writeTotals(
    admin,
    {
      tenantId: input.tenantId,
      orderId: input.orderId,
      discountCents: num(loaded.order.discount_cents),
      version: expectedVersion,
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
      total_cents: lineTotalCents({ unitCents, units }),
    },
  });
  if (viaRpc !== "fallback") return viaRpc;
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
  const written = await writeTotals(
    admin,
    {
      tenantId: input.tenantId,
      orderId: input.orderId,
      discountCents: num(loaded.order.discount_cents),
      version: expectedVersion,
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
  const nextLines = loaded.lines
    .filter((l) => l.id !== input.lineId)
    .map((l) => ({ unitCents: num(l.unit_cents), units: num(l.units) }));
  const written = await writeTotals(
    admin,
    {
      tenantId: input.tenantId,
      orderId: input.orderId,
      discountCents: num(loaded.order.discount_cents),
      version: input.expectedVersion ?? loadedVersion,
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
      reason: "not_found" | "wrong_tenant" | "not_draft" | "unavailable" | "promo_needs_customer" | "promo_refused" | "conflict";
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
    }) => Promise<{ ok: true; discountCents: number; codeId: string } | { ok: false; error: string }>;
  } = {},
): Promise<RepriceResult> {
  const loaded = await loadDraft(admin, input.tenantId, input.orderId);
  if ("ok" in loaded) return { ok: false, reason: loaded.reason, error: "Sale is not open." };
  const loadedVersion = Number(loaded.order.version) || 1;
  if (input.expectedVersion != null && input.expectedVersion !== loadedVersion) {
    return { ok: false, reason: "conflict", error: "This sale was just changed. Reload." };
  }

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
    if (!resolved.ok) return { ok: false, reason: "promo_refused", error: resolved.error };
    discountCents = resolved.discountCents;
    promoCodeId = resolved.codeId;
  }

  const nextLines = loaded.lines.map((l) => ({ unitCents: num(l.unit_cents), units: num(l.units) }));
  const written = await writeTotals(
    admin,
    {
      tenantId: input.tenantId,
      orderId: input.orderId,
      discountCents,
      version: input.expectedVersion ?? loadedVersion,
      promoCodeId,
    },
    nextLines,
  );
  if (!written.ok) return { ok: false, reason: written.reason === "conflict" ? "conflict" : "unavailable", error: written.error };
  return { ok: true, orderId: input.orderId, discountCents };
}

export async function loadPosSale(
  admin: Admin,
  input: { tenantId: string; orderId: string },
): Promise<{ ok: true; sale: PosSaleView } | { ok: false; reason: "not_found" | "wrong_tenant" | "unavailable" }> {
  const { data: order, error } = await admin
    .from("orders")
    .select(
      "id, tenant_id, status, currency, customer_id, guest_session_id, source_page, visit_id, space_id, version, subtotal_cents, discount_cents, tax_cents, total_cents",
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

  const { data: paid, error: paidError } = await admin
    .from("booking_transactions")
    .select("gross_amount_cents, status")
    .eq("order_id", input.orderId);
  if (paidError) {
    logServerError("pos.loadSale.paid", paidError);
    return { ok: false, reason: "unavailable" };
  }

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

  const ticketRes = await loadActiveTicketForOrder(admin, { tenantId: input.tenantId, orderId: input.orderId });
  if (!ticketRes.ok) return { ok: false, reason: "unavailable" };
  const ticket = ticketRes.ticket;
  const prepState: PosSaleView["prepState"] = !ticket
    ? "not_submitted"
    : ticket.revision > 1 && ticket.status === "queued"
      ? "amended"
      : ticket.status;

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
      visitId: row.visit_id,
      spaceId: row.space_id,
      version: Number(row.version) || 1,
      subtotalCents: num(row.subtotal_cents),
      discountCents: num(row.discount_cents),
      taxCents: num(row.tax_cents),
      totalCents,
      depositPaidCents,
      outstandingCents,
      prepState,
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
