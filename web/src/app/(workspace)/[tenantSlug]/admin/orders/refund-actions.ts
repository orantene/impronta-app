"use server";

import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { userHasCapability } from "@/lib/access";
import { refundOrderLines } from "@/lib/orders/refund-execute-lines";
import { isRefundEffect, refundReasonForEffect } from "@/lib/orders/refund-effects";

export type DeskOrderLine = {
  id: string;
  name: string;
  totalCents: number;
  refundedCents: number;
};

export async function loadOrderLinesForDesk(orderId: string): Promise<
  { ok: true; lines: DeskOrderLine[] } | { ok: false; error: string }
> {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return { ok: false, error: "invalid" };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "unavailable" };

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("id, tenant_id")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr) return { ok: false, error: "unavailable" };
  if (!order || (order as { tenant_id: string }).tenant_id !== guard.tenantId) {
    return { ok: false, error: "not_found" };
  }

  const { data, error } = await admin
    .from("order_lines")
    .select("id, label, total_cents, refunded_cents")
    .eq("order_id", orderId);
  if (error) return { ok: false, error: "unavailable" };
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

export async function refundOrderAtDesk(input: z.infer<typeof schema>) {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false as const, error: guard.error };
  const allowed = await userHasCapability("manage_billing", guard.tenantId);
  if (!allowed) return { ok: false as const, error: "not_allowed" };
  const parsed = schema.safeParse(input);
  if (!parsed.success || !isRefundEffect(parsed.data.effect)) {
    return { ok: false as const, error: "invalid" };
  }
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, error: "unavailable" };

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("id, tenant_id")
    .eq("id", parsed.data.orderId)
    .maybeSingle();
  if (orderErr) return { ok: false as const, error: "unavailable" };
  if (!order || (order as { tenant_id: string }).tenant_id !== guard.tenantId) {
    return { ok: false as const, error: "not_found" };
  }

  const result = await refundOrderLines(admin, {
    orderId: parsed.data.orderId,
    lineIds: parsed.data.lineIds,
    reason: refundReasonForEffect(parsed.data.effect),
    actorUserId: guard.user.id,
    note: `desk:${parsed.data.effect}`,
  });
  if (!result.ok) return { ok: false as const, error: result.reason };
  return { ok: true as const, refundedCents: result.refundedCents };
}
