import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { commitCapacity, capacityRemaining } from "@/lib/capacity";
import { convertToBooking } from "@/lib/inquiry/inquiry-engine-booking";
import { completeZeroTotalOrder } from "@/lib/orders/complete-order";
import { holdDraftOrderCapacity } from "@/lib/pos/hold-capacity";
import { collectBusyIntervals, type BookingBusyRow, type BusySourceRow, type HoldBusyRow } from "@/lib/scheduling/load-busy";
import { unexpiredHoldOrFilter } from "@/lib/scheduling/hold-expiry";
import { parseReservationStamp } from "@/lib/scheduling/reservation-intent";
import { DEFAULT_TIER_KEY } from "@/lib/sessions/tier-pools";

import { logAction } from "./action-log";
import { insertMessage } from "./insert-message";
import {
  buildConfirmPlan,
  runConfirmChecks,
  type ConfirmConflict,
  type ConfirmLineInput,
  type ConfirmPlan,
  type ConfirmReaders,
  type ConfirmSource,
} from "./confirm-plan";
import type { MessagingRefusal, RecordKind } from "./types";

/**
 * S3 (board D19, owner decision 4): turn an ACCEPTED OFFER or a SHARED DRAFT
 * into the real record, with an availability recheck first, and a refusal
 * that names the exact conflict and creates nothing.
 *
 * Principle 0: this file inserts into none of orders / bookings / admissions
 * / payments / calendar. It composes the writers the POS already uses:
 *
 *   source "offer" -> `convertToBooking` (engine_convert_to_booking RPC:
 *                     agency_bookings + booking_talent + inquiry status; then
 *                     `enrichBookingFromReservation` stamps times, mirrors
 *                     talent_bookings, releases the firm hold). The record
 *                     kind Messages links is `project` (an agency booking).
 *   source "draft" -> `holdDraftOrderCapacity` (the POS's own capacity
 *                     attach, idempotent by `pos-hold:<orderId>`), then
 *                     `commitCapacity` so the places stop lapsing with the
 *                     hold TTL; a free order goes through
 *                     `completeZeroTotalOrder` (flips to `paid`). The record
 *                     kind is `order`.
 *
 * Then `messaging_link_record` (the existing RPC) writes the
 * `conversation_records` row, an `inquiry_action_log` line records the
 * confirm, and a system card (`appointment_confirmation` /
 * `order_confirmation`, both existing kinds) lands on the client thread.
 *
 * Deposit rule (owner decision 4): an offer with a deposit term, or a draft
 * whose lines reserve by deposit, is refused `deposit_required` when no paid
 * deposit exists, unless `overrideReason` (>= 8 chars) is given; the override
 * is written to history before anything is created.
 *
 * Idempotency: a second confirm for the same offer / draft answers `already`
 * and creates nothing (inquiry version lock + an existing live
 * `conversation_records` row of that kind for that source).
 *
 * SEAMS (decisions.md D-MSG-20..23): a confirmed draft that still owes money
 * keeps `orders.status = 'draft'`; the POS flips to `pending_payment` only
 * inside `startCollection`, coupled to a payment request, and there is no
 * standalone writer for that transition. Talent legs of a POS-held draft
 * keep their TTL: `commitOrderTalentHolds` keys on `order:<id>:reserve`, the
 * POS holds under `pos-hold:<id>`.
 */

export type ConfirmInput = {
  inquiryId: string;
  source: ConfirmSource;
  offerId?: string | null;
  orderId?: string | null;
  expectedVersion: number;
  overrideReason?: string | null;
};

export type ConfirmOk = {
  ok: true;
  kind: RecordKind;
  recordId: string;
  /** The inquiry's version after the confirm (link RPC bumps it). */
  version: number;
  plan: ConfirmPlan;
  overrode: boolean;
};

export type ConfirmFail =
  | { ok: false; reason: Exclude<MessagingRefusal, "unavailable">; conflicts?: undefined }
  | { ok: false; reason: "unavailable"; conflicts?: ConfirmConflict[] };

export type ConfirmResult = ConfirmOk | ConfirmFail;

export const CONFIRM_OVERRIDE_MIN_CHARS = 8;
const CONFIRM_ACTION = "messaging_confirm";
const CONFIRM_OVERRIDE_ACTION = "messaging_confirm_override";

