/**
 * cart_checkout — the engine seam.
 *
 * THE DRAFT ORDER IS THE CART. Lines are mutated through the POS draft
 * commands (`addLine` / `updateLine` / `removeLine` / `repriceAndValidate` /
 * `setTip`), which re-read catalog prices and phases, hold the order version
 * and answer `conflict` on a stale one. Nothing here prices a line itself.
 *
 * OWNERSHIP. A cart belongs to the middleware guest key (`web:<key>` on
 * `orders.guest_session_id`) or to the signed-in customer. Every op checks
 * the draft belongs to the caller before touching it; a foreign order id
 * reads as `not_found`, never as someone else's cart.
 *
 * IDENTITY BEFORE PAYMENT. `identify` names the buyer on the draft. Payment
 * goes through `createPurchase`, which enforces the identity demand
 * (`no_contact` → identity_required) and reserves capacity under the pool's
 * lock. The sale is a NEW order from the pipeline; the cart is then closed as
 * `cancelled` so it cannot be paid twice, and the whole step is idempotent
 * by the cart id through the command runner.
 *
 * FULFILMENT MODE has no column on `orders` (Preparation has `destination`).
 * It rides on `source_channel` as `storefront:<mode>` on the draft and on
 * the sale, and `space_id` carries the table for at-table.
 */

import type { EnsureCustomerResult } from "@/lib/customers/ensure-customer";
import { generateOpaqueCode } from "@/lib/links/code";
import type { PromoResolution } from "@/lib/orders/promo-resolve";
import type { PurchaseInput, PurchaseResult } from "@/lib/orders/purchase-types";
import type { CheckoutSessionInput, CheckoutSessionResult } from "@/lib/payments/stripe-checkout";
import type { MutateLineResult, RepriceResult } from "@/lib/pos/draft";
import type { SetTipResult } from "@/lib/pos/tip";

import type { StorefrontAdmin } from "./admin";
import type { CartCheckoutInput, CartCheckoutProps, CartCheckoutResult, CartData, CartLine, FulfilmentMode } from "./cart-checkout.types";
import type { IdempotentRunner } from "./idempotent";
import { mapEngineRefusal } from "./refusals";
import type { StorefrontIdentity } from "./request-context";

export type CartCheckoutDeps = {
  admin: StorefrontAdmin;
  runner: IdempotentRunner;
  identity: StorefrontIdentity;
  locale: "en" | "es";
  origin: string | null;
  addLine: (admin: StorefrontAdmin, input: { tenantId: string; orderId: string; line: { offeringId: string; variantId?: string | null; addonIds?: string[]; units: number; sessionId?: string | null }; expectedVersion?: number }) => Promise<MutateLineResult>;
  updateLine: (admin: StorefrontAdmin, input: { tenantId: string; orderId: string; lineId: string; units: number; expectedVersion?: number }) => Promise<MutateLineResult>;
  removeLine: (admin: StorefrontAdmin, input: { tenantId: string; orderId: string; lineId: string; expectedVersion?: number }) => Promise<MutateLineResult>;
  reprice: (
    admin: StorefrontAdmin,
    input: { tenantId: string; orderId: string; promoCode?: string | null; expectedVersion?: number },
    deps: { resolvePromo: (args: { tenantId: string; code: string; customerId: string; lines: Array<{ id: string; totalCents: number; variantId: string | null; eventId: null }> }) => Promise<{ ok: true; discountCents: number; codeId: string } | { ok: false; error: string }> },
  ) => Promise<RepriceResult>;
  resolvePromo: (admin: StorefrontAdmin, input: { tenantId: string; code: string; customerId: string; lines: Array<{ id: string; totalCents: number; variantId?: string | null; eventId?: string | null }> }) => Promise<PromoResolution>;
  setTip: (admin: StorefrontAdmin, input: { tenantId: string; orderId: string; tipCents: number; operationKey: string; expectedVersion: number }) => Promise<SetTipResult>;
  ensureCustomer: (input: { tenantId: string; email?: string | null; phone?: string | null; displayName?: string | null; userId?: string | null; locale?: string | null }, deps: { admin: StorefrontAdmin }) => Promise<EnsureCustomerResult>;
  createPurchase: (admin: StorefrontAdmin, input: PurchaseInput) => Promise<PurchaseResult>;
  createCheckout: (input: CheckoutSessionInput) => Promise<CheckoutSessionResult>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODES: FulfilmentMode[] = ["pickup", "delivery", "at_table"];
const CHANNEL_PREFIX = "storefront:";

type OrderRow = {
  id: string;
  tenant_id: string;
  status: string;
  currency: string;
  customer_id: string | null;
  guest_session_id: string | null;
  source_channel: string | null;
  source_page: string | null;
  space_id: string | null;
  version: number | string;
  subtotal_cents: number | string;
  discount_cents: number | string;
  tax_cents: number | string;
  total_cents: number | string;
  tip_cents?: number | string | null;
  promo_code_id?: string | null;
  requires_identity?: boolean | null;
};

type LineRow = {
  id: string;
  offering_id: string | null;
  variant_id: string | null;
  addon_ids: string[] | null;
  label: string;
  units: number | string;
  unit_cents: number | string;
  total_cents: number | string;
};

const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(n) ? n : 0;
};

