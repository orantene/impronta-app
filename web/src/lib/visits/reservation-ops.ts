import "server-only";

/**
 * The host's two calls on a TABLE RESERVATION that is not going to be seated:
 * mark it a NO-SHOW, or CANCEL it (TUL-1757).
 *
 * A table reservation is an `admissions` row. Until now nothing wrote
 * `no_show_at` or voided one from the host stand, so a late party stayed
 * "arriving" forever and a cancelled one stayed on the book.
 *
 * THE GUARDED UPDATE IS THE ONLY SOURCE OF TRUTH. Both calls flip the row with
 * a conditional UPDATE that reads back the rows it changed. Only a call that
 * changed EXACTLY ONE row goes on to release the hold and, for a no-show, bump
 * the customer's counter: a double click or a second host who lost the race
 * gets `already: true` and writes nothing else. That is the TUL-1757 defect
 * (the booking path counted the client even when its update matched 0 rows).
 *
 * THE HOLD IS RELEASED THROUGH `release_capacity`, never by hand-editing
 * `capacity_allocations`: that function sets `state = 'released'` and
 * `released_at` together, which `capacity_allocations_released_stamp`
 * (`(state = 'released') = (released_at IS NOT NULL)`) requires. It is
 * idempotent, so a retry never double-frees.
 *
 * The counter moves through `increment_customer_no_shows` (atomic `no_shows + 1`,
 * migration 20261231424800, held in `_pending_pm`). A missing function or a
 * failed call is logged and never fails the no-show that is already saved.
 */

import { logServerError } from "@/lib/server/safe-error";

type Admin = {
  // Same injectable seam as the rest of `lib/visits`, so a test passes a fake.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: any }>;
};

export type ReservationOpReason =
  /** No admission with that id in this workspace (also: another workspace's). */
  | "reservation_not_found"
  /** Void or refunded already, or a no-show that cannot be cancelled. */
  | "reservation_not_valid"
  /** Somebody from the party was already admitted. */
  | "reservation_already_seated"
  /** The reservation time has not come yet, so it cannot be a no-show. */
  | "reservation_not_late"
  | "unavailable";

export type ReservationOpResult =
  | { ok: true; already?: true; customerId?: string | null }
  | { ok: false; reason: ReservationOpReason };

type Row = {
  id: string;
  tenant_id: string;
  status: string;
  starts_at: string | null;
  admitted_count: number | string | null;
  seated_at: string | null;
  completed_at: string | null;
  no_show_at: string | null;
  customer_id: string | null;
  allocation_id: string | null;
};

const COLUMNS = "id, tenant_id, status, starts_at, admitted_count, seated_at, completed_at, no_show_at, customer_id, allocation_id";

async function load(admin: Admin, tenantId: string, admissionId: string, where: string): Promise<{ ok: true; row: Row } | { ok: false; reason: ReservationOpReason }> {
  if (!tenantId || !admissionId) return { ok: false, reason: "reservation_not_found" };
  const { data, error } = await admin.from("admissions").select(COLUMNS).eq("id", admissionId).eq("tenant_id", tenantId).maybeSingle();
  if (error) {
    logServerError(`visits.reservationOps.${where}.load`, error);
    return { ok: false, reason: "unavailable" };
  }
  if (!data) return { ok: false, reason: "reservation_not_found" };
  const row = data as Row;
  // Belt and braces: the query is tenant-scoped already, a stub that ignores the filter must not leak.
  if (row.tenant_id !== tenantId) return { ok: false, reason: "reservation_not_found" };
  return { ok: true, row };
}

function arrived(row: Row): boolean {
  return Number(row.admitted_count ?? 0) > 0 || row.seated_at !== null || row.completed_at !== null;
}

async function releaseHold(admin: Admin, allocationId: string | null, where: string): Promise<void> {
  if (!allocationId) return;
  const { error } = await admin.rpc("release_capacity", { p_allocation_ids: [allocationId] });
  // The row is already saved; a hold that stays is reaped by its own TTL / the next release. Say so, do not fail.
  if (error) logServerError(`visits.reservationOps.${where}.release`, error);
}

/**
 * Mark a reservation that did not arrive. Allowed once the booked time has
 * passed (the server clock decides, never the caller). Terminal: it is the
 * positive human call `admissions.no_show_at` exists to record.
 */
export async function markReservationNoShow(
  admin: Admin,
  input: { tenantId: string; admissionId: string; now: Date },
): Promise<ReservationOpResult> {
  const loaded = await load(admin, input.tenantId, input.admissionId, "noShow");
  if (!loaded.ok) return loaded;
  const row = loaded.row;
  if (row.no_show_at !== null && row.status === "valid" && !arrived(row)) return { ok: true, already: true };
  if (row.status !== "valid") return { ok: false, reason: "reservation_not_valid" };
  if (arrived(row)) return { ok: false, reason: "reservation_already_seated" };
  const startsMs = row.starts_at ? Date.parse(row.starts_at) : Number.NaN;
  if (Number.isNaN(startsMs) || startsMs > input.now.getTime()) return { ok: false, reason: "reservation_not_late" };

  const { data: flipped, error } = await admin
    .from("admissions")
    .update({ no_show_at: input.now.toISOString() })
    .eq("id", row.id)
    .eq("tenant_id", input.tenantId)
    .eq("status", "valid")
    .eq("admitted_count", 0)
    .is("no_show_at", null)
    .is("seated_at", null)
    .is("completed_at", null)
    .select("id");
  if (error) {
    logServerError("visits.reservationOps.noShow.update", error);
    return { ok: false, reason: "unavailable" };
  }
  // Lost the race (double click, a second host): the other call did the work, count nothing twice.
  if (!Array.isArray(flipped) || flipped.length !== 1) return { ok: true, already: true };

  await releaseHold(admin, row.allocation_id, "noShow");

  if (row.customer_id) {
    const { error: custError } = await admin.rpc("increment_customer_no_shows", { p_customer_id: row.customer_id });
    if (custError) logServerError("visits.reservationOps.noShow.customer", custError);
  }
  return { ok: true, customerId: row.customer_id };
}

/**
 * Cancel a reservation: `status = 'void'` (a commercial fact, kept apart from
 * arrival), and its hold goes back to the room. Refused once anybody has been
 * admitted. A deposit already paid is NOT refunded here: money moves through
 * Orders, by a manager.
 */
export async function cancelReservation(
  admin: Admin,
  input: { tenantId: string; admissionId: string },
): Promise<ReservationOpResult> {
  const loaded = await load(admin, input.tenantId, input.admissionId, "cancel");
  if (!loaded.ok) return loaded;
  const row = loaded.row;
  if (row.status === "void") return { ok: true, already: true };
  if (row.status !== "valid") return { ok: false, reason: "reservation_not_valid" };
  if (arrived(row)) return { ok: false, reason: "reservation_already_seated" };

  const { data: flipped, error } = await admin
    .from("admissions")
    .update({ status: "void" })
    .eq("id", row.id)
    .eq("tenant_id", input.tenantId)
    .eq("status", "valid")
    .eq("admitted_count", 0)
    .is("seated_at", null)
    .is("completed_at", null)
    .select("id");
  if (error) {
    logServerError("visits.reservationOps.cancel.update", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!Array.isArray(flipped) || flipped.length !== 1) return { ok: true, already: true };

  await releaseHold(admin, row.allocation_id, "cancel");
  return { ok: true };
}