type Clients = {
  /** Service role: the readers, the POS writers, the link RPC. */
  admin: SupabaseClient;
  /** The staff member's own client: `convertToBooking` checks permission on it. */
  supabase: SupabaseClient;
  tenantId: string;
  actorUserId: string;
};

/** Every writer and reader this composes, injectable so the paths are testable without a database. */
export type ConfirmDeps = {
  convertToBooking: typeof convertToBooking;
  holdDraftOrderCapacity: typeof holdDraftOrderCapacity;
  commitCapacity: typeof commitCapacity;
  completeZeroTotalOrder: typeof completeZeroTotalOrder;
  insertMessage: typeof insertMessage;
  readers: (clients: Clients, input: ConfirmInput) => ConfirmReaders;
};

const defaultDeps: ConfirmDeps = {
  convertToBooking,
  holdDraftOrderCapacity,
  commitCapacity,
  completeZeroTotalOrder,
  insertMessage,
  readers: defaultReaders,
};

function fail(reason: Exclude<MessagingRefusal, "unavailable">): ConfirmFail {
  return { ok: false, reason };
}

function unavailable(conflicts?: ConfirmConflict[]): ConfirmFail {
  return conflicts ? { ok: false, reason: "unavailable", conflicts } : { ok: false, reason: "unavailable" };
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * The calendar reader for people: the same three tables `loadBusyIntervals`
 * unions, minus THIS inquiry's own firm hold (the one `convertToBooking`
 * is about to turn into the booking). Counting our own hold as busy would
 * refuse every offer that was correctly held at pick time.
 */
function defaultReaders(clients: Clients, input: ConfirmInput): ConfirmReaders {
  const { admin } = clients;
  return {
    busy: async (check) => {
      const now = new Date();
      const [holdsRes, bookingsRes, blocksRes] = await Promise.all([
        admin
          .from("talent_holds")
          .select("starts_at, ends_at, expires_at, inquiry_id")
          .eq("talent_profile_id", check.talentProfileId)
          .lt("starts_at", check.endsAt)
          .gt("ends_at", check.startsAt)
          .or(unexpiredHoldOrFilter(now)),
        admin
          .from("talent_bookings")
          .select("starts_at, ends_at, status, inquiry_id")
          .eq("talent_profile_id", check.talentProfileId)
          .lt("starts_at", check.endsAt)
          .gt("ends_at", check.startsAt),
        admin
          .from("talent_availability_blocks")
          .select("starts_at, ends_at")
          .eq("talent_profile_id", check.talentProfileId)
          .lt("starts_at", check.endsAt)
          .gt("ends_at", check.startsAt),
      ]);
      const loadErr = holdsRes.error ?? bookingsRes.error ?? blocksRes.error;
      // Fail closed: a calendar that cannot be read is not free.
      if (loadErr) throw loadErr;
      const notOurs = <T extends { inquiry_id?: string | null }>(rows: T[] | null) =>
        (rows ?? []).filter((r) => r.inquiry_id !== input.inquiryId);
      return collectBusyIntervals({
        holds: notOurs(holdsRes.data as (HoldBusyRow & { inquiry_id?: string | null })[] | null),
        bookings: notOurs(bookingsRes.data as (BookingBusyRow & { inquiry_id?: string | null })[] | null),
        blocks: (blocksRes.data ?? []) as BusySourceRow[],
        now,
      });
    },
    remaining: (check) =>
      capacityRemaining(check.poolId, { startsAt: check.startsAt, endsAt: check.endsAt }, admin),
  };
}

async function hasLiveLink(admin: SupabaseClient, tenantId: string, inquiryId: string, kind: RecordKind, recordId?: string) {
  let q = admin
    .from("conversation_records")
    .select("id, record_id")
    .eq("tenant_id", tenantId)
    .eq("inquiry_id", inquiryId)
    .eq("record_kind", kind)
    .is("unlinked_at", null);
  if (recordId) q = q.eq("record_id", recordId);
  const { data, error } = await q.limit(1);
  if (error) return null;
  return (data ?? []).length > 0;
}

