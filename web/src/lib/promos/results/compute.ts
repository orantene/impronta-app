/**
 * Promo results (design doc F). Pure: rows in, numbers out.
 *
 * Money is integer minor units. "Earned" is net of the discount and is ALWAYS
 * shown next to "given" (no vanity metrics without context). Only confirmed
 * redemptions count; held / voided / released rows never reach a result.
 */

export type ResultRedemption = {
  promo_code_id: string;
  status: string;
  list_cents: number | null;
  discount_cents: number | null;
  currency?: string | null;
  source_channel: string | null;
  client_status: string | null;
  /** false = a gifted add-on (courtesy): its discount_cents is the gifted value. */
  is_price_promo?: boolean | null;
  created_at: string;
};

export type ResultEvent = { promo_id: string; kind: string; at: string };

export type PromoResult = {
  promoId: string;
  bookings: number;
  /** Net of discount, before fees. Gift rows contribute their full list price. */
  earnedCents: number;
  /** Price discounts handed out (gifts are counted apart). */
  givenCents: number;
  /** Value of free add-ons (courtesy). */
  giftedCents: number;
  grossCents: number;
  newClients: number;
  returningClients: number;
  lapsedClients: number;
  linkOpens: number;
  /** Confirmed bookings by source channel ("unknown" when none recorded). */
  bySource: Readonly<Record<string, number>>;
  /** Hours from the start to the booking that used the last spot; null if not sold out. */
  soldOutHours: number | null;
  /** given / gross, 0..1 (0 when no gross). */
  discountShare: number;
};

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const ms = (iso: string) => new Date(iso).getTime();

export function computePromoResult(input: {
  promoId: string;
  rows: readonly ResultRedemption[];
  events?: readonly ResultEvent[];
  maxUses?: number | null;
  /** When the promo went live (ISO). Falls back to its first booking. */
  startedAt?: string | null;
}): PromoResult {
  const rows = input.rows
    .filter((r) => r.promo_code_id === input.promoId && r.status === "confirmed")
    .slice()
    .sort((a, b) => ms(a.created_at) - ms(b.created_at));

  let earned = 0, given = 0, gifted = 0, gross = 0;
  let nw = 0, back = 0, lapsed = 0;
  const bySource: Record<string, number> = {};
  for (const r of rows) {
    const list = n(r.list_cents);
    const disc = n(r.discount_cents);
    if (r.is_price_promo === false) {
      gifted += disc;
      earned += list;
      gross += list;
    } else {
      given += disc;
      earned += Math.max(0, list - disc);
      gross += list;
    }
    if (r.client_status === "new") nw += 1;
    else if (r.client_status === "returning") back += 1;
    else if (r.client_status === "lapsed") lapsed += 1;
    const ch = r.source_channel ?? "unknown";
    bySource[ch] = (bySource[ch] ?? 0) + 1;
  }

  const opens = (input.events ?? []).filter((e) => e.promo_id === input.promoId && e.kind === "link_open").length;

  let soldOutHours: number | null = null;
  const max = input.maxUses ?? null;
  if (max && max > 0 && rows.length >= max) {
    const last = rows[max - 1]!;
    const from = input.startedAt ? ms(input.startedAt) : ms(rows[0]!.created_at);
    soldOutHours = Math.max(0, Math.round((ms(last.created_at) - from) / 3_600_000));
  }

  return {
    promoId: input.promoId,
    bookings: rows.length,
    earnedCents: earned,
    givenCents: given,
    giftedCents: gifted,
    grossCents: gross,
    newClients: nw,
    returningClients: back,
    lapsedClients: lapsed,
    linkOpens: opens,
    bySource,
    soldOutHours,
    discountShare: gross > 0 ? given / gross : 0,
  };
}

export type MonthRollup = {
  bookings: number;
  earnedCents: number;
  givenCents: number;
  giftedCents: number;
  newClients: number;
  returningClients: number;
};

/** "This month": every confirmed redemption with created_at in [fromIso, toIso). */
export function computeMonthRollup(input: {
  rows: readonly ResultRedemption[];
  fromIso: string;
  toIso: string;
}): MonthRollup {
  const from = ms(input.fromIso), to = ms(input.toIso);
  const inRange = input.rows.filter((r) => r.status === "confirmed" && ms(r.created_at) >= from && ms(r.created_at) < to);
  let earned = 0, given = 0, gifted = 0, nw = 0, back = 0;
  for (const r of inRange) {
    const list = n(r.list_cents), disc = n(r.discount_cents);
    if (r.is_price_promo === false) { gifted += disc; earned += list; }
    else { given += disc; earned += Math.max(0, list - disc); }
    if (r.client_status === "new") nw += 1;
    else if (r.client_status === "returning" || r.client_status === "lapsed") back += 1;
  }
  return { bookings: inRange.length, earnedCents: earned, givenCents: given, giftedCents: gifted, newClients: nw, returningClients: back };
}

/** First and last instants of the month containing `now`, in UTC (callers pass their tz-aware bounds when they need local months). */
export function monthBounds(now: Date): { fromIso: string; toIso: string } {
  const from = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const to = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return { fromIso: new Date(from).toISOString(), toIso: new Date(to).toISOString() };
}

// ── Tips (F suggestions engine, rules only) ────────────────────────────────

export type TipId = "sold_out_fast" | "low_use" | "mostly_returning" | "discount_heavy";

export type Tip = { id: TipId; severity: "info" | "warning" };

export function promoTips(input: {
  result: PromoResult;
  maxUses?: number | null;
  /** Audience of the promo; "new_clients" is the intent that returning clients undermine. */
  audience?: string | null;
  /** Only evaluate "low use" once the promo has ended. */
  ended?: boolean;
}): Tip[] {
  const { result: r } = input;
  const tips: Tip[] = [];
  if (r.soldOutHours !== null && r.soldOutHours < 24) tips.push({ id: "sold_out_fast", severity: "info" });
  const max = input.maxUses ?? null;
  if (input.ended && max && max > 0 && r.bookings / max < 0.3) tips.push({ id: "low_use", severity: "info" });
  if (input.audience === "new_clients" && r.bookings > 0 && r.returningClients + r.lapsedClients > r.newClients) {
    tips.push({ id: "mostly_returning", severity: "info" });
  }
  if (r.grossCents > 0 && r.discountShare > 0.4) tips.push({ id: "discount_heavy", severity: "warning" });
  return tips;
}
