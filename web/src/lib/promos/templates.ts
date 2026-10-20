/**
 * Promo templates and the draft model behind the talent quick-create drawer
 * (design D3, L9). Pure: no I/O, no React. Every template returns smart
 * defaults so the common case is 2-3 taps; `quote()` is the only price engine,
 * so the preview and "Ganarias aprox." can never disagree with checkout.
 */

import { localParts } from "./local-time";
import { TRIAL_MAX_DAYS, TRIAL_MAX_USES } from "./plan-gating";
import { feeCents, quote } from "./quote";
import { promoCopy, type PromoCopyKey } from "./copy/talent";
import type { Audience, AppliesOn, OfferKind, Promo, PromoStatus, ScopeKind, Unlock } from "./types";
import type { PromoRow } from "./repo";

export type TemplateKey =
  | "fill_week"
  | "slow_day"
  | "last_minute"
  | "free_extra"
  | "secret_code"
  | "launch"
  | "holiday"
  | "come_back"
  | "first_booking"
  | "signup_unlock"
  | "returning_reward"
  | "referral"
  | "limited_deal"
  | "slow_week"
  | "custom";

export type TemplateIcon = "calendar" | "moon" | "bolt" | "sparkle" | "lock" | "star" | "ticket" | "mail" | "pencil";

export const TEMPLATE_ORDER: readonly TemplateKey[] = [
  "fill_week", "slow_day", "last_minute", "free_extra", "secret_code", "launch", "holiday", "come_back",
  "first_booking", "signup_unlock", "returning_reward", "referral", "limited_deal", "slow_week", "custom",
];

export const TEMPLATE_ICON: Readonly<Record<TemplateKey, TemplateIcon>> = {
  fill_week: "calendar",
  slow_day: "moon",
  last_minute: "bolt",
  free_extra: "sparkle",
  secret_code: "lock",
  launch: "star",
  holiday: "ticket",
  come_back: "mail",
  first_booking: "star",
  signup_unlock: "lock",
  returning_reward: "sparkle",
  referral: "ticket",
  limited_deal: "bolt",
  slow_week: "calendar",
  custom: "pencil",
};

/** Templates whose meaning survives the free trial rules (public, automatic). */
const TRIAL_COMPATIBLE: ReadonlySet<TemplateKey> = new Set(["fill_week", "slow_day", "last_minute", "free_extra", "holiday", "limited_deal", "slow_week", "custom"]);

export type PromoDraft = {
  id: string | null;
  template: TemplateKey;
  name: string;
  offer_kind: OfferKind;
  /** Percent as an integer (1..90); minor units for fixed / fixed_price; 0 for free_addon. */
  value: number;
  currency: string;
  addon_id: string | null;
  /** Preview only, never stored. */
  addon_list_cents: number;
  scope: ScopeKind;
  target_ids: string[];
  audience: Audience;
  unlock: Unlock;
  code: string | null;
  customer_id: string | null;
  /** Local dates "YYYY-MM-DD" in `tz`. */
  starts_at: string | null;
  ends_at: string | null;
  weekdays: number[];
  time_from: string | null;
  time_to: string | null;
  slot_id: string | null;
  max_uses: number | null;
  per_client_max: number;
  min_subtotal_cents: number | null;
  applies_on: AppliesOn;
  tz: string;
  /**
   * Engagement layer only (TUL-1051): the price is shown after the client signs
   * in or registers. No column: it is implied by template 'signup_unlock'
   * (set in buildDraft and rowToDraft) and mapped onto unlock='code'.
   */
  requires_account?: boolean;
};

export type TemplateContext = {
  now: string | Date;
  tz: string;
  currency: string;
  locale?: string;
  addon?: { id: string; list_cents: number } | null;
  /** Free plan with the lifetime trial unused: defaults stay inside the trial rules. */
  trialAvailable?: boolean;
  slot?: { id?: string | null; date: string; from: string; to: string } | null;
  customerId?: string | null;
  codeBase?: string;
};