async function identityAtLeastLinked(admin: SupabaseClient, inquiryId: string) {
  const { data } = await admin.from("conversation_identity").select("level").eq("inquiry_id", inquiryId).maybeSingle();
  const level = (data as { level?: string } | null)?.level ?? "none";
  return level === "linked" || level === "confirmed" || level === "granted";
}

async function inquiryDepositPaid(admin: SupabaseClient, tenantId: string, inquiryId: string) {
  const [{ data: links }, { data: txns }] = await Promise.all([
    admin.from("payment_links").select("id").eq("tenant_id", tenantId).eq("inquiry_id", inquiryId).eq("status", "paid").limit(1),
    admin.from("booking_transactions").select("id").eq("source_inquiry_id", inquiryId).eq("status", "paid").limit(1),
  ]);
  return (links ?? []).length > 0 || (txns ?? []).length > 0;
}

async function orderDepositPaid(admin: SupabaseClient, tenantId: string, orderId: string) {
  const { data } = await admin.from("payment_links").select("id").eq("tenant_id", tenantId).eq("order_id", orderId).eq("status", "paid").limit(1);
  return (data ?? []).length > 0;
}

async function readInquiryVersion(admin: SupabaseClient, inquiryId: string): Promise<number | null> {
  const { data } = await admin.from("inquiries").select("version").eq("id", inquiryId).maybeSingle();
  const v = (data as { version?: number } | null)?.version;
  return typeof v === "number" ? v : null;
}

async function linkRecord(
  admin: SupabaseClient,
  c: Clients,
  inquiryId: string,
  kind: RecordKind,
  recordId: string,
): Promise<{ ok: true; version: number } | { ok: false }> {
  const version = await readInquiryVersion(admin, inquiryId);
  if (version == null) return { ok: false };
  const { data, error } = await admin.rpc("messaging_link_record", {
    p_tenant_id: c.tenantId,
    p_inquiry_id: inquiryId,
    p_record_kind: kind,
    p_record_id: recordId,
    p_linked_by: c.actorUserId,
    p_expected_version: version,
  });
  if (error) return { ok: false };
  const row = data as { ok?: boolean; reason?: string; version?: number } | null;
  if (row?.ok) return { ok: true, version: Number(row.version ?? version + 1) };
  // A retry that lost its answer already linked: that is the state we want.
  if (row?.reason === "already_linked") return { ok: true, version };
  return { ok: false };
}

/** Deposit rule + override, shared by both sources. Returns the refusal, or whether an override was used. */
async function applyDepositRule(
  c: Clients,
  input: ConfirmInput,
  depositRequired: boolean,
  depositPaid: boolean,
): Promise<{ ok: true; overrode: boolean } | ConfirmFail> {
  if (!depositRequired || depositPaid) return { ok: true, overrode: false };
  const reason = (input.overrideReason ?? "").trim();
  if (reason.length < CONFIRM_OVERRIDE_MIN_CHARS) return fail("deposit_required");
  await logAction(c.admin, {
    inquiryId: input.inquiryId,
    actorUserId: c.actorUserId,
    actionType: CONFIRM_OVERRIDE_ACTION,
    metadata: { source: input.source, offerId: input.offerId ?? null, orderId: input.orderId ?? null, reason },
  });
  return { ok: true, overrode: true };
}

async function refuseUnavailable(c: Clients, input: ConfirmInput, plan: ConfirmPlan, conflicts: ConfirmConflict[]) {
  await c.admin.from("inquiry_action_log").insert({
    inquiry_id: input.inquiryId,
    actor_user_id: c.actorUserId,
    action_type: CONFIRM_ACTION,
    result: "failure",
    reason: "unavailable",
    metadata: { source: input.source, offerId: input.offerId ?? null, orderId: input.orderId ?? null, conflicts, checks: plan.checks.length },
  });
  return unavailable(conflicts);
}

