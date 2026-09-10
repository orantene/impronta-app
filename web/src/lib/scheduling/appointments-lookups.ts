/**
 * appointments-lookups.ts — the id-to-name joins the Appointments surface needs.
 *
 * SPLIT OUT OF `appointments-actions.ts`, WHICH IS A `"use server"` MODULE.
 * Two reasons, and the second is the one that matters:
 *
 *   1. Every export of a Server Actions file must be an async function that is
 *      safe to call from a browser. These are not actions — they are joins that
 *      run INSIDE one, after the caller has already proved it is staff of the
 *      tenant — and keeping them there meant either exporting a callable that
 *      nobody should call, or leaving them unexported and unreachable to any
 *      other surface that needs the same name.
 *   2. `appointments-actions.ts` was over eslint's 800-line cap with them in it.
 *      Extraction, not a suppression: the file that exists is the one a reader
 *      opens to see what the surface can DO, and three hundred lines of
 *      PostgREST plumbing in front of that is the whole cost the cap is naming.
 *
 * EVERY ONE OF THESE DEGRADES RATHER THAN REFUSING, and that is deliberate but
 * not universal: a failure to read who is serving leaves the column blank,
 * which is visible; a failure to read a room's name falls back to the refusal
 * sentence that names no room, which is honest. Neither is worth blanking a
 * whole board over. The reads whose failure would make the screen LIE stay in
 * the actions file and refuse there.
 *
 * TENANT SCOPE IS IN EVERY QUERY. These run under the service role, so RLS does
 * not apply; the caller has proved staff membership, and each query below still
 * filters on that tenant id. One predicate alone lets a staff member of
 * workspace A read workspace B by passing its id.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

type Admin = Pick<SupabaseClient, "from" | "rpc">;

/**
 * The professionals serving each inquiry's booking, by inquiry id.
 *
 * A failure here is logged and returns an empty map rather than refusing the
 * whole board: a list that will not load at all is worse than one whose "with"
 * column is blank, and the blank is visible.
 */
export async function servingNamesByInquiry(
  admin: Admin,
  tenantId: string,
  inquiryIds: readonly string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const ids = [...new Set(inquiryIds)];
  if (ids.length === 0) return out;

  const { data, error } = await admin
    .from("talent_bookings")
    .select("inquiry_id, talent_profile_id")
    .eq("tenant_id", tenantId)
    .neq("status", "cancelled")
    .in("inquiry_id", ids);
  if (error) {
    logServerError("scheduling.loadAppointments/mirrors", error);
    return out;
  }
  const mirrors = (data ?? []) as Array<{ inquiry_id: string; talent_profile_id: string }>;
  const profileIds = [...new Set(mirrors.map((m) => m.talent_profile_id))];
  if (profileIds.length === 0) return out;

  const { data: profiles, error: profileErr } = await admin
    .from("talent_profiles")
    .select("id, display_name, first_name")
    .in("id", profileIds);
  if (profileErr) {
    logServerError("scheduling.loadAppointments/profiles", profileErr);
    return out;
  }
  const names = new Map<string, string>();
  for (const p of (profiles ?? []) as Array<{
    id: string;
    display_name: string | null;
    first_name: string | null;
  }>) {
    const name = p.display_name?.trim() || p.first_name?.trim();
    if (name) names.set(p.id, name);
  }

  for (const m of mirrors) {
    const name = names.get(m.talent_profile_id);
    if (!name) continue;
    const list = out.get(m.inquiry_id) ?? [];
    if (!list.includes(name)) list.push(name);
    out.set(m.inquiry_id, list);
  }
  return out;
}

