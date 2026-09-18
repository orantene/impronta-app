/**
 * attach-customer.ts — name the buyer on an OPEN draft, before any money.
 *
 * D-170: the buyer the cashier named ("Save & add to sale", or a customer
 * picked from search) used to live in client state only; `orders.customer_id`
 * was written at collection (`startCollection` → `ensureCustomer`). A promo
 * code needs a named buyer (`repriceAndValidate` refuses `promo_needs_customer`
 * on a null `customer_id`), so no code could ever be applied before the
 * charge, and D-139's over-limit refusal was unreachable from the screen.
 *
 * This writes the same row collection would have written, through the same
 * `ensureCustomer` (idempotent on `(tenant, email)` / `(tenant, phone)`), so
 * collection later finds the buyer already named and reuses it. Idempotent:
 * an order already carrying that customer answers ok without a version bump.
 * The version bumps on a real write, the way every other draft write does,
 * so a concurrent reprice on the old version sees a conflict rather than an
 * unnamed buyer.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { EnsureCustomerResult } from "@/lib/customers/ensure-customer";
import { logServerError } from "@/lib/server/safe-error";

type Admin = SupabaseClient;

export type AttachDraftCustomerInput = {
  tenantId: string;
  orderId: string;
  /** The order version the till was looking at. A stale one is a conflict. */
  expectedVersion?: number;
  /** An existing customer (picked from search) ... */
  customerId?: string | null;
  /** ... or the contact to resolve/create through `ensureCustomer`. */
  email?: string | null;
  phone?: string | null;
  displayName?: string | null;
};

/** Refusals are a subset of the counter's existing sale vocabulary
 *  (`MutateLineResult` + `startCollection`'s `no_contact`): every word here
 *  already has a sentence in `refusal-reason.ts`. */
export type AttachDraftCustomerResult =
  | { ok: true; orderId: string; customerId: string; version: number; changed: boolean }
  | { ok: false; reason: "not_found" | "wrong_tenant" | "not_draft" | "unavailable" | "invalid" | "conflict" | "no_contact"; error: string };

export type AttachDraftCustomerDeps = {
  ensureCustomer: (input: { tenantId: string; email?: string | null; phone?: string | null; displayName?: string | null }) => Promise<EnsureCustomerResult>;
};

export async function attachDraftCustomer(
  admin: Admin,
  input: AttachDraftCustomerInput,
  deps: AttachDraftCustomerDeps,
): Promise<AttachDraftCustomerResult> {
  const { data: order, error } = await admin
    .from("orders")
    .select("id, tenant_id, status, customer_id, version")
    .eq("id", input.orderId)
    .maybeSingle();
  if (error) {
    logServerError("pos.attachCustomer.load", error);
    return { ok: false, reason: "unavailable", error: "Could not read the sale." };
  }
  if (!order) return { ok: false, reason: "not_found", error: "Sale not found." };
  const row = order as { id: string; tenant_id: string; status: string; customer_id: string | null; version: number | null };
  if (row.tenant_id !== input.tenantId) return { ok: false, reason: "wrong_tenant", error: "Sale is not open." };
  if (row.status !== "draft") return { ok: false, reason: "not_draft", error: "Sale is not open." };
  const version = Number(row.version) || 1;
  if (input.expectedVersion != null && input.expectedVersion !== version) {
    return { ok: false, reason: "conflict", error: "This sale was just changed. Reload." };
  }

  let customerId: string;
  const picked = (input.customerId ?? "").trim();
  if (picked) {
    // A picked row must be this tenant's; never attach another workspace's customer.
    const { data: customer, error: cErr } = await admin
      .from("customers")
      .select("id")
      .eq("id", picked)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();
    if (cErr) {
      logServerError("pos.attachCustomer.customer", cErr);
      return { ok: false, reason: "unavailable", error: "Could not name the buyer." };
    }
    if (!customer) return { ok: false, reason: "not_found", error: "That customer is not here any more." };
    customerId = picked;
  } else {
    const email = input.email?.trim() || null;
    const phone = input.phone?.trim() || null;
    if (!email && !phone) return { ok: false, reason: "invalid", error: "A buyer needs an email or a phone." };
    const named = await deps.ensureCustomer({ tenantId: input.tenantId, email, phone, displayName: input.displayName ?? null });
    if (!named.ok) return { ok: false, reason: "no_contact", error: named.error };
    customerId = named.customerId;
  }

  if (row.customer_id === customerId) {
    return { ok: true, orderId: row.id, customerId, version, changed: false };
  }

  // Guarded on the version the till saw; the re-read says whether THIS write
  // took (a concurrent draft write moved the version and the guard matched
  // nothing).
  const { error: wErr } = await admin
    .from("orders")
    .update({ customer_id: customerId, version: version + 1 })
    .eq("id", row.id)
    .eq("tenant_id", input.tenantId)
    .eq("status", "draft")
    .eq("version", version);
  if (wErr) {
    logServerError("pos.attachCustomer.write", wErr);
    return { ok: false, reason: "unavailable", error: "Could not name the buyer." };
  }
  const { data: after, error: aErr } = await admin
    .from("orders")
    .select("customer_id, version")
    .eq("id", row.id)
    .maybeSingle();
  if (aErr) {
    logServerError("pos.attachCustomer.reread", aErr);
    return { ok: false, reason: "unavailable", error: "Could not name the buyer." };
  }
  const now = after as { customer_id: string | null; version: number | null } | null;
  if (!now || now.customer_id !== customerId || (Number(now.version) || 1) !== version + 1) {
    return { ok: false, reason: "conflict", error: "This sale was just changed. Reload." };
  }
  return { ok: true, orderId: row.id, customerId, version: version + 1, changed: true };
}