async function finish(
  c: Clients,
  deps: ConfirmDeps,
  input: ConfirmInput,
  plan: ConfirmPlan,
  kind: RecordKind,
  recordId: string,
  overrode: boolean,
  card: { kind: "appointment_confirmation" | "order_confirmation"; body: string; payload: Record<string, unknown> },
): Promise<ConfirmResult> {
  const linked = await linkRecord(c.admin, c, input.inquiryId, kind, recordId);
  if (!linked.ok) return unavailable();
  await logAction(c.admin, {
    inquiryId: input.inquiryId,
    actorUserId: c.actorUserId,
    actionType: CONFIRM_ACTION,
    metadata: {
      source: input.source,
      kind,
      recordId,
      offerId: input.offerId ?? null,
      orderId: input.orderId ?? null,
      availabilityRechecked: true,
      checks: plan.checks.length,
      skipped: plan.skipped,
      overrode,
      summary: `confirmed ${kind} ${recordId} from ${input.source} · availability rechecked`,
    },
  });
  await deps.insertMessage(c.admin, {
    tenantId: c.tenantId,
    inquiryId: input.inquiryId,
    kind: card.kind,
    body: card.body,
    payload: { ...card.payload, state: "sent" },
    senderUserId: c.actorUserId,
  });
  return { ok: true, kind, recordId, version: linked.version, plan, overrode };
}

// ── source: offer ──────────────────────────────────────────────────────────

async function confirmFromOffer(c: Clients, deps: ConfirmDeps, input: ConfirmInput, inquiry: InquiryRow): Promise<ConfirmResult> {
  if (!input.offerId) return fail("invalid");
  const { data: offerRow } = await c.admin
    .from("inquiry_offers")
    .select("id, inquiry_id, tenant_id, status, deposit_pct, deposit_amount_cents")
    .eq("id", input.offerId)
    .maybeSingle();
  if (!offerRow) return fail("not_found");
  const offer = offerRow as { id: string; inquiry_id: string; tenant_id: string; status: string; deposit_pct: number | null; deposit_amount_cents: number | null };
  if (offer.tenant_id !== c.tenantId || offer.inquiry_id !== input.inquiryId) return fail("wrong_tenant");
  if (offer.status !== "accepted") return fail("invalid");

  // Already the real record: the inquiry converted, or a project is already
  // linked on this conversation. Nothing is created twice.
  if (inquiry.status === "booked" || inquiry.status === "converted") return fail("already");
  const linked = await hasLiveLink(c.admin, c.tenantId, input.inquiryId, "project");
  if (linked == null) return unavailable();
  if (linked) return fail("already");

  const depositRequired = num(offer.deposit_pct) > 0 || num(offer.deposit_amount_cents) > 0;
  const gate = await applyDepositRule(c, input, depositRequired, depositRequired ? await inquiryDepositPaid(c.admin, c.tenantId, input.inquiryId) : false);
  if (!gate.ok) return gate;

  // The lines: the offer's people, dated by the inquiry's reservation stamp
  // (the one window an appointment offer carries); the stamp's offering may
  // also consume a pool (a room, a chair).
  const stamp = parseReservationStamp(inquiry.source_context);
  const { data: itemRows } = await c.admin
    .from("inquiry_offer_line_items")
    .select("id, label, talent_profile_id, units")
    .eq("offer_id", offer.id)
    .order("sort_order", { ascending: true });
  const lines: ConfirmLineInput[] = ((itemRows ?? []) as Array<{ id: string; label: string | null; talent_profile_id: string | null; units: number | string }>).map(
    (item) => ({
      id: item.id,
      label: item.label?.trim() || "This line",
      talentProfileId: item.talent_profile_id,
      units: num(item.units),
      startsAt: stamp?.starts_at ?? null,
      endsAt: stamp?.ends_at ?? null,
      timezone: stamp?.timezone ?? null,
    }),
  );
  if (stamp) {
    const { data: offering } = await c.admin
      .from("talent_offerings")
      .select("id, title, talent_profile_id, capacity_pool_id")
      .eq("id", stamp.offering_id)
      .eq("tenant_id", c.tenantId)
      .maybeSingle();
    const off = offering as { id: string; title: string | null; talent_profile_id: string | null; capacity_pool_id: string | null } | null;
    if (off && (off.talent_profile_id || off.capacity_pool_id)) {
      lines.push({
        id: `offering:${off.id}`,
        label: off.title?.trim() || "This appointment",
        talentProfileId: off.talent_profile_id,
        poolId: off.capacity_pool_id,
        units: 1,
        startsAt: stamp.starts_at,
        endsAt: stamp.ends_at,
        timezone: stamp.timezone,
      });
    }
  }

  const plan = buildConfirmPlan("offer", lines);
  let conflicts: ConfirmConflict[];
  try {
    conflicts = await runConfirmChecks(plan, deps.readers(c, input));
  } catch {
    return unavailable();
  }
  if (conflicts.length > 0) return refuseUnavailable(c, input, plan, conflicts);

  const converted = await deps.convertToBooking(c.supabase, {
    inquiryId: input.inquiryId,
    tenantId: c.tenantId,
    actorUserId: c.actorUserId,
    expectedVersion: input.expectedVersion,
  });
  if (!converted.success) {
    if (converted.conflict || converted.reason === "version_conflict") return fail("conflict");
    if (converted.rateLimited) return fail("rate_limited");
    if (converted.forbidden) return fail("not_allowed");
    if (converted.reason === "no_active_offer") return fail("invalid");
    return unavailable();
  }
  const bookingId = converted.data?.bookingId;
  if (!bookingId) return unavailable();

  return finish(c, deps, input, plan, "project", bookingId, gate.overrode, {
    kind: "appointment_confirmation",
    body: "Appointment confirmed",
    payload: {
      bookingId,
      offerId: offer.id,
      startsAt: stamp?.starts_at ?? null,
      endsAt: stamp?.ends_at ?? null,
      timezone: stamp?.timezone ?? null,
    },
  });
}