// ── local date helpers ─────────────────────────────────────────────────

const DAY_MS = 86_400_000;

export function todayLocal(now: string | Date, tz: string): string {
  return localParts(now instanceof Date ? now.getTime() : Date.parse(now), tz).date;
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

export function weekdayOfDate(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Month arithmetic that clamps the day (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** Local wall clock "YYYY-MM-DDTHH:MM[:SS]" in tz to a UTC ISO instant. */
export function localToInstant(local: string, tz: string): string {
  const [d = "", t = "00:00:00"] = local.split("T");
  const [y = 0, mo = 1, da = 1] = d.split("-").map(Number);
  const [h = 0, mi = 0, s = 0] = t.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, da, h, mi, s);
  let guess = wall;
  for (let i = 0; i < 3; i++) guess = wall - localParts(guess, tz).offsetMinutes * 60_000;
  return new Date(guess).toISOString();
}

/** Local date of a stored instant (or a plain date), in tz. */
export function instantToLocalDate(value: string | null, tz: string): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : localParts(ms, tz).date;
}

export type DateChip = "today" | "week" | "weekend" | "next";

/** Quick date chips (L9): inclusive local ranges. Week = today to Sunday; weekend = Friday to Sunday; next = next Monday to Sunday. */
export function dateChipRange(chip: DateChip, today: string): { start: string; end: string } {
  const wd = weekdayOfDate(today);
  const toSunday = (7 - wd) % 7;
  switch (chip) {
    case "today": return { start: today, end: today };
    case "week": return { start: today, end: addDays(today, toSunday) };
    case "weekend": {
      const start = wd === 6 || wd === 0 ? today : addDays(today, (5 - wd + 7) % 7);
      return { start, end: addDays(today, toSunday) };
    }
    case "next": {
      const start = addDays(today, toSunday + 1);
      return { start, end: addDays(start, 6) };
    }
  }
}

// ── holidays (MX + US) ─────────────────────────────────────────────────

export type HolidayKey = "valentine" | "madres" | "buen_fin" | "navidad";

function nthWeekdayOfMonth(year: number, month1: number, weekday: number, nth: number): string {
  const first = `${year}-${String(month1).padStart(2, "0")}-01`;
  const offset = (weekday - weekdayOfDate(first) + 7) % 7;
  return addDays(first, offset + (nth - 1) * 7);
}

export function holidayDate(key: HolidayKey, year: number): string {
  switch (key) {
    case "valentine": return `${year}-02-14`;
    case "madres": return `${year}-05-10`;
    case "navidad": return `${year}-12-24`;
    case "buen_fin": return nthWeekdayOfMonth(year, 11, 1, 3); // third Monday, the weekend's last day
  }
}

/** The next holiday on or after `today`, with a promo window of the 7 days up to it (Buen Fin: Friday to Monday). */
export function nextHoliday(today: string): { key: HolidayKey; date: string; start: string; end: string } {
  const year = Number(today.slice(0, 4));
  const keys: HolidayKey[] = ["valentine", "madres", "buen_fin", "navidad"];
  const all = [year, year + 1].flatMap((y) => keys.map((key) => ({ key, date: holidayDate(key, y) })));
  const hit = all.filter((h) => h.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1))[0] ?? all[0]!;
  const length = hit.key === "buen_fin" ? 4 : 7;
  const rawStart = addDays(hit.date, -(length - 1));
  return { ...hit, start: rawStart < today ? today : rawStart, end: hit.date };
}

// ── draft building ─────────────────────────────────────────────────────

/** Uppercase ASCII code such as "AMIGA10". */
export function suggestCode(base: string, pct: number): string {
  const clean = base.normalize("NFD").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10) || "PROMO";
  return `${clean}${pct > 0 ? pct : ""}`;
}

