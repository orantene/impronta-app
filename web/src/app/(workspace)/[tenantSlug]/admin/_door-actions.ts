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
import { doorCounts, doorTakings, type DoorCounts, type DoorPaidVia, type DoorTakings } from "@/lib/events/summary";
import { commitCapacity, releaseCapacity, reserveCapacityBatch } from "@/lib/capacity";
import { tierReserveRequest } from "@/lib/sessions/tier-pools";
import { z } from "zod";

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
  /** Door money — both set or both null (`admissions_door_money_paired`). */
  doorAmountCents: number | null;
  doorPaidVia: DoorPaidVia | null;
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
        "id, holder_name, party_size, admitted_count, status, seated_at, no_show_at, line_seq, order_line_id, door_amount_cents, door_paid_via",
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
      doorAmountCents: (a.door_amount_cents as number | null) ?? null,
      doorPaidVia: (a.door_paid_via as DoorPaidVia | null) ?? null,
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
  /** What the door took, by method. Order-backed money is on the orders, not here. */
  takings: DoorTakings;
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
      takings: doorTakings(door.rows),
    },
  };
}

// ── Sell at the door (E8b) ──────────────────────────────────────────────────

export type DoorTier = {
  variantId: string;
  label: string;
  amountCents: number;
  admitsPerUnit: number;
  /** False when the session has no pool for this tier: unsellable, and said so. */
  hasPool: boolean;
};

/**
 * The tiers a door can sell for one session: the event's offering variants that
 * carry a `pool_key`, joined to this session's pools. NO sale-window gate — the
 * public window closes online sales; the door is staff selling to a person who
 * is standing there. Availability is still the pool's answer, at reserve time.
 */