const ORDER_COLUMNS =
  "id, tenant_id, status, currency, customer_id, guest_session_id, source_channel, source_page, space_id, version, subtotal_cents, discount_cents, tax_cents, total_cents, tip_cents, promo_code_id, requires_identity";

/** The cart owner's key on `orders.guest_session_id`. */
export function cartGuestSessionId(identity: StorefrontIdentity): string | null {
  return identity.guestKey ? `web:${identity.guestKey}` : null;
}

function modeOf(channel: string | null | undefined): FulfilmentMode | null {
  if (!channel || !channel.startsWith(CHANNEL_PREFIX)) return null;
  const mode = channel.slice(CHANNEL_PREFIX.length);
  return (MODES as string[]).includes(mode) ? (mode as FulfilmentMode) : null;
}

/** The signed-in customer's row on this tenant, when there is one. */
async function customerIdFor(deps: CartCheckoutDeps, tenantId: string): Promise<string | null> {
  if (!deps.identity.userId) return null;
  const { data } = await deps.admin
    .from("customers")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("user_id", deps.identity.userId)
    .limit(1)
    .maybeSingle();
  return data && typeof data.id === "string" ? data.id : null;
}

function ownedBy(row: OrderRow, guestKey: string | null, customerId: string | null): boolean {
  if (customerId && row.customer_id === customerId) return true;
  if (guestKey && row.guest_session_id === guestKey) return true;
  return false;
}

type Loaded = { ok: true; order: OrderRow; lines: LineRow[] } | { ok: false; code: string };

async function loadOwnDraft(deps: CartCheckoutDeps, tenantId: string, orderId: string): Promise<Loaded> {
  if (!UUID.test(orderId)) return { ok: false, code: "invalid_request" };
  const { data, error } = await deps.admin.from("orders").select(ORDER_COLUMNS).eq("id", orderId).eq("tenant_id", tenantId).maybeSingle();
  if (error) return { ok: false, code: "unavailable" };
  if (!data) return { ok: false, code: "not_found" };
  const order = data as OrderRow;
  const customerId = await customerIdFor(deps, tenantId);
  if (!ownedBy(order, cartGuestSessionId(deps.identity), customerId)) return { ok: false, code: "not_found" };
  if (order.status !== "draft") return { ok: false, code: "not_draft" };
  const { data: lineRows, error: lErr } = await deps.admin
    .from("order_lines")
    .select("id, offering_id, variant_id, addon_ids, label, units, unit_cents, total_cents")
    .eq("order_id", orderId)
    .order("sort_order", { ascending: true });
  if (lErr) return { ok: false, code: "unavailable" };
  return { ok: true, order, lines: (lineRows ?? []) as LineRow[] };
}