/** Share-link slug: ascii, lowercase, dashes, plus a short unique tail ("semana-vacia-k3f9x2"). */
export function promoSlug(name: string, tail: string): string {
  const head = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
  const t = tail.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "x";
  return head ? `${head}-${t}` : `promo-${t}`;
}

/** "LUZ10" -> "LUZ10-2", "LUZ10-2" -> "LUZ10-3". */
export function nextCodeSuffix(code: string): string {
  const m = /^(.*)-(\d+)$/.exec(code);
  return m ? `${m[1]}-${Number(m[2]) + 1}` : `${code}-2`;
}

function base(ctx: TemplateContext, template: TemplateKey, name: string): PromoDraft {
  return {
    id: null,
    template,
    name,
    offer_kind: "percent",
    value: 20,
    currency: ctx.currency,
    addon_id: null,
    addon_list_cents: 0,
    scope: "services",
    target_ids: [],
    audience: "public",
    unlock: "auto",
    code: null,
    customer_id: null,
    starts_at: null,
    ends_at: null,
    weekdays: [],
    time_from: null,
    time_to: null,
    slot_id: null,
    max_uses: null,
    per_client_max: 1,
    min_subtotal_cents: null,
    applies_on: "appointment",
    tz: ctx.tz,
  };
}

export function clampToTrial(d: PromoDraft, now: string | Date): PromoDraft {
  const start = d.starts_at ?? todayLocal(now, d.tz);
  let end = d.ends_at ?? addDays(start, TRIAL_MAX_DAYS - 1);
  if (end < start) end = start;
  const latest = addDays(start, TRIAL_MAX_DAYS - 1);
  if (end > latest) end = latest;
  return {
    ...d,
    audience: "public",
    unlock: "auto",
    code: null,
    customer_id: null,
    starts_at: start,
    ends_at: end,
    max_uses: Math.min(d.max_uses ?? TRIAL_MAX_USES, TRIAL_MAX_USES),
  };
}

export function buildDraft(key: TemplateKey, ctx: TemplateContext): PromoDraft {
  const copy = promoCopy(ctx.locale);
  const name = copy.t(`tpl.${key}` as PromoCopyKey);
  const today = todayLocal(ctx.now, ctx.tz);
  const d = base(ctx, key, name);

  switch (key) {
    case "fill_week":
      d.value = 20;
      d.starts_at = today;
      d.ends_at = addDays(today, 6);
      d.max_uses = 3;
      break;
    case "slow_day":
      d.value = 15;
      d.weekdays = [2];
      break;
    case "last_minute": {
      d.value = 40;
      d.max_uses = 1;
      const slot = ctx.slot ?? null;
      d.starts_at = slot?.date ?? today;
      d.ends_at = slot?.date ?? today;
      if (slot) {
        d.slot_id = slot.id ?? null;
        d.time_from = slot.from;
        d.time_to = slot.to;
      }
      break;
    }
    case "free_extra":
      d.offer_kind = "free_addon";
      d.value = 0;
      d.addon_id = ctx.addon?.id ?? null;
      d.addon_list_cents = ctx.addon?.list_cents ?? 0;
      d.starts_at = today;
      d.ends_at = addDays(today, 13);
      d.max_uses = 10;
      break;
    case "secret_code":
      d.value = 10;
      d.unlock = "code";
      d.code = suggestCode(ctx.codeBase ?? (copy.locale === "es" ? "AMIGA" : "FRIEND"), 10);
      d.applies_on = "purchase";
      break;
    case "launch":
      d.value = 20;
      d.audience = "new_clients";
      d.starts_at = today;
      d.ends_at = addDays(today, 13);
      d.max_uses = 10;
      break;
    case "holiday": {
      const h = nextHoliday(today);
      d.name = copy.t(`holiday.${h.key}` as PromoCopyKey);
      d.value = 20;
      d.starts_at = h.start;
      d.ends_at = h.end;
      break;
    }
    case "come_back":
      d.value = 20;
      d.audience = ctx.customerId ? "one_client" : "lapsed";
      d.customer_id = ctx.customerId ?? null;
      d.unlock = "link";
      d.starts_at = today;
      d.ends_at = addDays(today, 13);
      d.applies_on = "purchase";
      break;
    case "first_booking":
      d.value = 20;
      d.audience = "new_clients";
      break;
    case "signup_unlock":
      // The widget hides the price until the client is signed in. Once they
      // are, it unlocks the row's code (see engagement.ts signupUnlockedCodes),
      // so quote() prices it through the normal code path. The per-account
      // code (signupUnlockCode) is what gets recorded on the redemption.
      d.value = 10;
      d.unlock = "code";
      d.requires_account = true;
      d.code = suggestCode(copy.locale === "es" ? "REGISTRO" : "MEMBER", 0);
      break;
    case "returning_reward":
      d.value = 15;
      d.audience = "returning";
      break;
    case "referral":
      // Referred side: a new client who arrives through the referrer's link.
      // The referrer's reward is planned by engagement.ts planReferralReward.
      d.value = 15;
      d.audience = "new_clients";
      d.unlock = "link";
      break;
    case "limited_deal":
      d.value = 25;
      d.starts_at = today;
      d.ends_at = addDays(today, 2);
      d.max_uses = 5;
      break;
    case "slow_week":
      d.value = 15;
      d.weekdays = [1, 2, 3];
      d.time_from = "10:00";
      d.time_to = "15:00";
      d.starts_at = today;
      d.ends_at = addDays(today, 13);
      break;
    case "custom":
      d.value = 10;
      break;
  }
  return ctx.trialAvailable && TRIAL_COMPATIBLE.has(key) ? clampToTrial(d, ctx.now) : d;
}

