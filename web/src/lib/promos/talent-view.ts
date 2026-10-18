/**
 * View helpers for the talent Promos page (design D2, D1). Pure.
 * Tabs, progress, attention dot, money formatting.
 */

import { formatPrice } from "@/lib/money/format-price";
import { boundKey, dayDiff, localParts } from "./local-time";
import type { Promo, PromoStatus } from "./types";

export type PromoTab = "live" | "scheduled" | "past";

/** Live holds paused and sold out (they are still "running"); drafts wait with scheduled. */
export function tabOf(status: PromoStatus): PromoTab {
  switch (status) {
    case "live":
    case "paused":
    case "sold_out":
      return "live";
    case "scheduled":
    case "draft":
      return "scheduled";
    default:
      return "past";
  }
}

export type TabbedItem = { id: string; status: PromoStatus; created_at: string; ends_at: string | null; tz: string };

export function groupByTab<T extends TabbedItem>(items: readonly T[]): Record<PromoTab, T[]> {
  const out: Record<PromoTab, T[]> = { live: [], scheduled: [], past: [] };
  for (const it of items) out[tabOf(it.status)].push(it);
  // Live: ending soonest first (open-ended last). Others: newest first.
  out.live.sort((a, b) => endSortKey(a).localeCompare(endSortKey(b)) || (a.id < b.id ? -1 : 1));
  out.scheduled.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  out.past.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return out;
}

function endSortKey(i: TabbedItem): string {
  return i.ends_at ? boundKey(i.ends_at, i.tz, "end") : "9999";
}

export type Progress = { used: number; max: number | null; left: number | null; pct: number };

export function progressOf(promo: Pick<Promo, "max_uses" | "is_single_use">, used: number): Progress {
  const max = promo.is_single_use ? 1 : promo.max_uses ?? null;
  if (max === null) return { used, max, left: null, pct: 0 };
  return { used, max, left: Math.max(0, max - used), pct: Math.min(100, Math.round((used / max) * 100)) };
}

export type AttentionKind = "sold_out" | "ending_soon";

export const ENDING_SOON_HOURS = 48;

export function promoAttention(
  items: readonly { id: string; status: PromoStatus; promo: Pick<Promo, "ends_at" | "tz"> }[],
  now: string | Date,
  hasSuggestion = false,
): { promoId: string | null; kind: AttentionKind | "suggestion" }[] {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const out: { promoId: string | null; kind: AttentionKind | "suggestion" }[] = [];
  for (const it of items) {
    if (it.status === "sold_out") out.push({ promoId: it.id, kind: "sold_out" });
    else if (it.status === "live" && it.promo.ends_at) {
      const nowKey = localParts(nowMs, it.promo.tz).key;
      const endKey = boundKey(it.promo.ends_at, it.promo.tz, "end");
      const hours = (Date.parse(`${endKey}Z`) - Date.parse(`${nowKey}Z`)) / 3_600_000;
      if (hours >= 0 && hours <= ENDING_SOON_HOURS) out.push({ promoId: it.id, kind: "ending_soon" });
    }
  }
  if (hasSuggestion) out.push({ promoId: null, kind: "suggestion" });
  return out;
}

/** Whole local days from today to an end date (negative once past). */
export function daysLeft(endDate: string, today: string): number {
  return dayDiff(today, endDate);
}

/** Major-unit display, whole pesos for MXN. Minor units in. */
export function formatMoney(cents: number, currency: string, locale: string): string {
  const cur = currency.toUpperCase();
  // MXN prints whole pesos here; the one formatter owns symbol, code and grouping.
  const amountCents = cur === "MXN" ? Math.round(cents / 100) * 100 : cents;
  return formatPrice({ amountCents, currency: cur, locale, audience: "talent" }).primary;
}

/** "mar 13 oct" style short date from "YYYY-MM-DD". */
export function formatShortDate(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale.startsWith("es") ? "es-MX" : "en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}
