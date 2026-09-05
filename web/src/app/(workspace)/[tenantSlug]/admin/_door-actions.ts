"use server";

/**
 * Door actions — the list, the walk-up admit, the end-of-night report.
 *
 * THE TENANT IS NEVER A PARAMETER. Every action resolves scope from the
 * session via `requireWorkspaceStaffAction`, which takes no tenant identifier
 * by design (pinned as "structural anti-escalation"). A `loadDoor(tenantId)`
 * would let any staff member read any workspace's door by changing one
 * argument.
 *
 * TWO WAYS IN, ONE ENFORCEMENT SITE. The QR path is Sessions' `scanAdmission`
 * — it verifies the signature and calls `check_in` with `p_mode => 'token'`
 * and the version it verified. The walk-up path here calls `check_in` with
 * `p_mode => 'actor'`. Both land on the same function under the same row lock;
 * neither surface decides admission on its own. `doorAdmits(outcome)` is the
 * only predicate that says whether someone walks in.
 *
 * `check_in` is service-role EXECUTE only, so the walk-up path authenticates
 * the staff member first and then calls with the admin client — exactly as
 * Sessions' caller does. It scopes the admission by `id` AND `tenant_id`
 * before the RPC, because `check_in` has no tenant predicate and a genuine
 * admission from another workspace would otherwise check in.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import { doorOutcomeForCheckIn, type DoorOutcome } from "@/lib/sessions/door";
import { doorCounts, type DoorCounts } from "@/lib/events/summary";

export type DoorRow = {
  id: string;
  holderName: string | null;
  partySize: number;
  admittedCount: number;
  status: "valid" | "void" | "refunded";
  seatedAt: string | null;
  noShowAt: string | null;
  lineSeq: number | null;
  /** True when this admission was sold at the door (no order line). */
  walkUp: boolean;
};

export type DoorSession = {
  id: string;
  startsAt: string;
  endsAt: string;
  eventTitle: string | null;
  eventId: string | null;
};

export type LoadDoorResult =
  | { ok: true; session: DoorSession; rows: DoorRow[]; counts: DoorCounts }
  | { ok: false; error: string };

/**
 * Tonight's door: every admission for one session, and the three numbers.
 *
 * Counts come from `doorCounts` over admissions, NOT from the pool — a VIP
 * table for six is one unit of capacity and six people through the door, and
 * a door reading the pool tells a venue to expect 88 when 118 are coming.
 */