// ── draft <-> engine promo, DB columns ─────────────────────────────────

export function draftToPromo(d: PromoDraft, id = d.id ?? "draft"): Promo {
  return {
    id,
    offer_kind: d.offer_kind,
    value: d.value,
    currency: d.currency,
    addon: d.addon_id ? { id: d.addon_id, list_cents: d.addon_list_cents } : null,
    scope: d.scope,
    target_ids: d.target_ids,
    min_subtotal_cents: d.min_subtotal_cents,
    audience: d.audience,
    unlock: d.unlock,
    code: d.code,
    applies_on: d.applies_on,
    starts_at: d.starts_at,
    ends_at: d.ends_at,
    tz: d.tz,
    weekdays: d.weekdays,
    time_from: d.time_from,
    time_to: d.time_to,
    slot_id: d.slot_id,
    max_uses: d.max_uses,
    per_client_max: d.per_client_max,
    customer_id: d.customer_id,
    is_single_use: d.audience === "one_client",
    is_draft: false,
  };
}

export type PromoColumns = {
  name: string;
  template_key: string;
  kind: "percent" | "fixed";
  offer_kind: OfferKind;
  value: number;
  currency: string;
  addon_id: string | null;
  scope_kind: ScopeKind;
  min_subtotal_cents: number | null;
  audience: Audience;
  customer_id: string | null;
  is_single_use: boolean;
  unlock: Unlock;
  code: string | null;
  applies_on: AppliesOn;
  starts_at: string | null;
  ends_at: string | null;
  tz: string;
  weekdays: number[] | null;
  time_from: string | null;
  time_to: string | null;
  slot_id: string | null;
  max_redemptions: number | null;
  per_customer_limit: number;
  show_on_site: boolean;
};

