/**
 * quote.ts: the pure promo pricing engine (design A2, A5-A7, G3, L3, L6).
 *
 * No DB, no clock reads, no Stripe. The caller counts usage from redemption
 * rows and passes `now`. Status is computed here, never stored.
 *
 * Integer minor units throughout; percent math is done on a basis-point
 * numerator so no float ever touches money.
 */

import { PASS_THROUGH_DEFAULT_TAKE_BPS } from "../billing/commission";
import { chargeMinimumMinor } from "../payments/charge-minimums";
import {
  boundKey,
  hhmmToMinutes,
  isRepeatedHourSecondPass,
  localParts,
} from "./local-time";
import type {
  AppliedPromo,
  CartLine,
  Client,
  Promo,
  PromoSource,
  PromoStatus,
  PromoUsage,
  QuoteGift,
  QuoteInput,
  QuoteLine,
  QuoteResult,
  RejectReason,
  Unlocked,
} from "./types";

/** Q6: price promos stop at 90% off. 100% is the separate Cortesia action. */
export const MAX_DISCOUNT_BPS = 9000;
/** Q1: the 1.5% platform fee, on the charged (discounted) price. */
export const PROMO_FEE_BPS = PASS_THROUGH_DEFAULT_TAKE_BPS;

/** Currencies whose final prices round to whole major units (L6). */
const WHOLE_UNIT_CURRENCIES: ReadonlySet<string> = new Set(["MXN"]);

const toMs = (now: string | Date): number => (now instanceof Date ? now.getTime() : Date.parse(now));

/** round(n / d), half-up, for non-negative integers. */
function divHalfUp(n: number, d: number): number {
  return Math.floor((2 * n + d) / (2 * d));
}

function roundFinal(cents: number, currency: string): number {
  return WHOLE_UNIT_CURRENCIES.has(currency.toUpperCase()) ? divHalfUp(cents, 100) * 100 : cents;
}

export function feeCents(chargedCents: number): number {
  return divHalfUp(chargedCents * PROMO_FEE_BPS, 10_000);
}

function sourceOf(p: Promo): PromoSource {
  if (p.audience === "one_client" || p.is_single_use) return "personal";
  return p.unlock === "auto" ? "auto" : p.unlock;
}
const SOURCE_RANK: Readonly<Record<PromoSource, number>> = { personal: 0, code: 1, link: 1, auto: 2 };

/** Window check for one reference instant. Returns null when it qualifies. */
function whenReason(p: Promo, refMs: number): RejectReason | null {
  const lp = localParts(refMs, p.tz);
  if (p.starts_at && lp.key < boundKey(p.starts_at, p.tz, "start")) return "not_started";
  if (p.ends_at && lp.key > boundKey(p.ends_at, p.tz, "end")) return "expired";

  const hasWindow = Boolean(p.time_from && p.time_to);
  let inWindow = true;
  // A window belongs to the weekday it STARTS on (L3), so the owner day of a
  // slot after midnight is the previous local day.
  let ownerDay = lp.weekday;
  if (hasWindow) {
    const from = hhmmToMinutes(p.time_from ?? "");
    const to = hhmmToMinutes(p.time_to ?? "");
    if (from < to) {
      inWindow = lp.minutes >= from && lp.minutes < to;
    } else if (lp.minutes >= from) {
      inWindow = true;
    } else if (lp.minutes < to) {
      inWindow = true;
      ownerDay = (lp.weekday + 6) % 7;
    } else {
      inWindow = false;
    }
  }
  if (p.weekdays && p.weekdays.length > 0 && !p.weekdays.includes(ownerDay)) return "wrong_day";
  if (!inWindow) return "wrong_time";
  if (hasWindow && isRepeatedHourSecondPass(refMs, p.tz)) return "wrong_time";
  return null;
}

function inScope(p: Promo, line: CartLine): boolean {
  if (p.scope === "services" && line.kind === "product") return false;
  if (p.scope === "products" && line.kind !== "product") return false;
  const ids = p.target_ids ?? [];
  return ids.length === 0 || ids.includes(line.target_id);
}

/** Line-level eligibility, null when the line qualifies. */
function lineReason(p: Promo, line: CartLine, nowMs: number): RejectReason | null {
  if (line.currency.toUpperCase() !== p.currency.toUpperCase() && p.offer_kind !== "percent") return "not_applicable";
  if (!inScope(p, line)) return "not_applicable";
  if (p.slot_id && line.slot_id !== p.slot_id) return "wrong_time";
  const apptMs = line.appointment_start ? Date.parse(line.appointment_start) : null;
  // Products have no appointment, so an appointment-basis promo reads `now`.
  const refMs = p.applies_on === "appointment" && apptMs !== null ? apptMs : nowMs;
  const w = whenReason(p, refMs);
  if (w) return w;
  if (p.applies_on === "purchase" && p.use_by_date && apptMs !== null) {
    if (localParts(apptMs, p.tz).key > boundKey(p.use_by_date, p.tz, "end")) return "use_by_passed";
  }
  return null;
}

