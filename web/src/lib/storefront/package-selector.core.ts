/**
 * package_selector — the engine seam. Packages are offerings of kind
 * `package` with `offering_components` (WIRE-2.11); buying one is a plain
 * `createPurchase` of the package offering, which prices, holds and settles
 * the components through the one pipeline. Idempotent by client key.
 */

import type { PurchaseInput, PurchaseResult } from "@/lib/orders/purchase-types";
import type { CheckoutSessionInput, CheckoutSessionResult } from "@/lib/payments/stripe-checkout";
import { rowToOffering, type TalentOfferingRow } from "@/lib/talent/offerings-types";

import type { StorefrontAdmin } from "./admin";
import type { IdempotentRunner } from "./idempotent";
import type { PackageCard, PackageSelectorData, PackageSelectorInput, PackageSelectorProps, PackageSelectorResult } from "./package-selector.types";
import { mapEngineRefusal } from "./refusals";
import type { StorefrontIdentity } from "./request-context";

export type PackageSelectorDeps = {
  admin: StorefrontAdmin;
  runner: IdempotentRunner;
  identity: StorefrontIdentity;
  locale: "en" | "es";
  origin: string | null;
  now?: () => Date;
  livePrice: (admin: StorefrontAdmin, input: { tenantId: string; offeringId: string; nowIso?: string }) => Promise<{ ok: true; priceCents: number | null; phaseId: string | null } | { ok: false; reason: "unavailable" }>;
  createPurchase: (admin: StorefrontAdmin, input: PurchaseInput) => Promise<PurchaseResult>;
  createCheckout: (input: CheckoutSessionInput) => Promise<CheckoutSessionResult>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function readPackageSelectorCore(
  deps: PackageSelectorDeps,
  tenantId: string,
  props: PackageSelectorProps,
): Promise<{ ok: true; data: PackageSelectorData } | { ok: false; reason: string }> {
  if (!UUID.test(tenantId)) return { ok: false, reason: "invalid_request" };
  const now = (deps.now ?? (() => new Date()))();
  try {
    let q = deps.admin.from("talent_offerings").select("*").eq("tenant_id", tenantId).eq("kind", "package").eq("status", "published").eq("moderation_state", "approved").eq("visibility", "public");
    if (Array.isArray(props.packageIds)) q = q.in("id", props.packageIds);
    const { data: rows, error } = await q.order("sort_order", { ascending: true }).limit(40);
    if (error) return { ok: false, reason: "unavailable" };
    const offerings = ((rows ?? []) as TalentOfferingRow[]).map((r) => rowToOffering(r, deps.locale, []));
    if (offerings.length === 0) return { ok: true, data: { packages: [] } };
    const ids = offerings.map((o) => o.id);
    const { data: cRows, error: cErr } = await deps.admin.from("offering_components").select("offering_id, component_offering_id, qty, required").eq("tenant_id", tenantId).in("offering_id", ids);
    if (cErr) return { ok: false, reason: "unavailable" };
    const comps = (cRows ?? []) as Array<{ offering_id: string; component_offering_id: string; qty: number; required: boolean }>;
    const titles = new Map<string, string>();
    const compIds = [...new Set(comps.map((c) => c.component_offering_id))];
    if (compIds.length > 0) {
      const { data } = await deps.admin.from("talent_offerings").select("id, title").in("id", compIds);
      for (const t of (data ?? []) as Array<{ id: string; title: string | null }>) titles.set(t.id, t.title ?? "");
    }
    const packages: PackageCard[] = [];
    for (const o of offerings) {
      const live = await deps.livePrice(deps.admin, { tenantId, offeringId: o.id, nowIso: now.toISOString() });
      if (!live.ok) return { ok: false, reason: "unavailable" };
      packages.push({
        id: o.id,
        title: o.title,
        description: o.description,
        amountCents: o.amountCents,
        livePriceCents: live.phaseId ? live.priceCents : o.amountCents,
        currency: o.currency || "USD",
        allowPayInPerson: o.allowPayInPerson,
        requiresIdentity: o.requiresIdentity,
        components: comps
          .filter((c) => c.offering_id === o.id)
          .map((c) => ({ offeringId: c.component_offering_id, title: titles.get(c.component_offering_id) ?? "", qty: Number(c.qty ?? 1), required: c.required !== false })),
      });
    }
    return { ok: true, data: { packages } };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function actPackageSelectorCore(deps: PackageSelectorDeps, input: PackageSelectorInput): Promise<PackageSelectorResult> {
  if (!input || !UUID.test(input.tenantId ?? "") || !UUID.test(input.packageId ?? "")) return mapEngineRefusal("invalid_request", deps.locale);
  if (typeof input.clientOrderKey !== "string" || input.clientOrderKey.length < 8) return mapEngineRefusal("invalid_request", deps.locale);
  const units = Number.isInteger(input.units ?? 1) && (input.units ?? 1) > 0 && (input.units ?? 1) <= 20 ? input.units ?? 1 : null;
  if (!units) return mapEngineRefusal("invalid_units", deps.locale);
  const c = input.contact ?? { name: "", email: "" };
  const email = (c.email ?? "").trim().toLowerCase();
  if (!(c.name ?? "").trim() || !(email || (c.phone ?? "").trim())) return mapEngineRefusal("identity_required", deps.locale);

  const outcome = await deps.runner<PackageSelectorResult>({
    command: "storefront.package.buy",
    tenantId: input.tenantId,
    actorUserId: deps.identity.userId,
    key: input.clientOrderKey,
    args: { packageId: input.packageId, units, email, payment: input.payment },
    run: async () => {
      const { data: row, error } = await deps.admin.from("talent_offerings").select("id, kind, status, currency, title").eq("id", input.packageId).eq("tenant_id", input.tenantId).maybeSingle();
      if (error) return mapEngineRefusal("unavailable", deps.locale);
      if (!row || row.kind !== "package" || row.status !== "published") return mapEngineRefusal("not_sellable", deps.locale);
      const purchase = await deps.createPurchase(deps.admin, {
        tenantId: input.tenantId,
        clientOrderKey: input.clientOrderKey,
        actorUserId: deps.identity.userId,
        contact: { email: email || null, phone: c.phone?.trim() || null, displayName: c.name.trim() },
        lines: [{ offeringId: input.packageId, units }],
        paymentChoice: input.payment === "in_person" ? "in_person" : "full",
        sourceChannel: "storefront_package",
        sourcePage: input.sourcePage ?? null,
        locale: deps.locale,
        openThread: true,
      });
      if (!purchase.ok) return mapEngineRefusal(purchase, deps.locale);
      const { data: sale } = await deps.admin.from("orders").select("id, receipt_code").eq("id", purchase.orderId).maybeSingle();
      const receiptCode = sale && typeof sale.receipt_code === "string" ? sale.receipt_code : null;
      const receiptUrl = receiptCode && deps.origin ? `${deps.origin}/r/${receiptCode}` : null;
      let checkoutUrl: string | null = null;
      if (purchase.collectCents > 0 && purchase.transactionId && purchase.bookingId && deps.origin) {
        const session = await deps.createCheckout({
          transactionId: purchase.transactionId,
          amountCents: purchase.collectCents,
          currency: String(row.currency ?? "USD"),
          payerEmail: email || null,
          inquiryId: purchase.inquiryId,
          bookingId: purchase.bookingId,
          successUrl: receiptUrl ? `${receiptUrl}?paid=1` : `${deps.origin}/checkout/success`,
          cancelUrl: `${deps.origin}${input.sourcePage ?? "/"}`,
          description: String(row.title ?? "Package"),
          locale: deps.locale,
        });
        if (session.ok) checkoutUrl = session.url;
      }
      return { ok: true, orderId: purchase.orderId, collectCents: purchase.collectCents, checkoutUrl, receiptUrl, payInPerson: purchase.payInPerson, replayed: false };
    },
  });
  switch (outcome.status) {
    case "ok":
      return outcome.result.ok ? { ...outcome.result, replayed: outcome.replayed } : outcome.result;
    case "refused":
      return outcome.result;
    case "conflict":
      return mapEngineRefusal(outcome.code, deps.locale);
    case "error":
      return mapEngineRefusal("engine_error", deps.locale);
  }
}