async function findOwnDraft(deps: CartCheckoutDeps, tenantId: string): Promise<OrderRow | null> {
  const guestKey = cartGuestSessionId(deps.identity);
  const customerId = await customerIdFor(deps, tenantId);
  if (!guestKey && !customerId) return null;
  let q = deps.admin.from("orders").select(ORDER_COLUMNS).eq("tenant_id", tenantId).eq("status", "draft");
  q = customerId ? q.eq("customer_id", customerId) : q.eq("guest_session_id", guestKey);
  const { data } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data as OrderRow | null) ?? null;
}

async function shape(deps: CartCheckoutDeps, order: OrderRow, lines: LineRow[]): Promise<NonNullable<CartData["order"]>> {
  let promo: { code: string; discountCents: number } | null = null;
  if (order.promo_code_id) {
    const { data } = await deps.admin.from("tenant_promo_codes").select("id, code").eq("id", order.promo_code_id).maybeSingle();
    if (data && typeof data.code === "string") promo = { code: data.code, discountCents: num(order.discount_cents) };
  }
  let customer: NonNullable<CartData["order"]>["customer"] = null;
  if (order.customer_id) {
    const { data } = await deps.admin.from("customers").select("id, display_name, email, phone_e164").eq("id", order.customer_id).maybeSingle();
    if (data) {
      customer = {
        name: typeof data.display_name === "string" ? data.display_name : null,
        email: typeof data.email === "string" ? data.email : null,
        phone: typeof data.phone_e164 === "string" ? data.phone_e164 : null,
      };
    }
  }
  const shapedLines: CartLine[] = lines.map((l) => ({
    id: l.id,
    offeringId: l.offering_id,
    variantId: l.variant_id,
    addonIds: Array.isArray(l.addon_ids) ? l.addon_ids : [],
    label: l.label,
    units: num(l.units),
    unitCents: num(l.unit_cents),
    totalCents: num(l.total_cents),
  }));
  return {
    id: order.id,
    version: num(order.version) || 1,
    currency: order.currency || "USD",
    subtotalCents: num(order.subtotal_cents),
    discountCents: num(order.discount_cents),
    tipCents: num(order.tip_cents),
    taxCents: num(order.tax_cents),
    totalCents: num(order.total_cents),
    lines: shapedLines,
    fulfilment: modeOf(order.source_channel),
    promo,
    customer,
    requiresIdentity: order.requires_identity === true,
  };
}

