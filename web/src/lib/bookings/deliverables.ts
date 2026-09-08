/**
 * P7-01 — deliverables on an existing booking.
 *
 * Approvals and revision rounds live here. Money does not. A passthrough
 * budget (advertising funds) is a distinct kind so it cannot be invoiced as a
 * service fee by accident.
 */

import { logServerError } from "@/lib/server/safe-error";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type DeliverableKind = "service" | "passthrough_budget";
export type DeliverableStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "revision_requested"
  | "cancelled";

export type DeliverableRow = {
  id: string;
  tenantId: string;
  bookingId: string;
  title: string;
  kind: DeliverableKind;
  status: DeliverableStatus;
  revision: number;
  revisionLimit: number;
  dueAt: string | null;
};

function mapRow(row: {
  id: string;
  tenant_id: string;
  booking_id: string;
  title: string;
  kind: string;
  status: string;
  revision: number;
  revision_limit: number;
  due_at: string | null;
}): DeliverableRow {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    bookingId: row.booking_id,
    title: row.title,
    kind: row.kind === "passthrough_budget" ? "passthrough_budget" : "service",
    status: row.status as DeliverableStatus,
    revision: Number(row.revision) || 0,
    revisionLimit: Number(row.revision_limit) || 0,
    dueAt: row.due_at,
  };
}

export async function createDeliverable(
  admin: Admin,
  input: {
    tenantId: string;
    bookingId: string;
    title: string;
    kind?: DeliverableKind;
    revisionLimit?: number;
    dueAt?: string | null;
  },
): Promise<{ ok: true; deliverable: DeliverableRow } | { ok: false; reason: "invalid" | "unavailable"; error: string }> {
  const title = input.title.trim();
  if (!title || !input.bookingId || !input.tenantId) {
    return { ok: false, reason: "invalid", error: "Missing deliverable." };
  }
  const limit = input.revisionLimit ?? 1;
  if (!Number.isInteger(limit) || limit < 0) {
    return { ok: false, reason: "invalid", error: "Revision limit must be zero or more." };
  }
  const { data, error } = await admin
    .from("booking_deliverables")
    .insert({
      tenant_id: input.tenantId,
      booking_id: input.bookingId,
      title,
      kind: input.kind ?? "service",
      status: "draft",
      revision: 0,
      revision_limit: limit,
      due_at: input.dueAt ?? null,
    })
    .select("id, tenant_id, booking_id, title, kind, status, revision, revision_limit, due_at")
    .single();
  if (error || !data) {
    logServerError("bookings.createDeliverable", error);
    return { ok: false, reason: "unavailable", error: "Could not add the deliverable." };
  }
  return { ok: true, deliverable: mapRow(data) };
}

export async function submitDeliverable(
  admin: Admin,
  input: { tenantId: string; deliverableId: string },
): Promise<{ ok: true; deliverable: DeliverableRow } | { ok: false; reason: "not_found" | "unavailable"; error: string }> {
  return transition(admin, input, ["draft", "revision_requested"], "submitted");
}

export async function approveDeliverable(
  admin: Admin,
  input: { tenantId: string; deliverableId: string },
): Promise<{ ok: true; deliverable: DeliverableRow } | { ok: false; reason: "not_found" | "unavailable"; error: string }> {
  return transition(admin, input, ["submitted"], "approved");
}

export async function requestRevision(
  admin: Admin,
  input: { tenantId: string; deliverableId: string },
): Promise<
  | { ok: true; deliverable: DeliverableRow }
  | { ok: false; reason: "not_found" | "limit_reached" | "unavailable"; error: string }
> {
  const loaded = await load(admin, input);
  if (!loaded.ok) return loaded;
  const row = loaded.row;
  if (row.status !== "submitted") {
    return { ok: false, reason: "not_found", error: "That deliverable is not waiting on a revision." };
  }
  if (row.revision >= row.revisionLimit) {
    return {
      ok: false,
      reason: "limit_reached",
      error: "Further revisions are chargeable.",
    };
  }
  const now = new Date().toISOString();
  const { error } = await admin
    .from("booking_deliverables")
    .update({
      status: "revision_requested",
      revision: row.revision + 1,
      updated_at: now,
    })
    .eq("id", row.id)
    .eq("tenant_id", input.tenantId)
    .eq("status", "submitted");
  if (error) {
    logServerError("bookings.requestRevision", error);
    return { ok: false, reason: "unavailable", error: "Could not request a revision." };
  }
  return {
    ok: true,
    deliverable: { ...row, status: "revision_requested", revision: row.revision + 1 },
  };
}

async function load(
  admin: Admin,
  input: { tenantId: string; deliverableId: string },
): Promise<{ ok: true; row: DeliverableRow } | { ok: false; reason: "not_found" | "unavailable"; error: string }> {
  const { data, error } = await admin
    .from("booking_deliverables")
    .select("id, tenant_id, booking_id, title, kind, status, revision, revision_limit, due_at")
    .eq("id", input.deliverableId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (error) {
    logServerError("bookings.deliverable.load", error);
    return { ok: false, reason: "unavailable", error: "Could not load the deliverable." };
  }
  if (!data) return { ok: false, reason: "not_found", error: "That deliverable is gone." };
  return { ok: true, row: mapRow(data) };
}

async function transition(
  admin: Admin,
  input: { tenantId: string; deliverableId: string },
  from: DeliverableStatus[],
  to: DeliverableStatus,
): Promise<{ ok: true; deliverable: DeliverableRow } | { ok: false; reason: "not_found" | "unavailable"; error: string }> {
  const loaded = await load(admin, input);
  if (!loaded.ok) return loaded;
  if (!from.includes(loaded.row.status)) {
    return { ok: false, reason: "not_found", error: "That deliverable cannot move that way." };
  }
  const { error } = await admin
    .from("booking_deliverables")
    .update({ status: to, updated_at: new Date().toISOString() })
    .eq("id", loaded.row.id)
    .eq("tenant_id", input.tenantId)
    .eq("status", loaded.row.status);
  if (error) {
    logServerError("bookings.deliverable.transition", error);
    return { ok: false, reason: "unavailable", error: "Could not update the deliverable." };
  }
  return { ok: true, deliverable: { ...loaded.row, status: to } };
}
