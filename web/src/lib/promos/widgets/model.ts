/**
 * Promo widget model (TUL-1051 part B). Pure: no I/O, no React, no clock reads
 * (callers pass `nowMs`). Every rule the block applies lives here so it is
 * tested without a DOM:
 *   - which live promo a block shows (a chosen one, or the best),
 *   - who may see it (audience), when (schedule), and where (pages),
 *   - the popup frequency cap, and the countdown arithmetic.
 *
 * Audience here is a DISPLAY rule for the widget ("show this to returning
 * visitors"). Whether the client actually gets the price is still decided by
 * quote() at booking, never by a widget.
 */

import { boundKey, localParts } from "../local-time";
import type { Promo } from "../types";
import { widgetCopy } from "./copy";
import type {
  PromoWidgetAudience,
  PromoWidgetFrequency,
  PromoWidgetOptions,
  PromoWidgetPagesMode,
  WidgetPromo,
  WidgetView,
} from "./types";

// ── time ───────────────────────────────────────────────────────────────

const LOCAL_KEY = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;

/** The instant at which `tz` shows the local wall-clock `key` ("YYYY-MM-DDTHH:MM:SS"). */
export function localKeyToMs(key: string, tz: string): number | null {
  const m = LOCAL_KEY.exec(key);
  if (!m) return null;
  const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  if (!Number.isFinite(wall)) return null;
  let guess = wall;
  for (let i = 0; i < 3; i += 1) {
    const next = wall - localParts(guess, tz).offsetMinutes * 60_000;
    if (next === guess) break;
    guess = next;
  }
  return guess;
}

/** The end of a promo's window as an instant (date-only ends run to 23:59:59 local). */
export function promoEndsAtMs(promo: Pick<Promo, "ends_at" | "tz">): number | null {
  if (!promo.ends_at) return null;
  return localKeyToMs(boundKey(promo.ends_at, promo.tz, "end"), promo.tz);
}

export type CountdownBreakdown = { d: number; h: number; m: number; s: number };

export function countdownBreakdown(endsAtMs: number, nowMs: number): CountdownBreakdown | null {
  const left = endsAtMs - nowMs;
  if (!Number.isFinite(left) || left <= 0) return null;
  const secs = Math.floor(left / 1000);
  return { d: Math.floor(secs / 86_400), h: Math.floor((secs % 86_400) / 3600), m: Math.floor((secs % 3600) / 60), s: secs % 60 };
}

const SCHEDULE_VALUE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?)?$/;

/** The block's own window, in the promo's timezone. Unset or malformed bounds are ignored. */
export function scheduleOpen(nowMs: number, startsAt: string | undefined, endsAt: string | undefined, tz: string): boolean {
  const key = localParts(nowMs, tz).key;
  const start = startsAt?.trim();
  const end = endsAt?.trim();
  if (start && SCHEDULE_VALUE.test(start) && key < boundKey(start, tz, "start")) return false;
  if (end && SCHEDULE_VALUE.test(end) && key > boundKey(end, tz, "end")) return false;
  return true;
}

// ── who ────────────────────────────────────────────────────────────────

export type WidgetViewer = { returning: boolean; signedIn: boolean };

export function audienceVisible(audience: PromoWidgetAudience | undefined, viewer: WidgetViewer): boolean {
  switch (audience ?? "everyone") {
    case "new": return !viewer.returning;
    case "returning": return viewer.returning;
    case "signed_in": return viewer.signedIn;
    case "guest": return !viewer.signedIn;
    default: return true;
  }
}

// ── where ──────────────────────────────────────────────────────────────

const LOCALE_PREFIX = /^\/(?:es|en|fr|pt|de|it)(?=\/|$)/;