export async function readCartCheckoutCore(
  deps: CartCheckoutDeps,
  tenantId: string,
  props: CartCheckoutProps,
): Promise<{ ok: true; data: CartData } | { ok: false; reason: string }> {
  if (!UUID.test(tenantId)) return { ok: false, reason: "invalid_request" };
  try {
    const draft = await findOwnDraft(deps, tenantId);
    let order: CartData["order"] = null;
    if (draft) {
      const { data: lineRows, error } = await deps.admin
        .from("order_lines")
        .select("id, offering_id, variant_id, addon_ids, label, units, unit_cents, total_cents")
        .eq("order_id", draft.id)
        .order("sort_order", { ascending: true });
      if (error) return { ok: false, reason: "unavailable" };
      order = await shape(deps, draft, (lineRows ?? []) as LineRow[]);
    }
    const prefill =
      deps.identity.userId && (deps.identity.email || deps.identity.displayName)
        ? { name: deps.identity.displayName, email: deps.identity.email }
        : null;
    return {
      ok: true,
      data: {
        order,
        modes: (props.modes ?? ["pickup"]).filter((m) => MODES.includes(m)),
        tipPresets: (props.tipPresets ?? [0, 10, 15, 20]).filter((n) => Number.isFinite(n) && n >= 0),
        promoEnabled: props.promo !== false,
        prefill,
      },
    };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function actCartCheckoutCore(
  deps: CartCheckoutDeps,
  input: CartCheckoutInput,
  expectedVersion?: number,
): Promise<CartCheckoutResult> {
  if (!input || !UUID.test(input.tenantId ?? "")) return mapEngineRefusal("invalid_request", deps.locale);
  const refuse = (code: unknown) => mapEngineRefusal(code as string, deps.locale);
  try {
    switch (input.op) {
      case "create": {
        const existing = await findOwnDraft(deps, input.tenantId);
        if (existing) return { ok: true, op: "create", orderId: existing.id, version: num(existing.version) || 1, already: true };
        const guestKey = cartGuestSessionId(deps.identity);
        const customerId = await customerIdFor(deps, input.tenantId);
        // `orders_draft_has_an_identity`: a cart with neither owner cannot exist.
        if (!guestKey && !customerId) return refuse("identity_required");
        const mode = input.fulfilment && MODES.includes(input.fulfilment) ? input.fulfilment : null;
        const { data, error } = await deps.admin
          .from("orders")
          .insert({
            tenant_id: input.tenantId,
            customer_id: customerId,
            guest_session_id: customerId ? null : guestKey,
            status: "draft",
            currency: "USD",
            version: 1,
            subtotal_cents: 0,
            discount_cents: 0,
            tax_cents: 0,
            total_cents: 0,
            receipt_code: generateOpaqueCode(),
            source_channel: mode ? `${CHANNEL_PREFIX}${mode}` : "storefront",
            source_page: input.sourcePage ?? null,
            payout_release_rule: "immediate",
          })
          .select("id, version")
          .single();
        if (error || !data) return refuse(error ?? "unavailable");
        return { ok: true, op: "create", orderId: String(data.id), version: num(data.version) || 1, already: false };
      }
      case "add_line": {
        const own = await loadOwnDraft(deps, input.tenantId, input.orderId);
        if (!own.ok) return refuse(own.code);
        const r = await deps.addLine(deps.admin, { tenantId: input.tenantId, orderId: input.orderId, line: input.line, expectedVersion });
        if (!r.ok) return refuse(r);
        return { ok: true, op: "add_line", orderId: input.orderId, version: await versionOf(deps, input.orderId) };
      }
      case "update_line": {
        const own = await loadOwnDraft(deps, input.tenantId, input.orderId);
        if (!own.ok) return refuse(own.code);
        const r = await deps.updateLine(deps.admin, { tenantId: input.tenantId, orderId: input.orderId, lineId: input.lineId, units: input.units, expectedVersion });
        if (!r.ok) return refuse(r);
        return { ok: true, op: "update_line", orderId: input.orderId, version: await versionOf(deps, input.orderId) };
      }
      case "remove_line": {
        const own = await loadOwnDraft(deps, input.tenantId, input.orderId);
        if (!own.ok) return refuse(own.code);
        const r = await deps.removeLine(deps.admin, { tenantId: input.tenantId, orderId: input.orderId, lineId: input.lineId, expectedVersion });
        if (!r.ok) return refuse(r);
        return { ok: true, op: "remove_line", orderId: input.orderId, version: await versionOf(deps, input.orderId) };
      }
      case "apply_promo": {
        const own = await loadOwnDraft(deps, input.tenantId, input.orderId);
        if (!own.ok) return refuse(own.code);
        const code = (input.code ?? "").trim();
        if (!code) return refuse("promo_unknown");
        // A code needs a named buyer: the redemption limit is per customer.
        if (!own.order.customer_id) return refuse("promo_needs_customer");
        // The reprice folds every promo refusal into `promo_refused`; the
        // resolver's own word is kept so the person reads "expired", not "no".
        let promoReason: string | null = null;
        const r = await deps.reprice(
          deps.admin,
          { tenantId: input.tenantId, orderId: input.orderId, promoCode: code, expectedVersion },
          {
            resolvePromo: async (args) => {
              const resolved = await deps.resolvePromo(deps.admin, args);
              if (!resolved.ok) {
                promoReason = resolved.reason;
                return { ok: false, error: resolved.reason };
              }
              return { ok: true, discountCents: resolved.discountCents, codeId: resolved.codeId };
            },
          },
        );
        if (!r.ok) return refuse(r.reason === "promo_refused" && promoReason ? promoReason : r);
        return { ok: true, op: "apply_promo", orderId: input.orderId, version: await versionOf(deps, input.orderId), discountCents: r.discountCents };
      }
      case "set_fulfilment": {
        const own = await loadOwnDraft(deps, input.tenantId, input.orderId);
        if (!own.ok) return refuse(own.code);
        if (!MODES.includes(input.fulfilment)) return refuse("invalid_request");
        const version = num(own.order.version) || 1;
        if (expectedVersion != null && expectedVersion !== version) return refuse("conflict");
        if (input.fulfilment === "at_table" && input.spaceId && !UUID.test(input.spaceId)) return refuse("invalid_request");
        const { error } = await deps.admin
          .from("orders")
          .update({
            source_channel: `${CHANNEL_PREFIX}${input.fulfilment}`,
            space_id: input.fulfilment === "at_table" ? input.spaceId ?? null : null,
          })
          .eq("id", input.orderId)
          .eq("status", "draft");
        if (error) return refuse("unavailable");
        return { ok: true, op: "set_fulfilment", orderId: input.orderId, version };
      }
      case "set_tip": {
        const own = await loadOwnDraft(deps, input.tenantId, input.orderId);
        if (!own.ok) return refuse(own.code);
        const version = expectedVersion ?? (num(own.order.version) || 1);
        const r = await deps.setTip(deps.admin, {
          tenantId: input.tenantId,
          orderId: input.orderId,
          tipCents: input.tipCents,
          operationKey: `storefront:tip:${input.orderId}:${input.tipCents}`,
          expectedVersion: version,
        });
        if (!r.ok) return refuse(r.reason === "negative" ? "invalid_request" : r);
        return { ok: true, op: "set_tip", orderId: input.orderId, version: r.version };
      }
      case "identify": {
        const own = await loadOwnDraft(deps, input.tenantId, input.orderId);
        if (!own.ok) return refuse(own.code);
        const c = input.contact ?? { name: "" };
        if (!(c.name ?? "").trim() || !((c.email ?? "").trim() || (c.phone ?? "").trim())) return refuse("identity_required");
        const version = num(own.order.version) || 1;
        if (expectedVersion != null && expectedVersion !== version) return refuse("conflict");
        const ensured = await deps.ensureCustomer(
          { tenantId: input.tenantId, email: c.email ?? null, phone: c.phone ?? null, displayName: c.name.trim(), userId: deps.identity.userId, locale: deps.locale },
          { admin: deps.admin },
        );
        if (!ensured.ok) return refuse(ensured.reason === "unavailable" ? "unavailable" : "invalid");
        // The guest key STAYS on the row: the cart is still reachable from
        // this browser, and the CHECK only needs one of the two.
        const { error } = await deps.admin.from("orders").update({ customer_id: ensured.customerId }).eq("id", input.orderId).eq("status", "draft");
        if (error) return refuse("unavailable");
        return { ok: true, op: "identify", orderId: input.orderId, version };
      }
      case "start_payment":
        return startPayment(deps, input, expectedVersion);
      default:
        return refuse("invalid_request");
    }
  } catch {
    return refuse("engine_error");
  }
}

async function versionOf(deps: CartCheckoutDeps, orderId: string): Promise<number> {
  const { data } = await deps.admin.from("orders").select("id, version").eq("id", orderId).maybeSingle();
  return num(data?.version) || 1;
}

async function startPayment(
  deps: CartCheckoutDeps,
  input: Extract<CartCheckoutInput, { op: "start_payment" }>,
  expectedVersion?: number,
): Promise<CartCheckoutResult> {
  const own = await loadOwnDraft(deps, input.tenantId, input.orderId);
  if (!own.ok) {
    // A cart already turned into a sale replays that sale, which is what the
    // runner below does; a foreign or missing one is simply not found.
    if (own.code !== "not_draft") return mapEngineRefusal(own.code, deps.locale);
  }
  const outcome = await deps.runner<CartCheckoutResult>({
    command: "storefront.cart.pay",
    tenantId: input.tenantId,
    actorUserId: deps.identity.userId,
    key: `cart:${input.orderId}`,
    args: { orderId: input.orderId, payment: input.payment },
    run: async () => {
      if (!own.ok) return mapEngineRefusal(own.code, deps.locale);
      const { order, lines } = own;
      const version = num(order.version) || 1;
      if (expectedVersion != null && expectedVersion !== version) return mapEngineRefusal("conflict", deps.locale);
      if (lines.length === 0) return mapEngineRefusal("empty_order", deps.locale);

      let contact: PurchaseInput["contact"] = {};
      if (order.customer_id) {
        const { data } = await deps.admin.from("customers").select("id, display_name, email, phone_e164").eq("id", order.customer_id).maybeSingle();
        if (data) contact = { email: data.email ?? null, phone: data.phone_e164 ?? null, displayName: data.display_name ?? null };
      }
      // Money does not need a name; a product may. The pipeline decides
      // (`no_contact` → identity_required) from the offerings' own rows.
      let promoCode: string | null = null;
      if (order.promo_code_id) {
        const { data } = await deps.admin.from("tenant_promo_codes").select("id, code").eq("id", order.promo_code_id).maybeSingle();
        if (data && typeof data.code === "string") promoCode = data.code;
      }
      const purchase = await deps.createPurchase(deps.admin, {
        tenantId: input.tenantId,
        clientOrderKey: `cart:${order.id}`,
        actorUserId: deps.identity.userId,
        contact,
        lines: lines
          .filter((l) => l.offering_id)
          .map((l) => ({
            offeringId: l.offering_id as string,
            units: num(l.units),
            variantId: l.variant_id,
            addonIds: Array.isArray(l.addon_ids) ? l.addon_ids : [],
          })),
        paymentChoice: input.payment === "in_person" ? "in_person" : "full",
        sourceChannel: order.source_channel ?? "storefront",
        sourcePage: input.sourcePage ?? order.source_page ?? null,
        promoCode,
        locale: deps.locale,
        openThread: true,
        ageAttestation: input.confirmedAge ? { confirmedAge: input.confirmedAge } : null,
      });
      if (!purchase.ok) return mapEngineRefusal(purchase, deps.locale);

      // The cart is spent. Closing it is what stops a second payment from a
      // stale tab; a failure to close is logged by the caller, never fatal.
      await deps.admin.from("orders").update({ status: "cancelled" }).eq("id", order.id).eq("status", "draft");

      const { data: sale } = await deps.admin.from("orders").select("id, receipt_code, currency").eq("id", purchase.orderId).maybeSingle();
      const receiptCode = sale && typeof sale.receipt_code === "string" ? sale.receipt_code : null;
      const receiptUrl = receiptCode && deps.origin ? `${deps.origin}/r/${receiptCode}` : null;
      let checkoutUrl: string | null = null;
      if (purchase.collectCents > 0 && purchase.transactionId && purchase.bookingId && deps.origin) {
        const session = await deps.createCheckout({
          transactionId: purchase.transactionId,
          amountCents: purchase.collectCents,
          currency: String(sale?.currency ?? order.currency ?? "USD"),
          payerEmail: contact.email ?? null,
          inquiryId: purchase.inquiryId,
          bookingId: purchase.bookingId,
          successUrl: receiptUrl ? `${receiptUrl}?paid=1` : `${deps.origin}/checkout/success`,
          cancelUrl: `${deps.origin}${input.sourcePage ?? order.source_page ?? "/"}`,
          description: "Order",
          locale: deps.locale,
        });
        if (session.ok) checkoutUrl = session.url;
      }
      return {
        ok: true,
        op: "start_payment",
        orderId: purchase.orderId,
        receiptCode,
        receiptUrl,
        collectCents: purchase.collectCents,
        checkoutUrl,
        payInPerson: purchase.payInPerson,
        replayed: false,
      };
    },
  });
  switch (outcome.status) {
    case "ok":
      return outcome.result.ok && outcome.result.op === "start_payment"
        ? { ...outcome.result, replayed: outcome.replayed }
        : outcome.result;
    case "refused":
      return outcome.result;
    case "conflict":
      return mapEngineRefusal(outcome.code, deps.locale);
    case "error":
      return mapEngineRefusal("engine_error", deps.locale);
  }
}