/** The writable columns of tenant_promo_codes for a draft. free_addon is kind='fixed', value=0. */
export function draftToColumns(d: PromoDraft): PromoColumns {
  const kind = d.offer_kind === "percent" ? "percent" : "fixed";
  return {
    name: d.name.trim(),
    template_key: d.template,
    kind,
    offer_kind: d.offer_kind,
    value: d.offer_kind === "free_addon" ? 0 : Math.round(d.value),
    currency: d.currency.toUpperCase(),
    addon_id: d.offer_kind === "free_addon" ? d.addon_id : null,
    scope_kind: d.scope,
    min_subtotal_cents: d.min_subtotal_cents,
    audience: d.audience,
    customer_id: d.audience === "one_client" ? d.customer_id : null,
    is_single_use: d.audience === "one_client",
    unlock: d.unlock,
    code: d.unlock === "code" && d.code ? d.code.trim().toUpperCase() : null,
    applies_on: d.applies_on,
    starts_at: d.starts_at ? localToInstant(`${d.starts_at}T00:00:00`, d.tz) : null,
    ends_at: d.ends_at ? localToInstant(`${d.ends_at}T23:59:59`, d.tz) : null,
    tz: d.tz,
    weekdays: d.weekdays.length > 0 ? [...d.weekdays].sort((a, b) => a - b) : null,
    time_from: d.time_from,
    time_to: d.time_to,
    slot_id: d.slot_id,
    max_redemptions: d.max_uses,
    per_customer_limit: d.per_client_max,
    // A public promo that applies by itself is the one clients should see on
    // the site and hub; a code, link or personal promo stays off the page.
    show_on_site: d.unlock === "auto" && d.audience === "public",
  };
}

const TEMPLATE_KEYS: ReadonlySet<string> = new Set(TEMPLATE_ORDER);

export function rowToDraft(r: PromoRow, targetIds: readonly string[], addonListCents = 0): PromoDraft {
  const tz = r.tz || "America/Mexico_City";
  const offer = (["percent", "fixed", "fixed_price", "free_addon"] as const).find((k) => k === (r.offer_kind ?? r.kind)) ?? "fixed";
  const audience = (["public", "new_clients", "returning", "lapsed", "one_client"] as const).find((a) => a === r.audience) ?? "public";
  const unlock = (["auto", "code", "link"] as const).find((u) => u === r.unlock) ?? "code";
  return {
    id: r.id,
    template: TEMPLATE_KEYS.has(r.template_key ?? "") ? (r.template_key as TemplateKey) : "custom",
    name: r.name ?? r.label ?? "",
    offer_kind: offer,
    value: Number(r.value),
    currency: (r.currency ?? "MXN").toUpperCase(),
    addon_id: r.addon_id,
    addon_list_cents: addonListCents,
    scope: r.scope_kind === "products" ? "products" : r.scope_kind === "all" ? "all" : "services",
    target_ids: [...targetIds],
    audience,
    unlock,
    code: r.code,
    customer_id: r.customer_id,
    starts_at: instantToLocalDate(r.starts_at, tz),
    ends_at: instantToLocalDate(r.ends_at, tz),
    weekdays: r.weekdays ? [...r.weekdays] : [],
    time_from: r.time_from ? r.time_from.slice(0, 5) : null,
    time_to: r.time_to ? r.time_to.slice(0, 5) : null,
    slot_id: r.slot_id,
    max_uses: r.max_redemptions,
    per_client_max: r.per_customer_limit,
    min_subtotal_cents: r.min_subtotal_cents,
    applies_on: r.applies_on === "purchase" ? "purchase" : "appointment",
    tz,
    ...(r.template_key === "signup_unlock" ? { requires_account: true } : {}),
  };
}

// ── duplicate / repeat ─────────────────────────────────────────────────

/** B4 Duplicate: everything copied, dates cleared, code suffixed. */
export function duplicateDraft(d: PromoDraft): PromoDraft {
  return {
    ...d,
    id: null,
    name: `${d.name} (2)`,
    starts_at: null,
    ends_at: null,
    code: d.unlock === "code" && d.code ? nextCodeSuffix(d.code) : d.code,
  };
}