/** The rooms or resources each order's live allocations are seated in. */
export async function placeNamesByOrder(
  admin: Admin,
  tenantId: string,
  orderIds: readonly string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const ids = [...new Set(orderIds)];
  if (ids.length === 0) return out;

  const { data: lineData, error: lineErr } = await admin
    .from("order_lines")
    .select("id, order_id")
    .eq("tenant_id", tenantId)
    .in("order_id", ids);
  if (lineErr) {
    logServerError("scheduling.loadAppointments/order_lines", lineErr);
    return out;
  }
  const lines = (lineData ?? []) as Array<{ id: string; order_id: string }>;
  if (lines.length === 0) return out;
  const orderByLine = new Map(lines.map((l) => [l.id, l.order_id]));

  const { data: allocData, error: allocErr } = await admin
    .from("capacity_allocations")
    .select("id, order_line_id")
    .eq("tenant_id", tenantId)
    .neq("state", "released")
    .in("order_line_id", [...orderByLine.keys()]);
  if (allocErr) {
    logServerError("scheduling.loadAppointments/allocations", allocErr);
    return out;
  }
  const allocs = (allocData ?? []) as Array<{ id: string; order_line_id: string | null }>;
  if (allocs.length === 0) return out;

  const { data: seatData, error: seatErr } = await admin
    .from("space_assignments")
    .select("allocation_id, space_id")
    .eq("tenant_id", tenantId)
    .in("allocation_id", allocs.map((a) => a.id));
  if (seatErr) {
    logServerError("scheduling.loadAppointments/space_assignments", seatErr);
    return out;
  }
  const seats = (seatData ?? []) as Array<{ allocation_id: string; space_id: string }>;
  if (seats.length === 0) return out;

  const spaceNames = await namesForSpaces(admin, tenantId, seats.map((s) => s.space_id));
  const orderByAlloc = new Map(
    allocs.map((a) => [a.id, a.order_line_id ? orderByLine.get(a.order_line_id) ?? null : null]),
  );
  for (const seat of seats) {
    const orderId = orderByAlloc.get(seat.allocation_id);
    const name = spaceNames.get(seat.space_id);
    if (!orderId || !name) continue;
    const list = out.get(orderId) ?? [];
    if (!list.includes(name)) list.push(name);
    out.set(orderId, list);
  }
  return out;
}

export async function namesForSpaces(
  admin: Admin,
  tenantId: string,
  spaceIds: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(spaceIds)];
  if (ids.length === 0) return out;
  const { data, error } = await admin
    .from("spaces")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .in("id", ids);
  if (error) {
    logServerError("scheduling.loadAppointments/spaces", error);
    return out;
  }
  for (const s of (data ?? []) as Array<{ id: string; name: string | null }>) {
    const name = s.name?.trim();
    if (name) out.set(s.id, name);
  }
  return out;
}

/** The display name behind `failed_talent_id`, or null when it cannot be read. */
export async function nameForTalent(
  admin: Admin,
  talentProfileId: string | null,
): Promise<string | null> {
  if (!talentProfileId) return null;
  const { data, error } = await admin
    .from("talent_profiles")
    .select("display_name, first_name")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (error) {
    logServerError("scheduling.rescheduleAppointment/talentName", error);
    return null;
  }
  const row = data as { display_name: string | null; first_name: string | null } | null;
  return row?.display_name?.trim() || row?.first_name?.trim() || null;
}

/**
 * The name behind `failed_pool_id`.
 *
 * `capacity_pools.subject_id` is polymorphic and carries no foreign key, so
 * this reads the pool's own `subject_kind` and looks in the table that kind
 * names. A kind with no table to look in resolves to null and the sentence
 * falls back to its unnamed form, which is the honest outcome: a room this
 * cannot name must not be named wrongly.
 */
export async function nameForPool(
  admin: Admin,
  tenantId: string,
  poolId: string | null,
): Promise<string | null> {
  if (!poolId) return null;
  const { data, error } = await admin
    .from("capacity_pools")
    .select("subject_kind, subject_id, unit_label")
    .eq("id", poolId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    logServerError("scheduling.rescheduleAppointment/pool", error);
    return null;
  }
  const pool = data as {
    subject_kind: string | null;
    subject_id: string | null;
    unit_label: string | null;
  } | null;
  if (!pool?.subject_id) return null;

  const table =
    pool.subject_kind === "space"
      ? "spaces"
      : pool.subject_kind === "space_group"
        ? "space_groups"
        : null;
  if (!table) return pool.unit_label?.trim() || null;

  const { data: named, error: namedErr } = await admin
    .from(table)
    .select("name")
    .eq("id", pool.subject_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (namedErr) {
    logServerError("scheduling.rescheduleAppointment/poolSubject", namedErr);
    return null;
  }
  return ((named as { name: string | null } | null)?.name ?? "").trim() || null;
}
