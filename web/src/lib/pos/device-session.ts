import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import type { Admin } from "./sale-rows";

export type DeviceSessionView = {
  sessionId: string;
  operatorUserId: string | null;
  shiftId: string | null;
  lockedAt: string | null;
};

export type DeviceSessionResult =
  | { ok: true; session: DeviceSessionView }
  | { ok: false; reason: "pin_invalid" | "locked" | "no_session" | "conflict" | "not_found" | "unavailable" | "invalid" };

function mapReply(reply: {
  ok?: boolean;
  reason?: string;
  session_id?: string;
  operator_user_id?: string;
  shift_id?: string;
  locked_at?: string;
}): DeviceSessionResult {
  if (reply.ok === true && reply.session_id) {
    return {
      ok: true,
      session: {
        sessionId: reply.session_id,
        operatorUserId: reply.operator_user_id ?? null,
        shiftId: reply.shift_id ?? null,
        lockedAt: reply.locked_at ?? null,
      },
    };
  }
  const reason = reply.reason;
  if (
    reason === "pin_invalid" ||
    reason === "locked" ||
    reason === "no_session" ||
    reason === "conflict" ||
    reason === "not_found"
  ) {
    return { ok: false, reason };
  }
  return { ok: false, reason: "unavailable" };
}

export async function lockTill(
  admin: Admin,
  input: { tenantId: string; deviceKey: string },
): Promise<DeviceSessionResult> {
  if (input.deviceKey.trim().length < 8) return { ok: false, reason: "invalid" };
  if (typeof admin.rpc !== "function") return { ok: false, reason: "unavailable" };
  const { data, error } = await admin.rpc("pos_lock_till", {
    p_tenant_id: input.tenantId,
    p_device_key: input.deviceKey.trim(),
  });
  if (error) {
    logServerError("pos.lockTill", error);
    return { ok: false, reason: "unavailable" };
  }
  return mapReply((data ?? {}) as Parameters<typeof mapReply>[0]);
}

export async function unlockTill(
  admin: Admin,
  input: { tenantId: string; deviceKey: string; userId: string; pin: string },
): Promise<DeviceSessionResult> {
  if (input.deviceKey.trim().length < 8) return { ok: false, reason: "invalid" };
  if (!/^[0-9]{4,6}$/.test(input.pin)) return { ok: false, reason: "pin_invalid" };
  if (typeof admin.rpc !== "function") return { ok: false, reason: "unavailable" };
  const { data, error } = await admin.rpc("pos_unlock_till", {
    p_tenant_id: input.tenantId,
    p_device_key: input.deviceKey.trim(),
    p_user_id: input.userId,
    p_pin: input.pin,
  });
  if (error) {
    logServerError("pos.unlockTill", error);
    return { ok: false, reason: "unavailable" };
  }
  return mapReply((data ?? {}) as Parameters<typeof mapReply>[0]);
}

export async function switchOperator(
  admin: Admin,
  input: { tenantId: string; deviceKey: string; userId: string; pin: string },
): Promise<DeviceSessionResult> {
  if (input.deviceKey.trim().length < 8) return { ok: false, reason: "invalid" };
  if (!/^[0-9]{4,6}$/.test(input.pin)) return { ok: false, reason: "pin_invalid" };
  if (typeof admin.rpc !== "function") return { ok: false, reason: "unavailable" };
  const { data, error } = await admin.rpc("pos_switch_operator", {
    p_tenant_id: input.tenantId,
    p_device_key: input.deviceKey.trim(),
    p_user_id: input.userId,
    p_pin: input.pin,
  });
  if (error) {
    logServerError("pos.switchOperator", error);
    return { ok: false, reason: "unavailable" };
  }
  return mapReply((data ?? {}) as Parameters<typeof mapReply>[0]);
}

export async function readDeviceSession(
  admin: Admin,
  input: { tenantId: string; deviceKey: string },
): Promise<DeviceSessionResult> {
  const { data, error } = await admin
    .from("pos_device_sessions")
    .select("id, operator_user_id, shift_id, locked_at")
    .eq("tenant_id", input.tenantId)
    .eq("device_key", input.deviceKey.trim())
    .maybeSingle();
  if (error) {
    logServerError("pos.readDeviceSession", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!data) return { ok: false, reason: "no_session" };
  const row = data as { id: string; operator_user_id: string | null; shift_id: string | null; locked_at: string | null };
  return {
    ok: true,
    session: {
      sessionId: row.id,
      operatorUserId: row.operator_user_id,
      shiftId: row.shift_id,
      lockedAt: row.locked_at,
    },
  };
}