/** B4 Repeat: a duplicate with its dates shifted forward. */
export function repeatDraft(d: PromoDraft, shift: { months: number }): PromoDraft {
  return {
    ...d,
    id: null,
    starts_at: d.starts_at ? addMonths(d.starts_at, shift.months) : null,
    ends_at: d.ends_at ? addMonths(d.ends_at, shift.months) : null,
    code: d.unlock === "code" && d.code ? nextCodeSuffix(d.code) : d.code,
  };
}

// ── validation ─────────────────────────────────────────────────────────

export type DraftError = "name" | "value" | "value_cap" | "addon" | "code" | "dates" | "max_uses" | "time" | "customer";

export function validateDraft(d: PromoDraft): DraftError[] {
  const errs: DraftError[] = [];
  if (d.name.trim().length < 1 || d.name.length > 80) errs.push("name");
  if (d.offer_kind === "percent") {
    if (!Number.isFinite(d.value) || d.value < 1) errs.push("value");
    else if (d.value > 90) errs.push("value_cap");
  } else if (d.offer_kind === "fixed" || d.offer_kind === "fixed_price") {
    if (!Number.isFinite(d.value) || d.value <= 0) errs.push("value");
  } else if (!d.addon_id) {
    errs.push("addon");
  }
  if (d.unlock === "code" && !/^[A-Za-z0-9_-]{2,40}$/.test((d.code ?? "").trim())) errs.push("code");
  if (d.starts_at && d.ends_at && d.ends_at < d.starts_at) errs.push("dates");
  if (d.max_uses != null && (!Number.isInteger(d.max_uses) || d.max_uses < 1)) errs.push("max_uses");
  if (Boolean(d.time_from) !== Boolean(d.time_to)) errs.push("time");
  if (d.audience === "one_client" && !d.customer_id) errs.push("customer");
  return errs;
}

// ── preview and earnings, from quote() ─────────────────────────────────

export type PreviewService = { id: string; title: string; list_cents: number };

export type PreviewResult = {
  list_cents: number;
  final_cents: number;
  discount_cents: number;
  pct: number;
  applies: boolean;
  gift_cents: number;
  free_booking: boolean;
  fee_cents: number;
};

/** First local date in the promo's window that matches its weekdays, at its start time. */
export function sampleAppointmentStart(d: PromoDraft, now: string | Date): string | null {
  const today = todayLocal(now, d.tz);
  const from = d.starts_at && d.starts_at > today ? d.starts_at : today;
  for (let i = 0; i < 21; i++) {
    const date = addDays(from, i);
    if (d.ends_at && date > d.ends_at) return null;
    if (d.weekdays.length === 0 || d.weekdays.includes(weekdayOfDate(date))) {
      return localToInstant(`${date}T${d.time_from ?? "12:00"}:00`, d.tz);
    }
  }
  return null;
}

export function previewQuote(d: PromoDraft, service: PreviewService, now: string | Date): PreviewResult {
  const promo = draftToPromo(d, "preview");
  const start = sampleAppointmentStart(d, now) ?? (now instanceof Date ? now.toISOString() : now);
  const status = d.audience === "lapsed" ? "lapsed" : d.audience === "returning" ? "returning" : "new";
  const res = quote({
    channel: "booking",
    cart: [{
      id: "L1", kind: "service", target_id: service.id, list_cents: service.list_cents, qty: 1,
      currency: d.currency, appointment_start: start, slot_id: d.slot_id,
    }],
    client: { customerId: d.customer_id, status },
    now,
    promos: [promo],
    usage: {},
    unlocked: { codes: d.code ? [d.code] : [], linkPromoIds: ["preview"] },
  });
  const line = res.lines[0];
  const list = line?.list_cents ?? service.list_cents;
  const final = line?.final_cents ?? list;
  return {
    list_cents: list,
    final_cents: final,
    discount_cents: list - final,
    pct: list > 0 ? Math.round(((list - final) * 100) / list) : 0,
    applies: res.applied.length > 0,
    gift_cents: res.gifts.reduce((s, g) => s + g.value_cents, 0),
    free_booking: res.free_booking,
    fee_cents: res.totals.fee_cents,
  };
}