function audienceOk(p: Promo, client: Client): boolean {
  if (p.is_single_use || p.audience === "one_client") {
    if (!p.customer_id || client.customerId !== p.customer_id) return false;
  }
  switch (p.audience) {
    case "new_clients":
      return client.status === "new";
    // A lapsed client has prior visits, so they are returning too.
    case "returning":
      return client.status === "returning" || client.status === "lapsed";
    case "lapsed":
      return client.status === "lapsed";
    default:
      return true;
  }
}

function unlockedOk(p: Promo, u: Unlocked): boolean {
  if (p.unlock === "auto") return true;
  if (p.unlock === "link") return u.linkPromoIds.includes(p.id);
  const code = (p.code ?? "").trim().toUpperCase();
  return code !== "" && u.codes.some((c) => c.trim().toUpperCase() === code);
}

function effectiveMaxUses(p: Promo): number | null {
  if (p.is_single_use) return 1;
  return p.max_uses ?? null;
}

/** Promo-level gate, before any line is looked at. */
function promoReason(p: Promo, client: Client, usage: PromoUsage | undefined, u: Unlocked): RejectReason | null {
  if (p.archived_at) return "archived";
  if (p.is_draft) return "draft";
  if (p.is_paused) return "paused";
  if (!unlockedOk(p, u)) return "locked";
  if (!audienceOk(p, client)) return "audience";
  const max = effectiveMaxUses(p);
  if (max !== null && (usage?.used ?? 0) >= max) return "sold_out";
  if (p.per_client_max != null && (usage?.usedByClient ?? 0) >= p.per_client_max) return "client_limit";
  return null;
}

/** Final price of one line under one price promo, after the 90% cap. */
function priceUnder(p: Promo, line: CartLine): number {
  const total = line.list_cents * line.qty;
  let final: number;
  if (p.offer_kind === "percent") {
    const bps = Math.min(10_000, Math.max(0, Math.round(p.value * 100)));
    const n = total * (10_000 - bps);
    final = WHOLE_UNIT_CURRENCIES.has(line.currency.toUpperCase())
      ? divHalfUp(n, 1_000_000) * 100
      : divHalfUp(n, 10_000);
  } else if (p.offer_kind === "fixed") {
    final = roundFinal(Math.max(0, total - p.value), line.currency);
  } else {
    final = roundFinal(Math.max(0, p.value * line.qty), line.currency);
  }
  // The cap is a minimum final price; round it UP to the currency unit.
  const unit = WHOLE_UNIT_CURRENCIES.has(line.currency.toUpperCase()) ? 100 : 1;
  const capMin = Math.ceil((total * (10_000 - MAX_DISCOUNT_BPS)) / 10_000 / unit) * unit;
  final = Math.max(final, Math.min(capMin, total), 0);
  return Math.min(final, total);
}

/** Ends sooner first; open-ended promos sort last. */
function endKey(p: Promo): string {
  return p.ends_at ? boundKey(p.ends_at, p.tz, "end") : "9999";
}

