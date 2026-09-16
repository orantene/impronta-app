/**
 * class_timetable — the engine seam.
 *
 * Reads `sessions` the way `session-picker-actions` does (scheduled, in
 * window, zone REQUIRED), counts seats through `capacity_remaining_public`,
 * and answers the waitlist per session. Booking goes through `createPurchase`
 * with a `tierReserveRequest`, so the seat limit is enforced by the pool's
 * row lock and the thirteenth is refused there, not here. The waitlist uses
 * the desk's own `joinWaitlist` and the RPC-backed `acceptWaitlistOffer`.
 */

import type { PurchaseInput, PurchaseResult } from "@/lib/orders/purchase-types";
import type { CheckoutSessionInput, CheckoutSessionResult } from "@/lib/payments/stripe-checkout";
import type { AcceptWaitlistResult } from "@/lib/scheduling/session-waitlist";
import type { JoinWaitlistResult } from "@/lib/scheduling/waitlist-desk";
import { DEFAULT_TIER_KEY, tierReserveRequest } from "@/lib/sessions/tier-pools";

import type { StorefrontAdmin } from "./admin";
import type { IdempotentRunner } from "./idempotent";
import { mapEngineRefusal } from "./refusals";
import type { StorefrontIdentity } from "./request-context";
import type {
  ClassSession,
  ClassTimetableData,
  ClassTimetableDone,
  ClassTimetableInput,
  ClassTimetableProps,
  ClassTimetableResult,
} from "./class-timetable.types";