// ── source: draft ──────────────────────────────────────────────────────────

async function confirmFromDraft(c: Clients, deps: ConfirmDeps, input: ConfirmInput): Promise<ConfirmResult> {
  if (!input.orderId) return fail("invalid");
  const { data: orderRow } = await c.admin
    .from("orders")
    .select("id, tenant_id, inquiry_id, status, total_cents, currency")
    .eq("id", input.orderId)
    .maybeSingle();
  if (!orderRow) return fail("not_found");
  const order = orderRow as { id: string; tenant_id: string; inquiry_id: string | null; status: string; total_cents: number | string; currency: string };
  if (order.tenant_id !== c.tenantId || order.inquiry_id !== input.inquiryId) return fail("wrong_tenant");

  const linked = await hasLiveLink(c.admin, c.tenantId, input.inquiryId, "order", order.id);
  if (linked == null) return unavailable();
  if (linked) return fail("already");
  if (order.status === "paid" || order.status === "fulfilled") return fail("already");
  if (order.status !== "draft" && order.status !== "pending_payment") return fail("invalid");

  const { data: lineRows } = await c.admin
    .from("order_lines")
    .select("id, label, offering_id, session_id, variant_id, units")
    .eq("order_id", order.id);
  const rawLines = (lineRows ?? []) as Array<{ id: string; label: string | null; offering_id: string | null; session_id: string | null; variant_id: string | null; units: number | string }>;
  if (rawLines.length === 0) return fail("invalid");

  const lineIds = rawLines.map((l) => l.id);
  const { data: allocRows } = await c.admin
    .from("capacity_allocations")
    .select("id, order_line_id, released_at")
    .eq("tenant_id", c.tenantId)
    .in("order_line_id", lineIds);
  const heldLineIds = new Set(
    ((allocRows ?? []) as Array<{ order_line_id: string; released_at: string | null }>).filter((a) => !a.released_at).map((a) => a.order_line_id),
  );

  const lines: ConfirmLineInput[] = [];
  let depositRequired = false;
  for (const line of rawLines) {
    const label = line.label?.trim() || "This item";
    if (!line.offering_id) {
      lines.push({ id: line.id, label });
      continue;
    }
    const { data: offeringRow } = await c.admin
      .from("talent_offerings")
      .select("id, talent_profile_id, capacity_pool_id, reserve_mode, deposit_pct")
      .eq("id", line.offering_id)
      .eq("tenant_id", c.tenantId)
      .maybeSingle();
    const off = offeringRow as { talent_profile_id: string | null; capacity_pool_id: string | null; reserve_mode: string | null; deposit_pct: number | null } | null;
    if (!off) {
      lines.push({ id: line.id, label });
      continue;
    }
    if (off.reserve_mode === "deposit" && num(off.deposit_pct) > 0) depositRequired = true;

    let poolId = off.capacity_pool_id;
    let startsAt: string | null = null;
    let endsAt: string | null = null;
    if (line.session_id) {
      const { data: sessionRow } = await c.admin.from("sessions").select("id, starts_at, ends_at").eq("id", line.session_id).maybeSingle();
      const sess = sessionRow as { id: string; starts_at: string; ends_at: string } | null;
      if (sess) {
        startsAt = sess.starts_at;
        endsAt = sess.ends_at;
        let tierKey = DEFAULT_TIER_KEY;
        if (line.variant_id) {
          const { data: variant } = await c.admin.from("talent_offering_variants").select("pool_key").eq("id", line.variant_id).maybeSingle();
          const key = (variant as { pool_key?: string | null } | null)?.pool_key;
          if (typeof key === "string" && key) tierKey = key;
        }
        const { data: pool } = await c.admin
          .from("capacity_pools")
          .select("id")
          .eq("tenant_id", c.tenantId)
          .eq("subject_kind", "session_tier")
          .eq("subject_id", sess.id)
          .eq("pool_key", tierKey)
          .maybeSingle();
        if (pool) poolId = (pool as { id: string }).id;
      }
    }
    lines.push({
      id: line.id,
      label,
      talentProfileId: off.talent_profile_id,
      poolId,
      units: num(line.units),
      startsAt,
      endsAt,
      alreadyHeld: heldLineIds.has(line.id),
    });
  }

  const gate = await applyDepositRule(c, input, depositRequired, depositRequired ? await orderDepositPaid(c.admin, c.tenantId, order.id) : false);
  if (!gate.ok) return gate;

  const plan = buildConfirmPlan("draft", lines);
  let conflicts: ConfirmConflict[];
  try {
    conflicts = await runConfirmChecks(plan, deps.readers(c, input));
  } catch {
    return unavailable();
  }
  if (conflicts.length > 0) return refuseUnavailable(c, input, plan, conflicts);

  // The POS writers. The hold is atomic and idempotent by the order; a race
  // that lost the recheck still refuses here, named as best the writer can.
  const held = await deps.holdDraftOrderCapacity(c.admin, { tenantId: c.tenantId, orderId: order.id, actorUserId: c.actorUserId });
  if (!held.ok) {
    if (held.reason === "sold_out") {
      return refuseUnavailable(c, input, plan, [{ line: "This order", why: "Those places are no longer free", at: null, code: "capacity_short" }]);
    }
    if (held.reason === "not_draft") return fail("invalid");
    if (held.reason === "not_found") return fail("not_found");
    if (held.reason === "wrong_tenant") return fail("wrong_tenant");
    return unavailable();
  }

  if (num(order.total_cents) === 0) {
    const completed = await deps.completeZeroTotalOrder(c.admin, { tenantId: c.tenantId, orderId: order.id });
    if (!completed.ok) return unavailable();
  } else if (held.allocationIds.length > 0) {
    const committed = await deps.commitCapacity(held.allocationIds, null, c.admin);
    if (!committed.ok) {
      return refuseUnavailable(c, input, plan, [{ line: "This order", why: "Those places are no longer held", at: null, code: "capacity_short" }]);
    }
  }

  return finish(c, deps, input, plan, "order", order.id, gate.overrode, {
    kind: "order_confirmation",
    body: "Order confirmed",
    payload: { orderId: order.id, totalCents: num(order.total_cents), currency: order.currency },
  });
}

// ── entry ──────────────────────────────────────────────────────────────────

type InquiryRow = { id: string; tenant_id: string; version: number; status: string; source_context: unknown };

export async function confirmRecord(clients: Clients, input: ConfirmInput, deps: ConfirmDeps = defaultDeps): Promise<ConfirmResult> {
  const { admin } = clients;
  const { data: inquiryRow, error } = await admin
    .from("inquiries")
    .select("id, tenant_id, version, status, source_context")
    .eq("id", input.inquiryId)
    .maybeSingle();
  if (error) return unavailable();
  if (!inquiryRow) return fail("not_found");
  const inquiry = inquiryRow as InquiryRow;
  if (inquiry.tenant_id !== clients.tenantId) return fail("wrong_tenant");
  if (inquiry.version !== input.expectedVersion) return fail("conflict");

  if (!(await identityAtLeastLinked(admin, input.inquiryId))) return fail("identity_unconfirmed");

  if (input.source === "offer") return confirmFromOffer(clients, deps, input, inquiry);
  return confirmFromDraft(clients, deps, input);
}
