import "server-only";

import { logServerError } from "@/lib/server/safe-error";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from?: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc?: (fn: string, args: Record<string, unknown>) => any;
};

export type ProjectOpsReason =
  | "talent_unavailable"
  | "already_started"
  | "not_draft"
  | "not_archivable"
  | "not_reopenable"
  | "conflict"
  | "not_found"
  | "wrong_tenant"
  | "invalid"
  | "unavailable";

function mapReason(raw: string | undefined, allowed: ProjectOpsReason[]): ProjectOpsReason {
  if (raw && (allowed as string[]).includes(raw)) return raw as ProjectOpsReason;
  return "unavailable";
}

export async function projectReplaceTalent(
  admin: Admin,
  input: { tenantId: string; bookingId: string; fromTalentId: string; toTalentId: string; operationKey: string },
): Promise<{ ok: true; bookingId: string } | { ok: false; reason: ProjectOpsReason }> {
  if (input.operationKey.trim().length < 8) return { ok: false, reason: "invalid" };
  if (typeof admin.rpc !== "function") return { ok: false, reason: "unavailable" };
  const { data, error } = await admin.rpc("project_replace_talent", {
    p_tenant_id: input.tenantId,
    p_booking_id: input.bookingId,
    p_from_talent: input.fromTalentId,
    p_to_talent: input.toTalentId,
    p_operation_key: input.operationKey.trim(),
  });
  if (error) {
    logServerError("projects.projectReplaceTalent", error);
    return { ok: false, reason: "unavailable" };
  }
  const reply = (data ?? {}) as { ok?: boolean; reason?: string; booking_id?: string };
  if (reply.ok === true) return { ok: true, bookingId: reply.booking_id ?? input.bookingId };
  return {
    ok: false,
    reason: mapReason(reply.reason, ["talent_unavailable", "already_started", "not_found", "invalid"]),
  };
}

export async function amendmentDiscard(
  admin: Admin,
  input: { tenantId: string; offerId: string; expectedVersion: number; inquiryExpectedVersion: number },
): Promise<{ ok: true; offerId: string } | { ok: false; reason: ProjectOpsReason }> {
  if (typeof admin.rpc !== "function") return { ok: false, reason: "unavailable" };
  const { data, error } = await admin.rpc("amendment_discard", {
    p_tenant_id: input.tenantId,
    p_offer_id: input.offerId,
    p_expected_version: input.expectedVersion,
    p_inquiry_expected_version: input.inquiryExpectedVersion,
  });
  if (error) {
    logServerError("projects.amendmentDiscard", error);
    return { ok: false, reason: "unavailable" };
  }
  const reply = (data ?? {}) as { ok?: boolean; reason?: string; offer_id?: string };
  if (reply.ok === true) return { ok: true, offerId: reply.offer_id ?? input.offerId };
  return { ok: false, reason: mapReason(reply.reason, ["not_draft", "conflict", "not_found", "wrong_tenant", "invalid"]) };
}

export async function projectArchive(
  admin: Admin,
  input: { tenantId: string; bookingId: string; reason: string },
): Promise<{ ok: true; bookingId: string; already?: boolean } | { ok: false; reason: ProjectOpsReason }> {
  if (typeof admin.rpc !== "function") return { ok: false, reason: "unavailable" };
  const { data, error } = await admin.rpc("project_archive", {
    p_tenant_id: input.tenantId,
    p_booking_id: input.bookingId,
    p_reason: input.reason,
  });
  if (error) {
    logServerError("projects.projectArchive", error);
    return { ok: false, reason: "unavailable" };
  }
  const reply = (data ?? {}) as { ok?: boolean; reason?: string; already?: boolean; booking_id?: string };
  if (reply.ok === true) return { ok: true, bookingId: reply.booking_id ?? input.bookingId, already: reply.already === true };
  return { ok: false, reason: mapReason(reply.reason, ["not_archivable", "conflict", "not_found"]) };
}

export async function projectReopen(
  admin: Admin,
  input: { tenantId: string; bookingId: string; reason: string },
): Promise<{ ok: true; bookingId: string } | { ok: false; reason: ProjectOpsReason }> {
  if (typeof admin.rpc !== "function") return { ok: false, reason: "unavailable" };
  const { data, error } = await admin.rpc("project_reopen", {
    p_tenant_id: input.tenantId,
    p_booking_id: input.bookingId,
    p_reason: input.reason,
  });
  if (error) {
    logServerError("projects.projectReopen", error);
    return { ok: false, reason: "unavailable" };
  }
  const reply = (data ?? {}) as { ok?: boolean; reason?: string; booking_id?: string };
  if (reply.ok === true) return { ok: true, bookingId: reply.booking_id ?? input.bookingId };
  return { ok: false, reason: mapReason(reply.reason, ["not_reopenable", "conflict", "not_found"]) };
}

export async function setDeliverableAmount(
  admin: Admin,
  input: { tenantId: string; deliverableId: string; amountCents: number },
): Promise<{ ok: true } | { ok: false; reason: ProjectOpsReason }> {
  if (!Number.isInteger(input.amountCents) || input.amountCents < 0) return { ok: false, reason: "invalid" };
  if (typeof admin.from !== "function") return { ok: false, reason: "unavailable" };
  const { error } = await admin
    .from("booking_deliverables")
    .update({ amount_cents: input.amountCents })
    .eq("id", input.deliverableId)
    .eq("tenant_id", input.tenantId);
  if (error) {
    logServerError("projects.setDeliverableAmount", error);
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true };
}

export async function attachDeliverableFile(
  admin: Admin,
  input: { tenantId: string; deliverableId: string; filePath: string },
): Promise<{ ok: true } | { ok: false; reason: ProjectOpsReason }> {
  const path = input.filePath.trim();
  if (!path || path.includes("..") || path.startsWith("http")) return { ok: false, reason: "invalid" };
  if (typeof admin.from !== "function") return { ok: false, reason: "unavailable" };
  const { error } = await admin
    .from("booking_deliverables")
    .update({ file_path: path })
    .eq("id", input.deliverableId)
    .eq("tenant_id", input.tenantId);
  if (error) {
    logServerError("projects.attachDeliverableFile", error);
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true };
}