export async function loadDoorTiers(
  sessionId: string,
): Promise<{ ok: true; tiers: DoorTier[] } | { ok: false; error: string }> {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { supabase, tenantId } = guard;
  if (typeof sessionId !== "string" || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
    return { ok: false, error: "That is not a session." };
  }
  try {
    const { data: session, error: sErr } = await supabase
      .from("sessions")
      .select("id, event_id")
      .eq("id", sessionId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (sErr) {
      logServerError("door.tiers/session", sErr);
      return { ok: false, error: "Could not load the session." };
    }
    if (!session?.event_id) return { ok: true, tiers: [] };

    const { data: event, error: eErr } = await supabase
      .from("events")
      .select("offering_id")
      .eq("id", session.event_id as string)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (eErr) {
      logServerError("door.tiers/event", eErr);
      return { ok: false, error: "Could not load the event." };
    }
    if (!event?.offering_id) return { ok: true, tiers: [] };

    const [{ data: variants, error: vErr }, { data: pools, error: pErr }] = await Promise.all([
      supabase
        .from("talent_offering_variants")
        .select("id, label, amount_cents, admits_per_unit, pool_key, sort_order")
        .eq("offering_id", event.offering_id as string)
        .order("sort_order", { ascending: true }),
      supabase
        .from("capacity_pools")
        .select("id, pool_key")
        .eq("tenant_id", tenantId)
        .eq("subject_kind", "session_tier")
        .eq("subject_id", sessionId),
    ]);
    if (vErr) {
      logServerError("door.tiers/variants", vErr);
      return { ok: false, error: "Could not load ticket tiers." };
    }
    if (pErr) {
      logServerError("door.tiers/pools", pErr);
      return { ok: false, error: "Could not load capacity." };
    }
    const poolKeys = new Set((pools ?? []).map((p) => p.pool_key as string));
    const tiers: DoorTier[] = (variants ?? [])
      .filter((v) => typeof v.pool_key === "string" && v.pool_key)
      .map((v) => ({
        variantId: v.id as string,
        label: v.label as string,
        amountCents: (v.amount_cents as number | null) ?? 0,
        admitsPerUnit: (v.admits_per_unit as number | null) ?? 1,
        hasPool: poolKeys.has(v.pool_key as string),
      }));
    return { ok: true, tiers };
  } catch (err) {
    logServerError("door.tiers", err);
    return { ok: false, error: "Could not load ticket tiers." };
  }
}

const sellSchema = z.object({
  sessionId: z.string().uuid(),
  variantId: z.string().uuid(),
  holderName: z.string().trim().max(120).optional(),
  /** What was ACTUALLY taken. A comp is 0. Defaults to the tier price in the form. */
  amountCents: z.number().int().min(0).max(100_000_000),
  paidVia: z.enum(["cash", "card_terminal", "other"]),
});

export type SellAtDoorResult =
  | { ok: true; admissionId: string; outcome: DoorOutcome }
  | { ok: false; error: string };

/**
 * Sell ONE unit of a tier to a person standing at the door, and admit them.
 *
 * THE WALK-UP HOLDS AN ALLOCATION. This is the path with the most pressure to
 * skip capacity — there is a queue of real people — and a walk-up that holds
 * nothing is how a room oversells at the door. So: reserve on the tier's pool
 * for this session, commit, THEN write the admission pointing at that
 * allocation, then `check_in` in actor mode. Any failure after the reserve
 * releases it (idempotent on `released_at`), so a refused insert cannot leave
 * a phantom hold.
 *
 * THE MONEY IS A RECORDED FACT, NOT A DERIVED ONE. `amountCents` is what the
 * doorman took — the form defaults it to the tier price but the row stores
 * the number that happened, so next week's price change does not rewrite
 * last Saturday's takings. Both money fields are written together
 * (`admissions_door_money_paired`). There is no order, no charge, no
 * commission: Tulala never touched this money, and the row says so.
 *
 * ONE UNIT PER SALE. A VIP table for six is one unit admitting six
 * (`admits_per_unit`), so `party_size` is the tier's, not a free number.
 */
export async function sellAtDoor(input: {
  sessionId: string;
  variantId: string;
  holderName?: string;
  amountCents: number;
  paidVia: DoorPaidVia;
}): Promise<SellAtDoorResult> {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { tenantId, user } = guard;

  const parsed = sellSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Those details are not valid." };
  const { sessionId, variantId, holderName, amountCents, paidVia } = parsed.data;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Door is not set up on this server." };

  let heldAllocationIds: string[] = [];
  const unwind = async (why: string) => {
    if (heldAllocationIds.length === 0) return;
    const rel = await releaseCapacity(heldAllocationIds, admin);
    if (!rel.ok) logServerError(`door.sell/unwind(${why})`, new Error("release failed"));
    heldAllocationIds = [];
  };

  try {
    // Tenant scope on every read BEFORE any write. Service role sees every
    // tenant; the guard's tenant is the only one this staff member may sell for.
    const { data: session, error: sErr } = await admin
      .from("sessions")
      .select("id, starts_at, ends_at, event_id")
      .eq("id", sessionId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (sErr) {
      logServerError("door.sell/session", sErr);
      return { ok: false, error: "Could not load the session." };
    }
    if (!session?.event_id) return { ok: false, error: "No such session in this workspace." };

    const { data: event, error: eErr } = await admin
      .from("events")
      .select("offering_id")
      .eq("id", session.event_id as string)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (eErr) {
      logServerError("door.sell/event", eErr);
      return { ok: false, error: "Could not load the event." };
    }
    if (!event?.offering_id) return { ok: false, error: "This event has no ticket tiers." };

    // The tier must belong to THIS event's offering — a variant id from
    // another event would otherwise sell a seat here at that tier's price.
    const { data: variant, error: vErr } = await admin
      .from("talent_offering_variants")
      .select("id, label, admits_per_unit, pool_key")
      .eq("id", variantId)
      .eq("offering_id", event.offering_id as string)
      .maybeSingle();
    if (vErr) {
      logServerError("door.sell/variant", vErr);
      return { ok: false, error: "Could not load the tier." };
    }
    if (!variant || typeof variant.pool_key !== "string" || !variant.pool_key) {
      return { ok: false, error: "That tier cannot be sold here." };
    }

    const { data: pool, error: pErr } = await admin
      .from("capacity_pools")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("subject_kind", "session_tier")
      .eq("subject_id", sessionId)
      .eq("pool_key", variant.pool_key)
      .maybeSingle();
    if (pErr) {
      logServerError("door.sell/pool", pErr);
      return { ok: false, error: "Could not load capacity." };
    }
    if (!pool) return { ok: false, error: "This session has no capacity for that tier." };

    const req = tierReserveRequest(
      { id: sessionId, startsAt: session.starts_at as string, endsAt: session.ends_at as string },
      pool.id as string,
      1,
      null,
    );
    if (!req) return { ok: false, error: "This session has no usable time window." };

    const reserved = await reserveCapacityBatch([req], { createdBy: user.id }, admin);
    if (!reserved.ok) {
      return {
        ok: false,
        error: reserved.reason === "unavailable" || reserved.reason === "sold_out"
          ? "Sold out at that tier."
          : "Could not hold a seat.",
      };
    }
    heldAllocationIds = reserved.allocationIds;

    const committed = await commitCapacity(heldAllocationIds, null, admin);
    if (!committed.ok) {
      await unwind("commit refused");
      return { ok: false, error: "Could not confirm the seat." };
    }

    const { data: inserted, error: iErr } = await admin
      .from("admissions")
      .insert({
        tenant_id: tenantId,
        session_id: sessionId,
        allocation_id: heldAllocationIds[0] ?? null,
        party_size: (variant.admits_per_unit as number | null) ?? 1,
        holder_name: holderName && holderName.length > 0 ? holderName : null,
        door_amount_cents: amountCents,
        door_paid_via: paidVia,
      })
      .select("id")
      .single();
    if (iErr || !inserted) {
      logServerError("door.sell/insert", iErr ?? new Error("no row"));
      await unwind("insert failed");
      return { ok: false, error: "Could not record the sale." };
    }
    // The seat is sold and recorded; from here a failure is a check-in problem,
    // not a sale problem, and the row stays (the door can tap it in).
    heldAllocationIds = [];

    const { data, error } = await admin.rpc("check_in", {
      p_admission_id: inserted.id as string,
      p_mode: "actor",
      p_count: null,
      p_actor: user.id,
      p_token_version: null,
    });
    if (error) {
      logServerError("door.sell/check_in", error);
      return { ok: true, admissionId: inserted.id as string, outcome: { kind: "engine_error", detail: error.message } };
    }
    return { ok: true, admissionId: inserted.id as string, outcome: doorOutcomeForCheckIn(data as never) };
  } catch (err) {
    logServerError("door.sell", err);
    await unwind("unexpected");
    return { ok: false, error: "Could not sell at the door." };
  }
}
