import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import type { Admin } from "./sale-rows";

export type ShiftMovementKind = "paid_in" | "paid_out" | "drop" | "float_add";

export type ShiftMovementRow = {
  id: string;
  kind: ShiftMovementKind;
  amountCents: number;
  reason: string;
  byUserId: string | null;
  createdAt: string;
};

export function expectedCashFromRows(input: {
  openingCashCents: number;
  cashSalesCents: number;
  movements: ReadonlyArray<{ kind: ShiftMovementKind; amountCents: number }>;
}): number {
  let paidIn = 0;
  let paidOut = 0;
  let drops = 0;
  let floatAdd = 0;
  for (const m of input.movements) {
    const amount = Number.isFinite(m.amountCents) ? Math.max(0, Math.trunc(m.amountCents)) : 0;
    if (m.kind === "paid_in") paidIn += amount;
    else if (m.kind === "paid_out") paidOut += amount;
    else if (m.kind === "drop") drops += amount;
    else if (m.kind === "float_add") floatAdd += amount;
  }
  return input.openingCashCents + input.cashSalesCents + paidIn + floatAdd - paidOut - drops;
}

export async function recordShiftMovement(
  admin: Admin,
  input: {
    tenantId: string;
    actorUserId: string;
    kind: ShiftMovementKind;
    amountCents: number;
    reason: string;
    shiftId?: string | null;
  },
): Promise<
  | { ok: true; movementId: string; shiftId: string }
  | { ok: false; reason: "amount" | "not_found" | "already_closed" | "wrong_tenant" | "unavailable" | "invalid" }
> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) return { ok: false, reason: "amount" };
  if (input.reason.trim().length < 1) return { ok: false, reason: "invalid" };
  if (typeof admin.rpc !== "function") return { ok: false, reason: "unavailable" };
  const { data, error } = await admin.rpc("pos_record_shift_movement", {
    p_tenant_id: input.tenantId,
    p_shift_id: input.shiftId ?? null,
    p_kind: input.kind,
    p_amount_cents: input.amountCents,
    p_reason: input.reason.trim(),
    p_by_user_id: input.actorUserId,
  });
  if (error) {
    logServerError("pos.recordShiftMovement", error);
    return { ok: false, reason: "unavailable" };
  }
  const reply = (data ?? {}) as { ok?: boolean; reason?: string; movement_id?: string; shift_id?: string };
  if (reply.ok === true && reply.movement_id && reply.shift_id) {
    return { ok: true, movementId: reply.movement_id, shiftId: reply.shift_id };
  }
  const reason = reply.reason;
  if (reason === "amount" || reason === "not_found" || reason === "already_closed" || reason === "wrong_tenant") {
    return { ok: false, reason };
  }
  return { ok: false, reason: "unavailable" };
}

export async function listShiftMovements(
  admin: Admin,
  input: { tenantId: string; shiftId: string },
): Promise<{ ok: true; movements: ShiftMovementRow[] } | { ok: false; reason: "unavailable" }> {
  const { data, error } = await admin
    .from("pos_shift_movements")
    .select("id, kind, amount_cents, reason, by_user_id, created_at")
    .eq("tenant_id", input.tenantId)
    .eq("shift_id", input.shiftId)
    .order("created_at", { ascending: true });
  if (error) {
    logServerError("pos.listShiftMovements", error);
    return { ok: false, reason: "unavailable" };
  }
  return {
    ok: true,
    movements: ((data ?? []) as Array<{
      id: string;
      kind: ShiftMovementKind;
      amount_cents: number;
      reason: string;
      by_user_id: string | null;
      created_at: string;
    }>).map((row) => ({
      id: row.id,
      kind: row.kind,
      amountCents: Number(row.amount_cents) || 0,
      reason: row.reason,
      byUserId: row.by_user_id,
      createdAt: row.created_at,
    })),
  };
}