export async function loadDoor(sessionId: string): Promise<LoadDoorResult> {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { supabase, tenantId } = guard;

  if (typeof sessionId !== "string" || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
    return { ok: false, error: "That is not a session." };
  }

  try {
    // Scoped by tenant as well as id: a session id from another workspace is
    // "not found", never "not yours".
    const { data: session, error: sessionErr } = await supabase
      .from("sessions")
      .select("id, starts_at, ends_at, event_id, tenant_id")
      .eq("id", sessionId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (sessionErr) {
      logServerError("door.load/session", sessionErr);
      return { ok: false, error: "Could not load the session." };
    }
    if (!session) return { ok: false, error: "No such session in this workspace." };

    const { data: eventRow, error: eventErr } = session.event_id
      ? await supabase.from("events").select("title").eq("id", session.event_id as string).maybeSingle()
      : { data: null, error: null };
    if (eventErr) logServerError("door.load/event", eventErr);

    // `error` destructured and acted on. A refusal must not render as an empty
    // door — the failure that reads as "nobody is coming tonight".
    const { data: admissionRows, error: admErr } = await supabase
      .from("admissions")
      .select(
        "id, holder_name, party_size, admitted_count, status, seated_at, no_show_at, line_seq, order_line_id",
      )
      .eq("session_id", sessionId)
      .eq("tenant_id", tenantId)
      .order("holder_name", { ascending: true, nullsFirst: false });

    if (admErr) {
      logServerError("door.load/admissions", admErr);
      return { ok: false, error: "Could not load the door list." };
    }

    const rows: DoorRow[] = (admissionRows ?? []).map((a) => ({
      id: a.id as string,
      holderName: (a.holder_name as string | null) ?? null,
      partySize: Number(a.party_size),
      admittedCount: Number(a.admitted_count),
      status: a.status as DoorRow["status"],
      seatedAt: (a.seated_at as string | null) ?? null,
      noShowAt: (a.no_show_at as string | null) ?? null,
      lineSeq: (a.line_seq as number | null) ?? null,
      walkUp: a.order_line_id === null,
    }));

    return {
      ok: true,
      session: {
        id: session.id as string,
        startsAt: session.starts_at as string,
        endsAt: session.ends_at as string,
        eventTitle: (eventRow?.title as string | null) ?? null,
        eventId: (session.event_id as string | null) ?? null,
      },
      rows,
      counts: doorCounts(rows),
    };
  } catch (err) {
    logServerError("door.load", err);
    return { ok: false, error: "Could not load the door." };
  }
}

/**
 * The host-stand path: a staff member taps a row and admits `count` people.
 *
 * `p_mode => 'actor'` — no token is involved, and none is required. `count`
 * defaults to the remainder inside `check_in`, so tapping once on a party of
 * four admits four; passing 2 admits two of them.
 */
export async function admitAtDoor(
  admissionId: string,
  count?: number,
): Promise<{ outcome: DoorOutcome }> {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { outcome: { kind: "engine_error", detail: guard.error } };
  const { tenantId, user } = guard;

  if (typeof admissionId !== "string" || !/^[0-9a-f-]{36}$/i.test(admissionId)) {
    return { outcome: { kind: "unknown_ticket" } };
  }

  const admin = createServiceRoleClient();
  if (!admin) return { outcome: { kind: "door_misconfigured" } };

  try {
    // Tenant scope BEFORE the RPC. `check_in` has no tenant predicate.
    const { data: owned, error: ownErr } = await admin
      .from("admissions")
      .select("id")
      .eq("id", admissionId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (ownErr) {
      logServerError("door.admit/scope", ownErr);
      return { outcome: { kind: "engine_error", detail: "scope read failed" } };
    }
    // Same answer as a genuinely unknown ticket, so this workspace learns
    // nothing about another's.
    if (!owned) return { outcome: { kind: "unknown_ticket" } };

    const { data, error } = await admin.rpc("check_in", {
      p_admission_id: admissionId,
      p_mode: "actor",
      p_count: count ?? null,
      p_actor: user.id,
      p_token_version: null,
    });
    if (error) {
      logServerError("door.admit/check_in", error);
      return { outcome: { kind: "engine_error", detail: error.message } };
    }
    // Sessions' mapper, not a local copy: one place turns the RPC's reply into
    // a door outcome, so the two entry modes cannot drift in how they read it.
    return { outcome: doorOutcomeForCheckIn(data as never) };
  } catch (err) {
    logServerError("door.admit", err);
    return { outcome: { kind: "engine_error", detail: "unexpected" } };
  }
}

export type NightReport = {
  session: DoorSession;
  sold: number;
  scanned: number;
  notScanned: number;
  noShows: number;
  walkUps: number;
  refunded: number;
};

/**
 * The end-of-night report — "register entries and ticket records", in the
 * owner's words. Sold, scanned, not scanned, and door sales.
 *
 * Cash-versus-card for walk-ups is a fact about the ORDER, not the admission;
 * a cash door sale has no order at all. So the split is what an admission can
 * say: sold online (has an order line) versus sold at the door (has none). The
 * money split lives in Orders' report.
 */
export async function loadNightReport(
  sessionId: string,
): Promise<{ ok: true; report: NightReport } | { ok: false; error: string }> {
  const door = await loadDoor(sessionId);
  if (!door.ok) return door;

  const live = door.rows.filter((r) => r.status === "valid");
  const scannedPeople = door.rows.reduce((n, r) => n + r.admittedCount, 0);
  const soldPeople = live.reduce((n, r) => n + r.partySize, 0);

  return {
    ok: true,
    report: {
      session: door.session,
      sold: soldPeople,
      scanned: scannedPeople,
      notScanned: Math.max(0, soldPeople - scannedPeople),
      noShows: door.counts.noShows,
      walkUps: live.filter((r) => r.walkUp).length,
      refunded: door.rows.filter((r) => r.status === "refunded").length,
    },
  };
}
