import "server-only";

/**
 * Manager PIN approval for a locked custom-amount line.
 */

import { logServerError } from "@/lib/server/safe-error";
import type { Admin } from "./sale-rows";

export type ApproveCustomAmountResult =
  | { ok: true; approvalId: string; already?: boolean }
  | {
      ok: false;
      reason:
        | "over_limit"
        | "pin_invalid"
        | "not_manager"
        | "already_approved"
        | "conflict"
        | "not_found"
        | "wrong_tenant"
        | "invalid"
        | "unavailable";
    };

export async function approveCustomAmount(
  admin: Admin,
  input: {
    tenantId: string;
    orderId: string;
    lineId: string;
    operationKey: string;
    approverUserId: string;
    pin: string;
    method?: "pin" | "session";
  },
): Promise<ApproveCustomAmountResult> {
  const key = input.operationKey.trim();
  if (key.length < 8) return { ok: false, reason: "invalid" };
  if (!/^[0-9]{4,6}$/.test(input.pin)) return { ok: false, reason: "pin_invalid" };
  if (typeof admin.rpc !== "function") return { ok: false, reason: "unavailable" };

  const { data, error } = await admin.rpc("pos_approve_custom_amount", {
    p_tenant_id: input.tenantId,
    p_order_id: input.orderId,
    p_line_id: input.lineId,
    p_operation_key: key,
    p_approver: input.approverUserId,
    p_pin: input.pin,
    p_method: input.method ?? "pin",
  });
  if (error) {
    logServerError("pos.approveCustomAmount", error);
    return { ok: false, reason: "unavailable" };
  }
  const reply = (data ?? {}) as { ok?: boolean; reason?: string; approval_id?: string; already?: boolean };
  if (reply.ok === true && reply.approval_id) {
    return { ok: true, approvalId: reply.approval_id, already: reply.already === true };
  }
  const reason = reply.reason;
  if (
    reason === "pin_invalid" ||
    reason === "not_manager" ||
    reason === "already_approved" ||
    reason === "conflict" ||
    reason === "not_found" ||
    reason === "wrong_tenant" ||
    reason === "invalid"
  ) {
    return { ok: false, reason };
  }
  return { ok: false, reason: "unavailable" };
}

export async function setStaffPin(
  admin: Admin,
  input: { tenantId: string; actorUserId: string; userId: string; pin: string },
): Promise<{ ok: true } | { ok: false; reason: "not_manager" | "invalid" | "not_found" | "unavailable" }> {
  if (!/^[0-9]{4,6}$/.test(input.pin)) return { ok: false, reason: "invalid" };
  if (typeof admin.rpc !== "function") return { ok: false, reason: "unavailable" };
  const { data, error } = await admin.rpc("pos_set_staff_pin", {
    p_tenant_id: input.tenantId,
    p_actor_id: input.actorUserId,
    p_user_id: input.userId,
    p_pin: input.pin,
  });
  if (error) {
    logServerError("pos.setStaffPin", error);
    return { ok: false, reason: "unavailable" };
  }
  const reply = (data ?? {}) as { ok?: boolean; reason?: string };
  if (reply.ok === true) return { ok: true };
  if (reply.reason === "not_manager" || reply.reason === "invalid" || reply.reason === "not_found") {
    return { ok: false, reason: reply.reason };
  }
  return { ok: false, reason: "unavailable" };
}

export async function setCustomAmountLimit(
  admin: Admin,
  input: { tenantId: string; actorUserId: string; limitCents: number },
): Promise<{ ok: true; limitCents: number } | { ok: false; reason: "not_manager" | "invalid" | "not_found" | "unavailable" }> {
  if (!Number.isInteger(input.limitCents) || input.limitCents < 0) return { ok: false, reason: "invalid" };
  if (typeof admin.rpc !== "function") return { ok: false, reason: "unavailable" };
  const { data, error } = await admin.rpc("pos_set_custom_amount_limit", {
    p_tenant_id: input.tenantId,
    p_actor_id: input.actorUserId,
    p_limit_cents: input.limitCents,
  });
  if (error) {
    logServerError("pos.setCustomAmountLimit", error);
    return { ok: false, reason: "unavailable" };
  }
  const reply = (data ?? {}) as { ok?: boolean; reason?: string; limit_cents?: number };
  if (reply.ok === true) return { ok: true, limitCents: Number(reply.limit_cents) || input.limitCents };
  if (reply.reason === "not_manager" || reply.reason === "not_found") {
    return { ok: false, reason: reply.reason };
  }
  return { ok: false, reason: "unavailable" };
}
