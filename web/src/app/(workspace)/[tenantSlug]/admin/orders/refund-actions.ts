"use server";

import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { userHasCapability } from "@/lib/access";
import { refundOrderLines } from "@/lib/orders/refund-execute-lines";
import { cancelHybridComponents } from "@/lib/orders/hybrid-package";
import { isRefundEffect, refundReasonForEffect } from "@/lib/orders/refund-effects";
import { refundDeskOutcome, type RefundDeskOutcome } from "@/lib/orders/refund-desk-copy";

/**
 * EVERY ANSWER FROM THIS FILE IS A CODE, NEVER A SENTENCE.
 *
 * It used to return whatever string the engine or the staff guard produced, and
 * the form rendered it: an operator refunding a cash sale read the word
 * `refund_refused`, and a Spanish one read it too. The screen maps the outcome
 * to translated copy through `lib/orders/refund-desk-copy.ts`. Same rule the
 * Projects surface states in `projects/[projectId]/actions.ts`.
 */
export type RefundDeskResult =
  | { ok: true; outcome: "refunded"; refundedCents: number }
  | { ok: false; outcome: RefundDeskOutcome };

export type DeskLinesResult =
  | { ok: true; lines: DeskOrderLine[] }
  | { ok: false; outcome: RefundDeskOutcome };

export type DeskOrderLine = {
  id: string;
  name: string;
  totalCents: number;
  refundedCents: number;
};

export async function loadOrderLinesForDesk(orderId: string): Promise<DeskLinesResult> {
  const guard = await requireWorkspaceStaffAction();
  // The guard's `error` is an English sentence for a log. The screen gets a
  // code and picks its own words.
  if (!guard.ok) return { ok: false, outcome: "not_allowed" };
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return { ok: false, outcome: "invalid" };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, outcome: "unavailable" };

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("id, tenant_id")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr) return { ok: false, outcome: "unavailable" };
  if (!order || (order as { tenant_id: string }).tenant_id !== guard.tenantId) {
    return { ok: false, outcome: "not_found" };
  }

  const { data, error } = await admin
    .from("order_lines")
    .select("id, label, total_cents, refunded_cents")
    .eq("order_id", orderId);
  if (error) return { ok: false, outcome: "unavailable" };
  const lines = ((data ?? []) as Array<{
    id: string;
    label: string | null;
    total_cents: number;
    refunded_cents: number | null;
  }>).map((row) => ({
    id: row.id,
    name: row.label ?? row.id.slice(0, 8),
    totalCents: row.total_cents,
    refundedCents: row.refunded_cents ?? 0,
  }));
  return { ok: true, lines };
}

const schema = z.object({
  orderId: z.string().uuid(),
  lineIds: z.array(z.string().uuid()).min(1),
  effect: z.string(),
});

export async function refundOrderAtDesk(input: z.infer<typeof schema>): Promise<RefundDeskResult> {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false, outcome: "not_allowed" };
  const allowed = await userHasCapability("manage_billing", guard.tenantId);
  if (!allowed) return { ok: false, outcome: "not_allowed" };
  const parsed = schema.safeParse(input);
  if (!parsed.success || !isRefundEffect(parsed.data.effect)) {
    return { ok: false, outcome: "invalid" };
  }
  if (parsed.data.lineIds.length === 0) return { ok: false, outcome: "pick_a_line" };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, outcome: "unavailable" };

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("id, tenant_id")
    .eq("id", parsed.data.orderId)
    .maybeSingle();
  if (orderErr) return { ok: false, outcome: "unavailable" };
  if (!order || (order as { tenant_id: string }).tenant_id !== guard.tenantId) {
    return { ok: false, outcome: "not_found" };
  }

  if (parsed.data.effect === "refund_hybrid_component") {
    const hybrid = await cancelHybridComponents(admin, {
      tenantId: guard.tenantId,
      orderId: parsed.data.orderId,
      lineIds: parsed.data.lineIds,
      actorUserId: guard.user.id,
      note: `desk:${parsed.data.effect}`,
    });
    if (!hybrid.ok) return { ok: false, outcome: refundDeskOutcome(hybrid.reason) };
    return { ok: true, outcome: "refunded", refundedCents: hybrid.refundedCents };
  }

  const result = await refundOrderLines(admin, {
    orderId: parsed.data.orderId,
    lineIds: parsed.data.lineIds,
    reason: refundReasonForEffect(parsed.data.effect),
    actorUserId: guard.user.id,
    note: `desk:${parsed.data.effect}`,
  });
  if (!result.ok) {
    // The PROVIDER's code wins when there is one: "no charge to reverse" and
    // "the provider said no" are different things to do next, and
    // `refund_refused` alone cannot tell them apart.
    const code =
      "code" in result && result.code ? result.code : result.reason;
    return { ok: false, outcome: refundDeskOutcome(code) };
  }
  return { ok: true, outcome: "refunded", refundedCents: result.refundedCents };
}
