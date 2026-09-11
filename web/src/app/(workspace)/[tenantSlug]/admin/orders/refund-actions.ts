"use server";

import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { userHasCapability } from "@/lib/access";
import { refundOrderLines } from "@/lib/orders/refund-execute-lines";
import { cancelHybridComponents } from "@/lib/orders/hybrid-package";
import { isRefundEffect, refundReasonForEffect } from "@/lib/orders/refund-effects";
import { refundDeskOutcome, type RefundDeskOutcome } from "@/lib/orders/refund-desk-copy";
import { packageRefundShare } from "@/lib/catalog/packages";

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
  /**
   * P06: when the line is a package, what a refund of its remainder would
   * split per component, by component share (`packageRefundShare`, Package
   * 2). Null for a line that is not a package.
   */
  components: Array<{ name: string; cents: number }> | null;
};

async function packageShares(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  tenantId: string,
  lines: Array<{ offeringId: string | null; totalCents: number; refundedCents: number }>,
): Promise<Map<string, Array<{ name: string; cents: number }>>> {
  const out = new Map<string, Array<{ name: string; cents: number }>>();
  const offeringIds = [...new Set(lines.map((l) => l.offeringId).filter((x): x is string => !!x))];
  if (offeringIds.length === 0) return out;
  const { data: comps, error } = await admin
    .from("offering_components")
    .select("offering_id, component_offering_id, qty")
    .eq("tenant_id", tenantId)
    .in("offering_id", offeringIds);
  if (error || !comps || comps.length === 0) return out;
  const rows = comps as Array<{ offering_id: string; component_offering_id: string; qty: number }>;
  const componentIds = [...new Set(rows.map((r) => r.component_offering_id))];
  const { data: offerings } = await admin
    .from("talent_offerings")
    .select("id, title, amount_cents")
    .in("id", componentIds);
  const byId = new Map(
    ((offerings ?? []) as Array<{ id: string; title: string | null; amount_cents: number | null }>).map((o) => [o.id, o]),
  );
  for (const offeringId of offeringIds) {
    const own = rows.filter((r) => r.offering_id === offeringId);
    if (own.length === 0) continue;
    const line = lines.find((l) => l.offeringId === offeringId);
    if (!line) continue;
    const share = packageRefundShare({
      packageTotalCents: line.totalCents,
      refundCents: Math.max(0, line.totalCents - line.refundedCents),
      components: own.map((r) => ({
        componentOfferingId: r.component_offering_id,
        qty: Number(r.qty),
        unitCents: Number(byId.get(r.component_offering_id)?.amount_cents ?? 0),
      })),
    });
    out.set(
      offeringId,
      share.map((s) => ({ name: byId.get(s.componentOfferingId)?.title ?? s.componentOfferingId.slice(0, 8), cents: s.cents })),
    );
  }
  return out;
}

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
    .select("id, label, total_cents, refunded_cents, offering_id")
    .eq("order_id", orderId);
  if (error) return { ok: false, outcome: "unavailable" };
  const raw = ((data ?? []) as Array<{
    id: string;
    label: string | null;
    total_cents: number;
    refunded_cents: number | null;
    offering_id: string | null;
  }>).map((row) => ({
    id: row.id,
    name: row.label ?? row.id.slice(0, 8),
    totalCents: row.total_cents,
    refundedCents: row.refunded_cents ?? 0,
    offeringId: row.offering_id,
  }));
  const shares = await packageShares(admin, guard.tenantId, raw);
  const lines: DeskOrderLine[] = raw.map((row) => ({
    id: row.id,
    name: row.name,
    totalCents: row.totalCents,
    refundedCents: row.refundedCents,
    components: row.offeringId ? shares.get(row.offeringId) ?? null : null,
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
