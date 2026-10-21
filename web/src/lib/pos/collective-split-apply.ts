/**
 * TUL-1467 · Friends collective split on POS counter sales. Online orders are split when they are priced
 * (service-hub/collective-split.ts via createPurchase); a counter sale is built line by line, so the same split
 * is applied once, at the start of collection, when the lines are final. Same rule, same function: the owner takes
 * the accepted share of each member's catalog line (max 90%), written as the line's talent cost, owner take and
 * accepted-share snapshot. Nothing about price, fee or what the client pays changes.
 *
 * Flag COLLECTIVE_SPLIT_ENABLED (default OFF): with it off nothing is read. Recomputed from the lines as they are on
 * EVERY call (the result depends only on the line total and the accepted share, and the member-name label suffix is
 * idempotent), so a quantity change after an earlier attempt is re-split, and a line whose member no longer has an
 * accepted share is cleared back to the POS convention (talent cost = unit price). Any read or write problem refuses
 * the collection (a collective sale is never taken half split).
 */
import { collectiveSplitEnabled, applyCollectiveOwnerShares, SPLIT_UNAVAILABLE_MESSAGE } from "@/lib/service-hub/collective-split";
import { logServerError } from "@/lib/server/safe-error";
import type { Admin } from "./sale-rows";

type DbLine = {
  id: string;
  kind: string | null;
  talent_profile_id: string | null;
  total_cents: number | string;
  talent_cost_cents: number | string | null;
  unit_cents: number | string | null;
  owner_take_cents: number | string | null;
  label: string;
  owner_share_snapshot: unknown;
};

export type PosSplitResult = { ok: true; changed: number } | { ok: false; error: string };

export async function applyPosCollectiveSplit(admin: Admin, input: { tenantId: string; orderId: string }): Promise<PosSplitResult> {
  if (!collectiveSplitEnabled()) return { ok: true, changed: 0 };
  const refuse = (detail: unknown): PosSplitResult => {
    logServerError("pos.collectiveSplit", detail);
    return { ok: false, error: SPLIT_UNAVAILABLE_MESSAGE };
  };
  try {
    const { data: order, error: oErr } = await admin.from("orders").select("id, currency").eq("id", input.orderId).eq("tenant_id", input.tenantId).maybeSingle();
    if (oErr) return refuse(oErr);
    if (!order) return { ok: true, changed: 0 };
    const { data: rows, error: lErr } = await admin
      .from("order_lines")
      .select("id, kind, talent_profile_id, total_cents, talent_cost_cents, unit_cents, owner_take_cents, label, owner_share_snapshot")
      .eq("order_id", input.orderId)
      .eq("tenant_id", input.tenantId);
    if (lErr) return refuse(lErr);
    const todo = ((rows ?? []) as DbLine[]).filter((l) => l.kind !== "custom" && l.talent_profile_id);
    if (todo.length === 0) return { ok: true, changed: 0 };

    const lines = todo.map((l) => ({
      id: l.id,
      talentProfileId: l.talent_profile_id,
      totalCents: Number(l.total_cents) || 0,
      talentCostCents: Number(l.talent_cost_cents) || 0,
      label: l.label,
    })) as Array<{ id: string; talentProfileId: string | null; totalCents: number; talentCostCents: number; label: string; ownerTakeCents?: number; ownerShareSnapshot?: Record<string, unknown> }>;
    const applied = await applyCollectiveOwnerShares(admin as never, input.tenantId, String((order as { currency: string }).currency), lines);
    if (!applied.ok) return { ok: false, error: applied.error };

    let changed = 0;
    const byId = new Map(todo.map((d) => [d.id, d]));
    for (const l of lines) {
      const before = byId.get(l.id);
      if (!l.ownerShareSnapshot) {
        // Not a collective / no accepted share now: undo a split an earlier attempt froze on this line.
        if (before?.owner_share_snapshot) {
          const { error } = await admin
            .from("order_lines")
            .update({ talent_cost_cents: Number(before.unit_cents) || 0, owner_take_cents: null, owner_share_snapshot: null })
            .eq("id", l.id);
          if (error) return refuse(error);
          changed += 1;
        }
        continue;
      }
      if (before && before.owner_share_snapshot && Number(before.talent_cost_cents) === l.talentCostCents && Number(before.owner_take_cents) === l.ownerTakeCents && before.label === l.label) continue; // already exact
      const { error } = await admin
        .from("order_lines")
        .update({ talent_cost_cents: l.talentCostCents, owner_take_cents: l.ownerTakeCents, owner_share_snapshot: l.ownerShareSnapshot, label: l.label })
        .eq("id", l.id);
      if (error) return refuse(error);
      changed += 1;
    }
    return { ok: true, changed };
  } catch (err) {
    return refuse(err);
  }
}
