import "server-only";

import { logServerError } from "@/lib/server/safe-error";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc?: (fn: string, args: Record<string, unknown>) => any;
};

export type ApprovalReason = "over_limit" | "already_decided" | "not_manager" | "conflict" | "not_found" | "invalid" | "unavailable";

export async function roleLimitCents(
  admin: Admin,
  input: { tenantId: string; role: string; action: "discount" | "refund" },
): Promise<{ ok: true; limitCents: number | null } | { ok: false; reason: "unavailable" }> {
  const { data, error } = await admin
    .from("role_limits")
    .select("limit_cents")
    .eq("tenant_id", input.tenantId)
    .eq("role", input.role)
    .eq("action", input.action)
    .maybeSingle();
  if (error) {
    logServerError("approvals.roleLimitCents", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!data) return { ok: true, limitCents: null };
  return { ok: true, limitCents: Number((data as { limit_cents: number }).limit_cents) };
}

export async function assertRoleLimit(
  admin: Admin,
  input: { tenantId: string; role: string; action: "discount" | "refund"; amountCents: number },
): Promise<{ ok: true } | { ok: false; reason: "over_limit" | "unavailable" }> {
  const loaded = await roleLimitCents(admin, input);
  if (!loaded.ok) return loaded;
  if (loaded.limitCents == null) return { ok: true };
  if (input.amountCents > loaded.limitCents) return { ok: false, reason: "over_limit" };
  return { ok: true };
}

export async function requestApproval(
  admin: Admin,
  input: {
    tenantId: string;
    kind: "discount" | "refund";
    subjectId: string;
    requestedBy: string;
    operationKey: string;
    reason: string;
  },
): Promise<{ ok: true; requestId: string; already?: boolean } | { ok: false; reason: ApprovalReason }> {
  if (input.operationKey.trim().length < 8) return { ok: false, reason: "invalid" };
  if (typeof admin.rpc !== "function") return { ok: false, reason: "unavailable" };
  const { data, error } = await admin.rpc("request_approval", {
    p_tenant_id: input.tenantId,
    p_kind: input.kind,
    p_subject_id: input.subjectId,
    p_requested_by: input.requestedBy,
    p_operation_key: input.operationKey.trim(),
    p_reason: input.reason,
  });
  if (error) {
    logServerError("approvals.requestApproval", error);
    return { ok: false, reason: "unavailable" };
  }
  const reply = (data ?? {}) as { ok?: boolean; reason?: string; request_id?: string; already?: boolean };
  if (reply.ok === true) return { ok: true, requestId: reply.request_id ?? "", already: reply.already === true };
  return { ok: false, reason: "unavailable" };
}

export async function decideApproval(
  admin: Admin,
  input: { tenantId: string; requestId: string; decidedBy: string; decision: "approved" | "denied"; reason: string },
): Promise<{ ok: true; requestId: string; decision: "approved" | "denied" } | { ok: false; reason: ApprovalReason }> {
  if (typeof admin.rpc !== "function") return { ok: false, reason: "unavailable" };
  const { data, error } = await admin.rpc("decide_approval", {
    p_tenant_id: input.tenantId,
    p_request_id: input.requestId,
    p_decided_by: input.decidedBy,
    p_decision: input.decision,
    p_reason: input.reason,
  });
  if (error) {
    logServerError("approvals.decideApproval", error);
    return { ok: false, reason: "unavailable" };
  }
  const reply = (data ?? {}) as { ok?: boolean; reason?: string; request_id?: string; decision?: "approved" | "denied" };
  if (reply.ok === true) return { ok: true, requestId: reply.request_id ?? input.requestId, decision: reply.decision ?? input.decision };
  const reason = reply.reason;
  if (reason === "already_decided" || reason === "not_manager" || reason === "conflict" || reason === "not_found" || reason === "invalid") {
    return { ok: false, reason };
  }
  return { ok: false, reason: "unavailable" };
}
