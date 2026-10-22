"use server";

/**
 * customer-actions.ts — naming the buyer on an open counter sale (D-170).
 * Beside `actions.ts` (at its line budget), same `staff()` guard.
 */

import { z } from "zod";

import type { CapabilityKey } from "@/lib/access";
import { ensureCustomer } from "@/lib/customers/ensure-customer";
import { attachDraftCustomer } from "@/lib/pos/attach-customer";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";

const uuid = z.string().uuid();

/**
 * TUL-1708: the capability each action requires, passed into the staff guard itself. The
 * default guard capability is `agency.workspace.view`, which a `viewer` holds, so a writer
 * must name its own. `booking.payment.request` is manager+ (the same bar the counter's own
 * `posStaff` guard uses for sale writes, see `@/lib/pos/staff-actor.ts`) — this file used to
 * check it manually right after a bare guard call; now the guard itself enforces it.
 */
const CUSTOMER_ACTIONS_CAPABILITY = {
  posAttachCustomer: "booking.payment.request",
} as const satisfies Record<string, CapabilityKey>;

/** The counter's guard (`actions.ts` `staff()`), for the sale-side capability. */
async function staff(action: keyof typeof CUSTOMER_ACTIONS_CAPABILITY) {
  const guard = await requireWorkspaceStaffAction({ capability: CUSTOMER_ACTIONS_CAPABILITY[action] });
  if (!guard.ok) return { ok: false as const, error: guard.error };
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
  await requireNotImpersonating();
  const g = await staff("posAttachCustomer");
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

