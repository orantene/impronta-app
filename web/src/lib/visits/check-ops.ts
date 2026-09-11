import "server-only";

import { logServerError } from "@/lib/server/safe-error";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc?: (fn: string, args: Record<string, unknown>) => any;
};

export type VisitOpRefusal =
  | "not_open"
  | "space_occupied"
  | "lines_paid"
  | "wrong_tenant"
  | "conflict"
  | "not_found"
  | "unavailable"
  | "invalid";

function mapReason(reason: string | undefined): VisitOpRefusal {
  if (
    reason === "not_open" ||
    reason === "space_occupied" ||
    reason === "lines_paid" ||
    reason === "wrong_tenant" ||
    reason === "conflict" ||
    reason === "not_found"
  ) {
    return reason;
  }
  return "unavailable";
}

async function call(
  admin: Admin,
  fn: string,
  args: Record<string, unknown>,
): Promise<{ ok: true; payload: Record<string, unknown> } | { ok: false; reason: VisitOpRefusal }> {
  if (typeof admin.rpc !== "function") return { ok: false, reason: "unavailable" };
  const { data, error } = await admin.rpc(fn, args);
  if (error) {
    logServerError(`visits.${fn}`, error);
    return { ok: false, reason: "unavailable" };
  }
  const reply = (data ?? {}) as Record<string, unknown>;
  if (reply.ok === true) return { ok: true, payload: reply };
  return { ok: false, reason: mapReason(typeof reply.reason === "string" ? reply.reason : undefined) };
}

export async function visitTransfer(
  admin: Admin,
  input: { tenantId: string; visitId: string; toSpaceId: string; operationKey: string },
) {
  if (input.operationKey.trim().length < 8) return { ok: false as const, reason: "invalid" as const };
  const r = await call(admin, "visit_transfer", {
    p_tenant_id: input.tenantId,
    p_visit_id: input.visitId,
    p_to_space: input.toSpaceId,
    p_operation_key: input.operationKey.trim(),
  });
  if (!r.ok) return r;
  return { ok: true as const, visitId: String(r.payload.visit_id ?? input.visitId), spaceId: String(r.payload.space_id ?? input.toSpaceId) };
}

export async function visitSplitCheck(
  admin: Admin,
  input: { tenantId: string; visitId: string; lineIds: string[]; operationKey: string },
) {
  if (input.operationKey.trim().length < 8 || input.lineIds.length === 0) {
    return { ok: false as const, reason: "invalid" as const };
  }
  const r = await call(admin, "visit_split_check", {
    p_tenant_id: input.tenantId,
    p_visit_id: input.visitId,
    p_line_ids: input.lineIds,
    p_operation_key: input.operationKey.trim(),
  });
  if (!r.ok) return r;
  return { ok: true as const, orderId: String(r.payload.order_id ?? "") };
}

export async function visitMergeChecks(
  admin: Admin,
  input: { tenantId: string; fromVisitId: string; intoVisitId: string; operationKey: string },
) {
  if (input.operationKey.trim().length < 8) return { ok: false as const, reason: "invalid" as const };
  const r = await call(admin, "visit_merge_checks", {
    p_tenant_id: input.tenantId,
    p_from_visit: input.fromVisitId,
    p_into_visit: input.intoVisitId,
    p_operation_key: input.operationKey.trim(),
  });
  if (!r.ok) return r;
  return { ok: true as const, orderId: String(r.payload.order_id ?? "") };
}

export async function visitChangeServer(
  admin: Admin,
  input: { tenantId: string; visitId: string; userId: string },
) {
  const r = await call(admin, "visit_change_server", {
    p_tenant_id: input.tenantId,
    p_visit_id: input.visitId,
    p_user_id: input.userId,
  });
  if (!r.ok) return r;
  return { ok: true as const, visitId: input.visitId };
}
