"use server";

/**
 * customer-actions.ts — naming the buyer on an open counter sale (D-170).
 * Beside `actions.ts` (at its line budget), same `staff()` guard.
 */

import { z } from "zod";

import { userHasCapability } from "@/lib/access";
import { ensureCustomer } from "@/lib/customers/ensure-customer";
import { attachDraftCustomer } from "@/lib/pos/attach-customer";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";

const uuid = z.string().uuid();

/** The counter's guard (`actions.ts` `staff()`), for the sale-side capability. */
async function staff() {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false as const, error: guard.error };
  const allowed = await userHasCapability("booking.payment.request", guard.tenantId);
  if (!allowed) return { ok: false as const, error: "not_allowed" };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, error: "unavailable" };
  return { ok: true as const, tenantId: guard.tenantId, admin };
}

/**
 * D-170: name the buyer on the OPEN draft the moment the cashier saves or
 * picks one, so a promo code (which needs `orders.customer_id`) can be
 * applied before the charge. Same `ensureCustomer` as collection; idempotent.
 */
export async function posAttachCustomer(input: {
  orderId: string;
  expectedVersion?: number;
  customerId?: string | null;
  email?: string | null;
  phone?: string | null;
  displayName?: string | null;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({
    orderId: uuid,
    expectedVersion: z.number().int().positive().optional(),
    customerId: uuid.nullable().optional(),
    email: z.string().trim().max(254).nullable().optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    displayName: z.string().trim().max(120).nullable().optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  return attachDraftCustomer(
    g.admin,
    { tenantId: g.tenantId, ...parsed.data },
    { ensureCustomer: (c) => ensureCustomer(c, { admin: g.admin }) },
  );
}