export function quote(input: QuoteInput): QuoteResult {
  const { cart, client, promos, usage, unlocked } = input;
  const nowMs = toMs(input.now);
  const currency = (cart[0]?.currency ?? "USD").toUpperCase();
  if (cart.some((l) => l.currency.toUpperCase() !== currency)) {
    throw new Error("quote: a cart has one currency");
  }

  const rejected: QuoteResult["rejected"] = [];
  const priceCandidates: { promo: Promo; lines: CartLine[] }[] = [];
  const gifts: QuoteGift[] = [];
  const applied: AppliedPromo[] = [];

  for (const p of promos) {
    const gate = promoReason(p, client, usage[p.id], unlocked);
    if (gate) {
      rejected.push({ promoId: p.id, reason: gate });
      continue;
    }
    const ok: CartLine[] = [];
    let firstReason: RejectReason | null = null;
    for (const line of cart) {
      const r = lineReason(p, line, nowMs);
      if (r === null) ok.push(line);
      // Prefer a specific reason (wrong_day) over a generic one.
      else if (firstReason === null || (firstReason === "not_applicable" && r !== "not_applicable")) firstReason = r;
    }
    if (ok.length === 0) {
      rejected.push({ promoId: p.id, reason: firstReason ?? "not_applicable" });
      continue;
    }
    const covered = ok.reduce((s, l) => s + l.list_cents * l.qty, 0);
    if (p.min_subtotal_cents != null && covered < p.min_subtotal_cents) {
      rejected.push({ promoId: p.id, reason: "below_minimum" });
      continue;
    }
    if (p.offer_kind === "free_addon") {
      if (!p.addon) {
        rejected.push({ promoId: p.id, reason: "not_applicable" });
        continue;
      }
      // Q3: free extras stack alongside the one price promo.
      gifts.push({ promoId: p.id, addonId: p.addon.id, value_cents: p.addon.list_cents });
      applied.push({ promoId: p.id, kind: "gift", source: sourceOf(p), lineIds: ok.map((l) => l.id), discount_cents: 0 });
      continue;
    }
    priceCandidates.push({ promo: p, lines: ok });
  }

  // One price promo per line: best saving wins, then personal > code/link > auto,
  // then ends sooner, then id for a stable answer.
  const lines: QuoteLine[] = [];
  const usedBy = new Map<string, { lineIds: string[]; discount: number }>();
  for (const line of cart) {
    const total = line.list_cents * line.qty;
    let best: { promo: Promo; final: number } | null = null;
    for (const c of priceCandidates) {
      if (!c.lines.includes(line)) continue;
      const final = priceUnder(c.promo, line);
      if (final >= total) continue;
      if (!best || better(c.promo, final, best.promo, best.final)) best = { promo: c.promo, final };
    }
    if (best) {
      const entry = usedBy.get(best.promo.id) ?? { lineIds: [], discount: 0 };
      entry.lineIds.push(line.id);
      entry.discount += total - best.final;
      usedBy.set(best.promo.id, entry);
    }
    const final = best?.final ?? total;
    lines.push({ lineId: line.id, list_cents: total, discount_cents: total - final, final_cents: final, promoId: best?.promo.id ?? null });
  }

  for (const c of priceCandidates) {
    const u = usedBy.get(c.promo.id);
    if (!u) {
      // Lost to a better deal (or saved nothing): reported, never consumed.
      const savesAnything = c.lines.some((l) => priceUnder(c.promo, l) < l.list_cents * l.qty);
      rejected.push({ promoId: c.promo.id, reason: savesAnything ? "outranked" : "not_applicable" });
      continue;
    }
    applied.push({ promoId: c.promo.id, kind: "price", source: sourceOf(c.promo), lineIds: u.lineIds, discount_cents: u.discount });
  }

  const list = lines.reduce((s, l) => s + l.list_cents, 0);
  const discount = lines.reduce((s, l) => s + l.discount_cents, 0);
  const finals = lines.reduce((s, l) => s + l.final_cents, 0);
  // A7.6: a promo that pushes the total under Stripe's minimum makes it a free
  // booking (no charge, no fee). Only a discount triggers it; an unknown
  // currency floor never does.
  const min = chargeMinimumMinor(currency);
  const freeBooking = discount > 0 && finals > 0 && min !== null && finals < min;
  const charged = freeBooking ? 0 : finals;

  return {
    currency,
    lines,
    gifts,
    applied,
    rejected,
    totals: {
      list_cents: list,
      discount_cents: discount,
      waived_cents: freeBooking ? finals : 0,
      charged_cents: charged,
      fee_cents: feeCents(charged),
    },
    free_booking: freeBooking,
  };
}

function better(a: Promo, aFinal: number, b: Promo, bFinal: number): boolean {
  if (aFinal !== bFinal) return aFinal < bFinal;
  const ra = SOURCE_RANK[sourceOf(a)];
  const rb = SOURCE_RANK[sourceOf(b)];
  if (ra !== rb) return ra < rb;
  const ea = endKey(a);
  const eb = endKey(b);
  if (ea !== eb) return ea < eb;
  return a.id < b.id;
}

/** B: status is derived from flags, the window and usage. Nothing is stored. */
export function promoStatus(promo: Promo, now: string | Date, usage?: Pick<PromoUsage, "used"> | null): PromoStatus {
  if (promo.archived_at) return "archived";
  if (promo.is_draft) return "draft";
  const key = localParts(toMs(now), promo.tz).key;
  if (promo.ends_at && key > boundKey(promo.ends_at, promo.tz, "end")) return "expired";
  if (promo.is_paused) return "paused";
  if (promo.starts_at && key < boundKey(promo.starts_at, promo.tz, "start")) return "scheduled";
  const max = effectiveMaxUses(promo);
  if (max !== null && (usage?.used ?? 0) >= max) return "sold_out";
  return "live";
}