export type ClassTimetableDeps = {
  admin: StorefrontAdmin;
  runner: IdempotentRunner;
  identity: StorefrontIdentity;
  locale: "en" | "es";
  origin: string | null;
  now?: () => Date;
  createPurchase: (admin: StorefrontAdmin, input: PurchaseInput) => Promise<PurchaseResult>;
  createCheckout: (input: CheckoutSessionInput) => Promise<CheckoutSessionResult>;
  joinWaitlist: (
    admin: StorefrontAdmin,
    input: { tenantId: string; sessionId: string; customerName: string; customerEmail: string | null },
  ) => Promise<JoinWaitlistResult>;
  acceptWaitlistOffer: (
    admin: StorefrontAdmin,
    input: { tenantId: string; entryId: string; actorUserId: string | null; expectedStatus?: "offered" },
  ) => Promise<AcceptWaitlistResult>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 180;
const MAX_UNITS = 20;

type SessionRow = {
  id: string;
  title: string | null;
  starts_at: string;
  ends_at: string;
  venue_id: string | null;
  series_id: string | null;
  offering_id: string | null;
  status: string;
};

function window(props: ClassTimetableProps, now: Date): { from: Date; to: Date } {
  const from = props.from && !Number.isNaN(Date.parse(props.from)) ? new Date(props.from) : now;
  const cap = new Date(from.getTime() + MAX_WINDOW_DAYS * 86_400_000);
  let to = props.to && !Number.isNaN(Date.parse(props.to)) ? new Date(props.to) : new Date(from.getTime() + DEFAULT_WINDOW_DAYS * 86_400_000);
  if (to.getTime() > cap.getTime()) to = cap;
  if (to.getTime() <= from.getTime()) to = new Date(from.getTime() + 86_400_000);
  return { from, to };
}

async function remainingFor(
  admin: StorefrontAdmin,
  poolId: string,
  startsAt: string,
  endsAt: string,
): Promise<number | null> {
  if (!admin.rpc) return null;
  const { data, error } = await admin.rpc("capacity_remaining_public", {
    p_pool_id: poolId,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
  });
  if (error) return null;
  return typeof data === "number" ? data : null;
}

export async function readClassTimetableCore(
  deps: ClassTimetableDeps,
  tenantId: string,
  props: ClassTimetableProps,
): Promise<{ ok: true; data: ClassTimetableData } | { ok: false; reason: string }> {
  if (!UUID.test(tenantId)) return { ok: false, reason: "invalid_request" };
  const now = (deps.now ?? (() => new Date()))();
  const { from, to } = window(props, now);
  try {
    let q = deps.admin
      .from("sessions")
      .select("id, title, starts_at, ends_at, venue_id, series_id, offering_id, status")
      .eq("tenant_id", tenantId)
      .eq("status", "scheduled")
      .gte("starts_at", from.toISOString())
      .lte("starts_at", to.toISOString());
    if (Array.isArray(props.seriesIds)) q = q.in("series_id", props.seriesIds);
    const { data: rows, error } = await q.order("starts_at", { ascending: true });
    if (error) return { ok: false, reason: "unavailable" };
    const sessions = ((rows ?? []) as SessionRow[]).filter((r) => typeof r.offering_id === "string");

    const offeringIds = [...new Set(sessions.map((s) => s.offering_id as string))];
    const offerings = new Map<string, { amountCents: number | null; currency: string; published: boolean }>();
    if (offeringIds.length > 0) {
      const { data: offRows, error: offErr } = await deps.admin
        .from("talent_offerings")
        .select("id, status, amount_cents, currency")
        .eq("tenant_id", tenantId)
        .in("id", offeringIds);
      if (offErr) return { ok: false, reason: "unavailable" };
      for (const o of (offRows ?? []) as Array<Record<string, unknown>>) {
        offerings.set(String(o.id), {
          amountCents: o.amount_cents == null ? null : Number(o.amount_cents),
          currency: String(o.currency ?? "USD"),
          published: o.status === "published",
        });
      }
    }

    const ids = sessions.map((s) => s.id);
    const pools = new Map<string, { id: string; total: number | null }>();
    const zones = new Map<string, string>();
    const seriesTitles = new Map<string, { title: string; timezone: string | null }>();
    if (ids.length > 0) {
      const { data: poolRows, error: poolErr } = await deps.admin
        .from("capacity_pools")
        .select("id, subject_id, units_total")
        .eq("tenant_id", tenantId)
        .eq("subject_kind", "session_tier")
        .eq("pool_key", DEFAULT_TIER_KEY)
        .in("subject_id", ids);
      if (poolErr) return { ok: false, reason: "unavailable" };
      for (const p of (poolRows ?? []) as Array<Record<string, unknown>>) {
        pools.set(String(p.subject_id), {
          id: String(p.id),
          total: p.units_total == null ? null : Number(p.units_total),
        });
      }
      const venueIds = [...new Set(sessions.map((s) => s.venue_id).filter((v): v is string => !!v))];
      if (venueIds.length > 0) {
        const { data: venues, error: vErr } = await deps.admin.from("venues").select("id, timezone").in("id", venueIds);
        // A failed zone read is NOT "no zone": better no list than wrong times.
        if (vErr) return { ok: false, reason: "unavailable" };
        for (const v of (venues ?? []) as Array<Record<string, unknown>>) zones.set(String(v.id), String(v.timezone));
      }
      const seriesIds = [...new Set(sessions.map((s) => s.series_id).filter((v): v is string => !!v))];
      if (seriesIds.length > 0) {
        const { data: series } = await deps.admin.from("session_series").select("id, title, timezone").in("id", seriesIds);
        for (const s of (series ?? []) as Array<Record<string, unknown>>) {
          seriesTitles.set(String(s.id), {
            title: String(s.title ?? "Session"),
            timezone: typeof s.timezone === "string" && s.timezone.trim() ? s.timezone.trim() : null,
          });
        }
      }
    }

    // Waitlist counts, and the person's own entry when an e-mail was given.
    const waiting = new Map<string, number>();
    const mine = new Map<string, ClassSession["waitlist"]["mine"]>();
    if (props.waitlist !== false && ids.length > 0) {
      const { data: entries } = await deps.admin
        .from("session_waitlist_entries")
        .select("id, session_id, status, customer_email, offer_expires_at")
        .eq("tenant_id", tenantId)
        .in("session_id", ids)
        .in("status", ["waiting", "offered", "accepted"]);
      const email = props.email?.trim().toLowerCase() || null;
      for (const e of (entries ?? []) as Array<Record<string, unknown>>) {
        const sid = String(e.session_id);
        if (e.status === "waiting" || e.status === "offered") waiting.set(sid, (waiting.get(sid) ?? 0) + 1);
        if (email && typeof e.customer_email === "string" && e.customer_email.toLowerCase() === email) {
          const expires = typeof e.offer_expires_at === "string" ? e.offer_expires_at : null;
          const expired = e.status === "offered" && expires != null && Date.parse(expires) <= now.getTime();
          mine.set(sid, {
            entryId: String(e.id),
            status: expired ? "expired" : (String(e.status) as "waiting" | "offered" | "accepted"),
            offerExpiresAtIso: expires,
          });
        }
      }
    }

    const out: ClassSession[] = [];
    for (const row of sessions) {
      const offering = offerings.get(row.offering_id as string);
      if (!offering || !offering.published) continue;
      const zone =
        (row.venue_id ? zones.get(row.venue_id) : undefined) ??
        (row.series_id ? seriesTitles.get(row.series_id)?.timezone : undefined) ??
        null;
      if (!zone) continue;
      const pool = pools.get(row.id) ?? null;
      const remaining = pool ? await remainingFor(deps.admin, pool.id, row.starts_at, row.ends_at) : null;
      const soldOut = pool != null && remaining != null && remaining <= 0;
      out.push({
        id: row.id,
        seriesId: row.series_id,
        offeringId: row.offering_id as string,
        title: row.title || (row.series_id ? seriesTitles.get(row.series_id)?.title : undefined) || "Session",
        startsAtIso: new Date(row.starts_at).toISOString(),
        endsAtIso: new Date(row.ends_at).toISOString(),
        timezone: zone,
        amountCents: offering.amountCents,
        currency: offering.currency,
        seatsRemaining: remaining,
        seatsTotal: pool?.total ?? null,
        soldOut,
        waitlist: {
          open: props.waitlist !== false && soldOut,
          waiting: waiting.get(row.id) ?? 0,
          mine: mine.get(row.id) ?? null,
        },
      });
    }

    const prefill =
      deps.identity.userId && (deps.identity.email || deps.identity.displayName)
        ? { name: deps.identity.displayName, email: deps.identity.email }
        : null;
    return {
      ok: true,
      data: {
        series: [...seriesTitles.entries()].map(([id, s]) => ({ id, title: s.title, timezone: s.timezone })),
        sessions: out,
        fromIso: from.toISOString(),
        toIso: to.toISOString(),
        prefill,
      },
    };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

function contactGiven(c: { name: string; email: string; phone?: string | null } | undefined): boolean {
  if (!c) return false;
  return Boolean((c.name ?? "").trim()) && Boolean((c.email ?? "").trim() || (c.phone ?? "").trim());
}

export async function actClassTimetableCore(
  deps: ClassTimetableDeps,
  input: ClassTimetableInput,
): Promise<ClassTimetableResult> {
  if (!input || !UUID.test(input.tenantId ?? "")) return mapEngineRefusal("invalid_request", deps.locale);
  switch (input.op) {
    case "book":
      return bookSeat(deps, input);
    case "join_waitlist":
      return joinQueue(deps, input);
    case "accept_offer":
      return acceptOffer(deps, input);
    default:
      return mapEngineRefusal("invalid_request", deps.locale);
  }
}

async function loadSession(deps: ClassTimetableDeps, tenantId: string, sessionId: string) {
  const { data, error } = await deps.admin
    .from("sessions")
    .select("id, tenant_id, offering_id, title, starts_at, ends_at, status, venue_id, series_id")
    .eq("id", sessionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) return { ok: false as const, code: "unavailable" };
  if (!data) return { ok: false as const, code: "session_not_found" };
  return { ok: true as const, row: data as SessionRow & { offering_id: string | null } };
}

async function bookSeat(
  deps: ClassTimetableDeps,
  input: Extract<ClassTimetableInput, { op: "book" }>,
): Promise<ClassTimetableResult> {
  if (!UUID.test(input.sessionId) || typeof input.clientOrderKey !== "string" || input.clientOrderKey.length < 8) {
    return mapEngineRefusal("invalid_request", deps.locale);
  }
  const units = Number.isInteger(input.units) && input.units > 0 && input.units <= MAX_UNITS ? input.units : null;
  if (!units) return mapEngineRefusal("invalid_units", deps.locale);
  if (!contactGiven(input.contact)) return mapEngineRefusal("identity_required", deps.locale);
  const email = input.contact.email.trim().toLowerCase();

  const outcome = await deps.runner<ClassTimetableResult>({
    command: "storefront.class.book",
    tenantId: input.tenantId,
    actorUserId: deps.identity.userId,
    key: input.clientOrderKey,
    args: { sessionId: input.sessionId, units, email, payment: input.payment ?? "full" },
    run: async () => {
      const now = (deps.now ?? (() => new Date()))();
      const loaded = await loadSession(deps, input.tenantId, input.sessionId);
      if (!loaded.ok) return mapEngineRefusal(loaded.code, deps.locale);
      const session = loaded.row;
      if (session.status !== "scheduled" || !session.offering_id) return mapEngineRefusal("not_open", deps.locale);
      if (Date.parse(session.ends_at) <= now.getTime()) return mapEngineRefusal("session_already_ended", deps.locale);

      const { data: pool, error: poolErr } = await deps.admin
        .from("capacity_pools")
        .select("id")
        .eq("tenant_id", input.tenantId)
        .eq("subject_kind", "session_tier")
        .eq("subject_id", session.id)
        .eq("pool_key", DEFAULT_TIER_KEY)
        .maybeSingle();
      if (poolErr) return mapEngineRefusal("unavailable", deps.locale);
      // No pool means this session sells nothing; an unbounded sale is the oversell.
      if (!pool) return mapEngineRefusal("no_seats_configured", deps.locale);
      const request = tierReserveRequest(
        { id: session.id, startsAt: session.starts_at, endsAt: session.ends_at },
        String(pool.id),
        units,
      );
      if (!request) return mapEngineRefusal("engine_error", deps.locale);

      const result = await deps.createPurchase(deps.admin, {
        tenantId: input.tenantId,
        clientOrderKey: input.clientOrderKey,
        actorUserId: deps.identity.userId,
        contact: { email, phone: input.contact.phone?.trim() || null, displayName: input.contact.name.trim() },
        lines: [{ offeringId: session.offering_id, units, sessionId: session.id }],
        paymentChoice: input.payment === "in_person" ? "in_person" : "full",
        sourceChannel: "storefront_class",
        sourcePage: input.sourcePage ?? null,
        capacity: [
          {
            offeringId: session.offering_id,
            poolId: request.poolId,
            startsAt: request.startsAt,
            endsAt: request.endsAt,
            units: request.units,
          },
        ],
        locale: deps.locale,
      });
      if (!result.ok) return mapEngineRefusal(result, deps.locale);

      const { data: orderRow } = await deps.admin
        .from("orders")
        .select("id, receipt_code, currency")
        .eq("id", result.orderId)
        .maybeSingle();
      const receiptCode = typeof orderRow?.receipt_code === "string" ? orderRow.receipt_code : null;

      let checkoutUrl: string | null = null;
      if (result.collectCents > 0 && result.transactionId && result.bookingId && deps.origin) {
        const session2 = await deps.createCheckout({
          transactionId: result.transactionId,
          amountCents: result.collectCents,
          currency: String(orderRow?.currency ?? "USD"),
          payerEmail: email,
          inquiryId: result.inquiryId,
          bookingId: result.bookingId,
          successUrl: receiptCode ? `${deps.origin}/r/${receiptCode}?paid=1` : `${deps.origin}/checkout/success`,
          cancelUrl: `${deps.origin}${input.sourcePage ?? "/"}`,
          description: session.title ?? "Class",
          locale: deps.locale,
        });
        if (session2.ok) checkoutUrl = session2.url;
      }
      const zone = await zoneFor(deps, session);
      const done: ClassTimetableDone = {
        ok: true,
        op: "book",
        orderId: result.orderId,
        collectCents: result.collectCents,
        checkoutUrl,
        receiptCode,
        session: {
          id: session.id,
          title: session.title ?? "Session",
          startsAtIso: new Date(session.starts_at).toISOString(),
          endsAtIso: new Date(session.ends_at).toISOString(),
          timezone: zone ?? "UTC",
        },
        replayed: false,
      };
      return done;
    },
  });
  switch (outcome.status) {
    case "ok":
      return outcome.result.ok && outcome.result.op === "book"
        ? { ...outcome.result, replayed: outcome.replayed }
        : outcome.result;
    case "refused":
      return outcome.result;
    case "conflict":
      return mapEngineRefusal(outcome.code, deps.locale);
    case "error":
      return mapEngineRefusal("engine_error", deps.locale);
  }
}

async function zoneFor(deps: ClassTimetableDeps, session: SessionRow): Promise<string | null> {
  if (session.venue_id) {
    const { data } = await deps.admin.from("venues").select("id, timezone").eq("id", session.venue_id).maybeSingle();
    if (data && typeof data.timezone === "string") return data.timezone;
  }
  if (session.series_id) {
    const { data } = await deps.admin.from("session_series").select("id, timezone").eq("id", session.series_id).maybeSingle();
    if (data && typeof data.timezone === "string" && data.timezone.trim()) return data.timezone.trim();
  }
  return null;
}

async function joinQueue(
  deps: ClassTimetableDeps,
  input: Extract<ClassTimetableInput, { op: "join_waitlist" }>,
): Promise<ClassTimetableResult> {
  if (!UUID.test(input.sessionId)) return mapEngineRefusal("invalid_request", deps.locale);
  if (!contactGiven(input.contact)) return mapEngineRefusal("identity_required", deps.locale);
  const email = input.contact.email.trim().toLowerCase();
  const joined = await deps.joinWaitlist(deps.admin, {
    tenantId: input.tenantId,
    sessionId: input.sessionId,
    customerName: input.contact.name.trim(),
    customerEmail: email,
  });
  if (joined.ok) return { ok: true, op: "join_waitlist", entryId: joined.entryId, already: false };
  // Idempotent by (session, e-mail): the partial unique index is the key, and
  // a second tap hands back the SAME entry rather than a refusal.
  if (joined.refusalKey === "alreadyWaiting") {
    const { data } = await deps.admin
      .from("session_waitlist_entries")
      .select("id, status, customer_email")
      .eq("tenant_id", input.tenantId)
      .eq("session_id", input.sessionId)
      .eq("customer_email", email)
      .in("status", ["waiting", "offered"])
      .limit(1)
      .maybeSingle();
    if (data && typeof data.id === "string") return { ok: true, op: "join_waitlist", entryId: data.id, already: true };
  }
  return mapEngineRefusal(joined, deps.locale);
}

async function acceptOffer(
  deps: ClassTimetableDeps,
  input: Extract<ClassTimetableInput, { op: "accept_offer" }>,
): Promise<ClassTimetableResult> {
  if (!UUID.test(input.entryId)) return mapEngineRefusal("invalid_request", deps.locale);
  const email = (input.email ?? "").trim().toLowerCase();
  if (!email) return mapEngineRefusal("identity_required", deps.locale);
  const { data: entry, error } = await deps.admin
    .from("session_waitlist_entries")
    .select("id, status, customer_email, offer_expires_at")
    .eq("id", input.entryId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (error) return mapEngineRefusal("unavailable", deps.locale);
  // The id is not a capability: the e-mail on the entry has to match.
  if (!entry || String(entry.customer_email ?? "").toLowerCase() !== email) {
    return mapEngineRefusal("not_found", deps.locale);
  }
  if (entry.status === "accepted") return { ok: true, op: "accept_offer", entryId: input.entryId, already: true };
  if (entry.status !== "offered") return mapEngineRefusal("not_offered", deps.locale);
  const now = (deps.now ?? (() => new Date()))();
  if (typeof entry.offer_expires_at === "string" && Date.parse(entry.offer_expires_at) <= now.getTime()) {
    return mapEngineRefusal("offer_expired", deps.locale);
  }
  const accepted = await deps.acceptWaitlistOffer(deps.admin, {
    tenantId: input.tenantId,
    entryId: input.entryId,
    actorUserId: deps.identity.userId,
    expectedStatus: "offered",
  });
  if (!accepted.ok) return mapEngineRefusal(accepted, deps.locale);
  return { ok: true, op: "accept_offer", entryId: accepted.entryId, already: accepted.already };
}