/** Approximate card processing cost, by currency. An estimate, labelled as one in the UI. */
export function paymentProcessingCents(chargedCents: number, currency: string): number {
  if (chargedCents <= 0) return 0;
  return currency.toUpperCase() === "MXN"
    ? Math.round((chargedCents * 360) / 10_000) + 300
    : Math.round((chargedCents * 290) / 10_000) + 30;
}

export type EarnEstimate = {
  net_per_booking_cents: number;
  /** null when the promo has no cap, so the total is per booking only. */
  bookings: number | null;
  total_cents: number | null;
};

/** "Ganarias aprox.": discounted price minus card cost and the platform fee. */
export function earnEstimate(d: PromoDraft, service: PreviewService, now: string | Date): EarnEstimate {
  const p = previewQuote(d, service, now);
  const charged = p.free_booking ? 0 : p.final_cents;
  const net = Math.max(0, charged - feeCents(charged) - paymentProcessingCents(charged, d.currency));
  const bookings = d.audience === "one_client" ? 1 : d.max_uses;
  return { net_per_booking_cents: net, bookings, total_cents: bookings == null ? null : net * bookings };
}

// ── nudges ─────────────────────────────────────────────────────────────

export type ExistingPromo = { id: string; name: string; status: PromoStatus; promo: Promo };

export type Nudge =
  | { kind: "big_discount"; pct: number }
  | { kind: "overlap"; promoId: string; name: string; otherPct: number; thisIsBetter: boolean };

function effectivePct(p: Pick<Promo, "offer_kind" | "value">, listCents: number): number {
  if (p.offer_kind === "percent") return p.value;
  if (listCents <= 0) return 0;
  if (p.offer_kind === "fixed") return Math.min(100, (p.value * 100) / listCents);
  if (p.offer_kind === "fixed_price") return Math.max(0, ((listCents - p.value) * 100) / listCents);
  return 0;
}

function setsOverlap(a: readonly string[], b: readonly string[]): boolean {
  return a.length === 0 || b.length === 0 || a.some((x) => b.includes(x));
}

function numsOverlap(a: readonly number[], b: readonly number[]): boolean {
  return a.length === 0 || b.length === 0 || a.some((x) => b.includes(x));
}

function windowsOverlap(a: PromoDraft, b: Promo): boolean {
  const bs = b.starts_at ? instantToLocalDate(b.starts_at, b.tz) : null;
  const be = b.ends_at ? instantToLocalDate(b.ends_at, b.tz) : null;
  if (a.ends_at && bs && a.ends_at < bs) return false;
  if (be && a.starts_at && be < a.starts_at) return false;
  return true;
}

export function promoNudges(d: PromoDraft, existing: readonly ExistingPromo[], listCents: number): Nudge[] {
  const out: Nudge[] = [];
  const mine = effectivePct({ offer_kind: d.offer_kind, value: d.value }, listCents);
  if (d.offer_kind !== "free_addon" && mine > 50) out.push({ kind: "big_discount", pct: Math.round(mine) });
  if (d.offer_kind === "free_addon") return out;
  for (const e of existing) {
    if (e.id === d.id) continue;
    if (e.status !== "live" && e.status !== "scheduled") continue;
    if (e.promo.offer_kind === "free_addon") continue;
    if (!setsOverlap(d.target_ids, e.promo.target_ids ?? [])) continue;
    if (!numsOverlap(d.weekdays, e.promo.weekdays ?? [])) continue;
    if (!windowsOverlap(d, e.promo)) continue;
    const other = effectivePct(e.promo, listCents);
    out.push({ kind: "overlap", promoId: e.id, name: e.name, otherPct: Math.round(other), thisIsBetter: mine > other });
  }
  return out;
}
