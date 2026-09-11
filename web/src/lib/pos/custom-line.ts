import "server-only";

/**
 * Free-text amount lines. Written through `pos_mutate_draft_line` with
 * kind=custom. Collection refuses over_limit until an approval exists.
 */

import { logServerError } from "@/lib/server/safe-error";
import { lineTotalCents } from "@/lib/cart/totals";
import { LINE_COLUMNS, num, type Admin, type LineRow } from "./sale-rows";
import { readCustomAmountLimitCents } from "./approval-settings";

export type AddCustomLineResult =
  | { ok: true; orderId: string; lineId: string | null; needsApproval: boolean }
  | {
      ok: false;
      reason: "not_found" | "wrong_tenant" | "not_draft" | "invalid" | "conflict" | "unavailable";
    };

export type CustomLineApprovalState =
  | { ok: true; lockedLineIds: string[] }
  | { ok: false; reason: "unavailable" };

export async function addCustomLine(
  admin: Admin,
  input: {
    tenantId: string;
    orderId: string;
    label: string;
    amountCents: number;
    expectedVersion?: number;
    operatorUserId?: string | null;
  },
): Promise<AddCustomLineResult> {
  const label = input.label.trim();
  if (!label || !Number.isInteger(input.amountCents) || input.amountCents < 0) {
    return { ok: false, reason: "invalid" };
  }

  const { data: order, error } = await admin
    .from("orders")
    .select("id, tenant_id, status, version")
    .eq("id", input.orderId)
    .maybeSingle();
  if (error) {
    logServerError("pos.addCustomLine.load", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!order) return { ok: false, reason: "not_found" };
  const row = order as { tenant_id: string; status: string; version: number };
  if (row.tenant_id !== input.tenantId) return { ok: false, reason: "wrong_tenant" };
  if (row.status !== "draft") return { ok: false, reason: "not_draft" };
  const loadedVersion = Number(row.version) || 1;
  if (input.expectedVersion != null && input.expectedVersion !== loadedVersion) {
    return { ok: false, reason: "conflict" };
  }

  const { data: existing, error: linesError } = await admin
    .from("order_lines")
    .select("id")
    .eq("order_id", input.orderId);
  if (linesError) {
    logServerError("pos.addCustomLine.lines", linesError);
    return { ok: false, reason: "unavailable" };
  }

  const units = 1;
  const unitCents = input.amountCents;
  const totalCents = lineTotalCents({ unitCents, units });
  const expectedVersion = input.expectedVersion ?? loadedVersion;

  if (typeof admin.rpc === "function") {
    const { data, error: rpcError } = await admin.rpc("pos_mutate_draft_line", {
      p_tenant_id: input.tenantId,
      p_order_id: input.orderId,
      p_expected_version: expectedVersion,
      p_op: "add",
      p_line: {
        kind: "custom",
        label,
        units,
        unit_cents: unitCents,
        total_cents: totalCents,
        owner_tenant_id: input.tenantId,
        sort_order: (existing ?? []).length,
        operator_user_id: input.operatorUserId ?? null,
      },
    });
    if (rpcError) {
      logServerError("pos.addCustomLine.rpc", rpcError);
      return { ok: false, reason: "unavailable" };
    }
    const reply = (data ?? {}) as { ok?: boolean; reason?: string; line_id?: string };
    if (reply.ok !== true) {
      const reason =
        reply.reason === "conflict"
          ? "conflict"
          : reply.reason === "not_found"
            ? "not_found"
            : reply.reason === "wrong_tenant"
              ? "wrong_tenant"
              : reply.reason === "not_draft"
                ? "not_draft"
                : reply.reason === "invalid"
                  ? "invalid"
                  : "unavailable";
      return { ok: false, reason };
    }
    const limit = await readCustomAmountLimitCents(admin, input.tenantId);
    const needsApproval = limit.ok && unitCents > limit.limitCents;
    return { ok: true, orderId: input.orderId, lineId: reply.line_id ?? null, needsApproval };
  }

  const lineId = crypto.randomUUID();
  const { error: insErr } = await admin.from("order_lines").insert({
    id: lineId,
    order_id: input.orderId,
    tenant_id: input.tenantId,
    offering_id: null,
    kind: "custom",
    label,
    units,
    unit_cents: unitCents,
    total_cents: totalCents,
    owner_tenant_id: input.tenantId,
    talent_profile_id: null,
    talent_cost_cents: 0,
    sort_order: (existing ?? []).length,
    operator_user_id: input.operatorUserId ?? null,
  });
  if (insErr) {
    logServerError("pos.addCustomLine.insert", insErr);
    return { ok: false, reason: "unavailable" };
  }
  const limit = await readCustomAmountLimitCents(admin, input.tenantId);
  const needsApproval = limit.ok && unitCents > limit.limitCents;
  return { ok: true, orderId: input.orderId, lineId, needsApproval };
}

export async function lockedCustomLineIds(
  admin: Admin,
  input: { tenantId: string; orderId: string },
): Promise<CustomLineApprovalState> {
  const limit = await readCustomAmountLimitCents(admin, input.tenantId);
  if (!limit.ok) return limit;

  const { data: lines, error } = await admin
    .from("order_lines")
    .select(`${LINE_COLUMNS}, kind`)
    .eq("order_id", input.orderId);
  if (error) {
    logServerError("pos.lockedCustomLineIds.lines", error);
    return { ok: false, reason: "unavailable" };
  }

  const { data: approvals, error: apprErr } = await admin
    .from("pos_approvals")
    .select("line_id")
    .eq("order_id", input.orderId);
  if (apprErr) {
    logServerError("pos.lockedCustomLineIds.approvals", apprErr);
    return { ok: false, reason: "unavailable" };
  }
  const approved = new Set(((approvals ?? []) as Array<{ line_id: string }>).map((a) => a.line_id));

  const locked: string[] = [];
  for (const raw of (lines ?? []) as Array<LineRow & { kind?: string }>) {
    if (raw.kind !== "custom") continue;
    if (num(raw.unit_cents) <= limit.limitCents) continue;
    if (approved.has(raw.id)) continue;
    locked.push(raw.id);
  }
  return { ok: true, lockedLineIds: locked };
}