export function normalizePath(raw: string): string {
  const noQuery = (raw.split(/[?#]/)[0] ?? "").trim();
  const noLocale = noQuery.replace(LOCALE_PREFIX, "");
  const withSlash = noLocale.startsWith("/") ? noLocale : `/${noLocale}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : "/";
}

export function parsePagePatterns(pages: string | undefined): string[] {
  return (pages ?? "")
    .split(/[\n,]+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function patternMatches(pattern: string, path: string): boolean {
  if (pattern.endsWith("*")) {
    const prefix = normalizePath(pattern.slice(0, -1) || "/");
    return prefix === "/" ? true : path === prefix || path.startsWith(`${prefix}/`);
  }
  return normalizePath(pattern) === path;
}

export function pageAllowed(mode: PromoWidgetPagesMode | undefined, pages: string | undefined, pathname: string): boolean {
  const patterns = parsePagePatterns(pages);
  if (!mode || mode === "all" || patterns.length === 0) return true;
  const path = normalizePath(pathname);
  const hit = patterns.some((p) => patternMatches(p, path));
  return mode === "only" ? hit : !hit;
}

// ── which promo ────────────────────────────────────────────────────────

/** Personal offers are never advertised: they belong to one client. */
export function isPersonalPromo(p: Pick<Promo, "audience" | "customer_id" | "is_single_use">): boolean {
  return p.audience === "one_client" || Boolean(p.customer_id) || Boolean(p.is_single_use);
}

const KIND_RANK: Record<WidgetPromo["offerKind"], number> = { percent: 0, fixed: 1, fixed_price: 2, free_addon: 3 };

/** Best first: percent (bigger first), then money off, then a set price, then gifts; sooner end, then id, break ties. */
export function compareWidgetPromos(a: WidgetPromo, b: WidgetPromo): number {
  if (a.offerKind !== b.offerKind) return KIND_RANK[a.offerKind] - KIND_RANK[b.offerKind];
  if (a.value !== b.value) return b.value - a.value;
  const ea = a.endsAtMs ?? Number.POSITIVE_INFINITY;
  const eb = b.endsAtMs ?? Number.POSITIVE_INFINITY;
  if (ea !== eb) return ea - eb;
  return a.id < b.id ? -1 : 1;
}

/**
 * The promos one block shows. A chosen promo that is no longer live shows
 * nothing (never a different offer by surprise). With no choice, the block
 * takes the best live promo the talent put on their site; `cards` takes up to
 * `maxCards` of them.
 */
export function pickWidgetPromos(
  items: readonly WidgetPromo[],
  opts: Pick<PromoWidgetOptions, "promoId" | "variant" | "maxCards">,
  nowMs: number,
): WidgetPromo[] {
  const live = items.filter((p) => p.endsAtMs === null || p.endsAtMs > nowMs);
  if (opts.promoId) {
    const chosen = live.find((p) => p.id === opts.promoId);
    return chosen ? [chosen] : [];
  }
  const ranked = live.filter((p) => p.showOnSite).sort(compareWidgetPromos);
  if (opts.variant === "cards") return ranked.slice(0, clampInt(opts.maxCards, 1, 6, 3));
  return ranked.slice(0, 1);
}

export function clampInt(v: number | undefined, min: number, max: number, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.trunc(v))) : fallback;
}

// ── data shaping ───────────────────────────────────────────────────────

export const LEFT_MAX = 5;

/** A repo promo + its row extras -> the widget's server-side record. Null for personal / code-less code promos. */
export function toWidgetPromo(input: {
  promo: Promo;
  showCountdown: boolean;
  showOnSite: boolean;
  title: Readonly<Record<string, string>> | null;
  description: Readonly<Record<string, string>> | null;
  used: number;
}): WidgetPromo | null {
  const { promo } = input;
  if (isPersonalPromo(promo)) return null;
  const code = promo.unlock === "code" ? (promo.code ?? "").trim().toUpperCase() : "";
  if (promo.unlock === "code" && !code) return null;
  const max = promo.max_uses ?? null;
  const left = max !== null ? Math.max(0, max - input.used) : null;
  return {
    id: promo.id,
    offerKind: promo.offer_kind,
    value: promo.value,
    currency: promo.currency,
    unlock: promo.unlock,
    audience: promo.audience,
    scope: promo.scope,
    tz: promo.tz,
    code: promo.unlock === "code" ? code : null,
    endsAtMs: promoEndsAtMs(promo),
    showCountdown: input.showCountdown,
    showOnSite: input.showOnSite,
    title: input.title,
    description: input.description,
    left: left !== null && left > 0 && left <= LEFT_MAX ? left : null,
  };
}

function lang(locale: string | null | undefined): "es" | "en" {
  return (locale ?? "").toLowerCase().startsWith("en") ? "en" : "es";
}

function pickI18n(map: Readonly<Record<string, string>> | null, locale: string | null | undefined): string {
  if (!map) return "";
  const l = lang(locale);
  return (map[l] ?? map[l === "es" ? "en" : "es"] ?? Object.values(map)[0] ?? "").trim();
}

/** Localised, client-safe view of one promo. The code is passed only for code promos. */
export function widgetView(
  p: WidgetPromo,
  opts: Pick<PromoWidgetOptions, "headline" | "body">,
  locale: string | null | undefined,
): WidgetView {
  const c = widgetCopy(locale);
  const offer = c.offerShort(p.offerKind, p.value, p.currency);
  const headline = (opts.headline ?? "").trim() || c.getOffer(offer);
  const body = (opts.body ?? "").trim() || pickI18n(p.title, locale) || pickI18n(p.description, locale);
  return {
    id: p.id,
    offer,
    headline,
    body,
    code: p.code,
    unlock: p.unlock,
    endsAtMs: p.endsAtMs,
    countdown: p.showCountdown && p.endsAtMs !== null,
    leftLabel: p.left !== null ? c.left(p.left) : null,
  };
}

// ── popup frequency cap ────────────────────────────────────────────────

export type CapRecord = { lastMs: number; count: number };

const DAY_MS = 86_400_000;

export function parseCapRecord(raw: string | null | undefined): CapRecord | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object") return null;
    const r = v as { lastMs?: unknown; count?: unknown };
    if (typeof r.lastMs !== "number" || !Number.isFinite(r.lastMs)) return null;
    return { lastMs: r.lastMs, count: typeof r.count === "number" && r.count > 0 ? Math.trunc(r.count) : 1 };
  } catch {
    return null;
  }
}

/**
 * May the pop-up open now? `session` is remembered by the caller in
 * sessionStorage, the rest in localStorage; both feed the same record.
 */
export function capAllows(frequency: PromoWidgetFrequency | undefined, rec: CapRecord | null, nowMs: number): boolean {
  if (!rec) return true;
  switch (frequency ?? "session") {
    case "always": return true;
    case "session": return false;
    case "once": return false;
    case "daily": return nowMs - rec.lastMs >= DAY_MS;
    case "weekly": return nowMs - rec.lastMs >= 7 * DAY_MS;
  }
}

export function nextCapRecord(rec: CapRecord | null, nowMs: number): CapRecord {
  return { lastMs: nowMs, count: (rec?.count ?? 0) + 1 };
}

/** Scroll depth in whole percent; 0 when the page does not scroll. */
export function scrollPercent(scrollTop: number, scrollHeight: number, clientHeight: number): number {
  const room = scrollHeight - clientHeight;
  if (!(room > 0)) return 0;
  return Math.max(0, Math.min(100, Math.round((scrollTop / room) * 100)));
}
