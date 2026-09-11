import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import type { Admin } from "./sale-rows";

export type SetTipResult =
  | { ok: true; orderId: string; tipCents: number; totalCents: number; version: number }
  | {
      ok: false;
      reason: "already_collected" | "negative" | "conflict" | "not_found" | "not_draft" | "wrong_tenant" | "unavailable" | "invalid";
    };

export async function setTip(
  admin: Admin,
  input: {
    tenantId: string;
    orderId: string;
    tipCents: number;
    operationKey: string;
    expectedVersion: number;
  },
): Promise<SetTipResult> {
  if (!Number.isInteger(input.tipCents) || input.tipCents < 0) return { ok: false, reason: "negative" };
  if (input.operationKey.trim().length < 8) return { ok: false, reason: "invalid" };
  if (typeof admin.rpc !== "function") return { ok: false, reason: "unavailable" };
  const { data, error } = await admin.rpc("pos_set_tip", {
    p_tenant_id: input.tenantId,
    p_order_id: input.orderId,
    p_tip_cents: input.tipCents,
    p_operation_key: input.operationKey.trim(),
    p_expected_version: input.expectedVersion,
  });
  if (error) {
    logServerError("pos.setTip", error);
    return { ok: false, reason: "unavailable" };
  }
  const reply = (data ?? {}) as {
    ok?: boolean;
    reason?: string;
    tip_cents?: number;
    total_cents?: number;
    version?: number;
    order_id?: string;
  };
  if (reply.ok === true) {
    return {
      ok: true,
      orderId: reply.order_id ?? input.orderId,
      tipCents: Number(reply.tip_cents) || 0,
      totalCents: Number(reply.total_cents) || 0,
      version: Number(reply.version) || input.expectedVersion + 1,
    };
  }
  const reason = reply.reason;
  if (
    reason === "already_collected" ||
    reason === "negative" ||
    reason === "conflict" ||
    reason === "not_found" ||
    reason === "not_draft" ||
    reason === "wrong_tenant"
  ) {
    return { ok: false, reason };
  }
  return { ok: false, reason: "unavailable" };
}
