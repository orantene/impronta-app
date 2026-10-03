import { bookingDurationMinutes } from "@/lib/scheduling/reservation-window";
import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";
import { resolveOfferingCta, type TalentOffering } from "@/lib/talent/offerings-types";
import {
  PLATFORM_DEFAULT_BOOKING_POSTURE,
  type TalentBookingPosture,
} from "@/lib/talent/selling-booking-settings";
import { deriveOfferingCta, offeringCtaLabel } from "@/lib/talent/offering-cta-derivation";

export type CatalogBookingMode = "demo" | "live";

export function catalogWillWriteBooking(
  mode: CatalogBookingMode,
  intent: "request" | "instant",
): boolean {
  return mode === "live" && intent === "instant";
}

export async function submitCatalogBooking<T>(
  mode: CatalogBookingMode,
  intent: "request" | "instant",
  write: () => Promise<T>,
): Promise<{ wrote: boolean; result: T | null }> {
  if (!catalogWillWriteBooking(mode, intent)) return { wrote: false, result: null };
  return { wrote: true, result: await write() };
}

/** Client-side outcome after submitCatalogBooking — Path A honesty (pay / calendar / retry). */
export type CatalogConfirmOutcome =
  | { kind: "preview_done" }
  | { kind: "slot_taken"; message: string }
  | { kind: "error"; message: string }
  | { kind: "redirect"; path: string }
  | { kind: "payment_missing"; message: string }
  | { kind: "done" };

export function resolveCatalogConfirmOutcome(input: {
  wrote: boolean;
  result: {
    ok: boolean;
    error?: string;
    slotTaken?: boolean;
    redirectPath?: string;
  } | null;
  requiresOnlineCollect: boolean;
  locale: string;
}): CatalogConfirmOutcome {
  const es = input.locale.toLowerCase().startsWith("es");
  if (!input.wrote) return { kind: "preview_done" };
  const result = input.result;
  if (!result || !result.ok) {
    if (result?.slotTaken) {
      return {
        kind: "slot_taken",
        message:
          result.error ??
          (es
            ? "Ese horario acaba de ocuparse. Elige otro."
            : "That time was just taken. Pick another."),
      };
    }
    return {
      kind: "error",
      message: result?.error ?? (es ? "No se pudo guardar." : "Could not save."),
    };
  }
  const redirect = result.redirectPath?.trim() ?? "";
  if (redirect) return { kind: "redirect", path: redirect };
  if (input.requiresOnlineCollect) {
    return {
      kind: "payment_missing",
      message: es
        ? "No se pudo abrir el pago. Prueba de nuevo o envía una consulta."
        : "Could not open payment. Try again or send an inquiry.",
    };
  }
  return { kind: "done" };
}

export function catalogNeedsOptions(
  detail: Pick<OfferingRequestDetail, "variants" | "addOns">,
): boolean {
  return (detail.variants ?? []).length > 0 || (detail.addOns ?? []).length > 0;
}

export function catalogTotalCents(
  detail: Pick<OfferingRequestDetail, "amountCents" | "variants" | "addOns">,
  variantId: string | null,
  addOnIds: string[],
): number {
  const variant = (detail.variants ?? []).find((v) => v.id === variantId) ?? null;
  const extras = (detail.addOns ?? []).filter((a) => addOnIds.includes(a.id));
  const base = variant?.amountCents ?? detail.amountCents ?? 0;
  return base + extras.reduce((sum, a) => sum + a.amountCents, 0);
}

/**
 * Base offering minutes + selected extras that carry duration. Delegates to
 * the server's own rule so the window the sheet sends is the window the
 * server re-checks (`validateReservationWindow`).
 */
export function catalogBookingDurationMinutes(
  baseMinutes: number | null | undefined,
  addOns: readonly { id: string; durationMinutes?: number | null }[],
  selectedIds: readonly string[],
): number {
  return bookingDurationMinutes(baseMinutes, addOns, selectedIds);
}

/** True when the guest's picked ISO is still in the freshly projected list. */
export function catalogSelectedStartStillOpen(
  selectedStartsAt: string | null | undefined,
  openStarts: readonly string[],
): boolean {
  return Boolean(selectedStartsAt && openStarts.includes(selectedStartsAt));
}

export function catalogCanContinueWhen(time: string | null): boolean {
  return Boolean(time);
}

export function catalogRowHasOptions(o: Pick<TalentOffering, "variants" | "addOns">): boolean {
  return (o.variants ?? []).length > 0 || (o.addOns ?? []).length > 0;
}

/**
 * Maison DoR: plain Seleccionar stays on the menu (Seleccionado + Continuar bar).
 * Only option / on-request rows open the sheet immediately from the row CTA.
 */
export function catalogRowOpensSheetImmediately(
  o: Pick<TalentOffering, "variants" | "addOns" | "visibility">,
): boolean {
  return catalogRowHasOptions(o) || o.visibility === "on_request";
}

/**
 * PKG-2 Option A — one-line purchase (product Buy or untimed package), not the
 * appointment spine. Timed packages/services stay on CatalogBookingSheet.
 */
export function catalogIsPurchaseEligible(
  o: Pick<
    TalentOffering,
    "kind" | "bookingMode" | "priceType" | "priceDisplay" | "amountCents" | "visibility"
  > & { durationMinutes?: number | null },
): boolean {
  const cta = resolveOfferingCta(o);
  if (cta === "buy_now") return true;
  if (o.kind === "package" && cta === "book_now" && (o.durationMinutes ?? 0) <= 0) return true;
  return false;
}

/** Same gate from the CustomEvent detail shape (no bookingMode on the wire). */
export function catalogDetailIsPurchase(
  d: Pick<OfferingRequestDetail, "kind" | "intent" | "durationMinutes" | "amountCents">,
): boolean {
  if (d.intent !== "instant" || d.amountCents == null) return false;
  if (d.kind === "product") return true;
  if (d.kind === "package" && (d.durationMinutes ?? 0) <= 0) return true;
  return false;
}

export function catalogRowCtaLabel(opts: {
  selected: boolean;
  offering: Pick<
    TalentOffering,
    | "visibility"
    | "variants"
    | "addOns"
    | "kind"
    | "bookingMode"
    | "priceType"
    | "priceDisplay"
    | "amountCents"
  > & { durationMinutes?: number | null };
  locale: string;
  inspectorLabel?: string;
  /**
   * Manual-confirm / plan posture: effective CTA is request_to_book even when
   * the offering itself is instant buy/book. Must match CatalogRow's
   * data-offering-cta so the label never promises Buy on a request path.
   */
  confirmsByHand?: boolean;
  /**
   * Talent default booking mode. Applies ONLY to services that inherit
   * (bookingMode null); a service's own mode wins (§1, deriveOfferingCta).
   */
  bookingPosture?: TalentBookingPosture;
}): string {
  if (opts.selected) return opts.locale.startsWith("es") ? "Seleccionado" : "Selected";
  const es = opts.locale.startsWith("es");
  const { cta } = deriveOfferingCta({
    offering: opts.offering,
    defaults: { bookingPosture: opts.bookingPosture ?? PLATFORM_DEFAULT_BOOKING_POSTURE },
    confirmsByHand: opts.confirmsByHand === true,
  });
  // Meaning-preserving labels (brief §10). Never say Book when the path is inquiry/quote.
  // Inspector ctaLabel must not clobber option / quote / consult CTAs — Jorg Beauty
  // CMS stored "Seleccionar" and wiped "Elegir opciones" on Soft Gel (vanity 1:1).
  if (cta === "ask_quote" || cta === "request" || opts.offering.visibility === "on_request") {
    return offeringCtaLabel(cta === "ask_quote" ? "ask_quote" : "request", opts.locale, "catalog");
  }
  if (cta === "request_to_book") {
    // Request / approval posture: mode wins over CMS ctaLabel. Jor stored
    // inspector "Seleccionar" and wiped "Solicitar cita" on seeded request rows.
    if (catalogRowHasOptions(opts.offering)) return es ? "Elegir opciones" : "Choose options";
    return offeringCtaLabel("request_to_book", opts.locale, "catalog");
  }
  if (catalogIsPurchaseEligible(opts.offering)) {
    // Purchase rail is mounted — honest Buy (options picked inside the sheet).
    return es ? "Comprar" : "Buy";
  }
  // Instant rows read "Select" even with options (Maison v2 `.pick`); the tap
  // still opens the option picker (catalogRowOpensSheetImmediately).
  if (catalogRowHasOptions(opts.offering)) return offeringCtaLabel("book_now", opts.locale, "catalog");
  // Instant appointment — menu-style "Select" matches Maison idle CTA.
  // Sheet opens from Continuar (or from Elegir opciones), not from this label.
  // Inspector may rename the plain Select label only.
  return opts.inspectorLabel?.trim() || offeringCtaLabel("book_now", opts.locale, "catalog");
}

/** Cents collected at confirm for the given reserve policy (full / deposit / free). */
export function catalogCollectNowCents(
  totalCents: number | null | undefined,
  reserveMode: "full" | "deposit" | "free" | null | undefined,
  depositPct: number | null | undefined,
): number | null {
  if (totalCents == null) return null;
  if (reserveMode === "free") return 0;
  if (
    reserveMode === "deposit" &&
    typeof depositPct === "number" &&
    Number.isFinite(depositPct) &&
    depositPct > 0 &&
    depositPct < 100
  ) {
    return Math.round((totalCents * depositPct) / 100);
  }
  return totalCents;
}

/** Min bookable cents for a row — base amount or cheapest variant. */
export function catalogRowMinCents(
  o: Pick<TalentOffering, "amountCents" | "variants">,
): number | null {
  const prices = [
    ...(o.variants ?? []).map((v) => v.amountCents ?? o.amountCents),
    o.amountCents,
  ].filter((c): c is number => typeof c === "number" && c > 0);
  return prices.length ? Math.min(...prices) : o.amountCents ?? null;
}

/** Maison ladder: "from" display OR more than one variant → DESDE / From. */
export function catalogRowShowsFrom(
  o: Pick<TalentOffering, "priceDisplay" | "variants">,
): boolean {
  return o.priceDisplay === "from" || (o.variants ?? []).length > 1;
}

/** Published hours for demo / canvas: Monday–Saturday. Sunday is closed. */
export function demoSlotsFor(date: Date, durationMinutes: number | null): string[] {
  const day = date.getDay();
  if (day === 0) return [];
  const span = durationMinutes ?? 60;
  const out: string[] = [];
  const end = (day === 6 ? 16 : 19) * 60;
  for (let min = 10 * 60; min + span <= end; min += 90) {
    out.push(`${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`);
  }
  const load = (date.getDate() + day) % 3;
  return out.filter((_, i) => (load === 0 ? true : i % (load + 1) !== 0));
}

export function catalogNextDays(count = 12): Date[] {
  const out: Date[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 1; i <= count; i += 1) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(d);
  }
  return out;
}

/**
 * First day on the demo strip that is open. Sunday is closed and still listed,
 * but it must not be the selected day: the strip starts tomorrow, so a Saturday
 * visit otherwise opens on Sunday with no times.
 */
export function firstOpenDemoDayIndex(days: readonly Date[]): number {
  const index = days.findIndex((d) => d.getDay() !== 0);
  return index >= 0 ? index : 0;
}

export function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function groupIsoSlotsByDay(
  slots: string[],
  timezone: string,
): Array<{ key: string; date: Date; starts: string[] }> {
  const map = new Map<string, { date: Date; starts: string[] }>();
  for (const start of slots) {
    const key = ymdInTimezone(start, timezone);
    const existing = map.get(key);
    if (existing) {
      existing.starts.push(start);
    } else {
      map.set(key, { date: dateFromYmd(key), starts: [start] });
    }
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({ key, date: v.date, starts: v.starts }));
}

export function ymdInTimezone(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function formatClock(iso: string, timezone: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale.startsWith("es") ? "es" : "en", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone,
    }).format(new Date(iso));
  } catch {
    return iso.slice(11, 16);
  }
}

function dateFromYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function demoReservationIso(
  day: Date,
  time: string,
  durationMinutes: number | null,
): { startsAt: string; endsAt: string; timezone: string } {
  const [hh, mm] = time.split(":").map(Number);
  const start = new Date(day);
  start.setHours(hh ?? 0, mm ?? 0, 0, 0);
  const end = new Date(start.getTime() + (durationMinutes ?? 60) * 60_000);
  return {
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  };
}

const DAYS_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Weekday short for day-chip UI (first 3 letters). */
export function catalogWeekdayShort(date: Date, es: boolean): string {
  return (es ? DAYS_ES : DAYS_EN)[date.getDay()]?.slice(0, 3) ?? "";
}

/** Month short for day-chip UI. */
export function catalogMonthShort(date: Date, es: boolean): string {
  return (es ? MONTHS_ES : MONTHS_EN)[date.getMonth()] ?? "";
}

/** Full slot label: "Lunes 12 de ene, 10:00" / "Monday 12 Jan, 10:00". */
export function catalogSlotDateLabel(date: Date, time: string, es: boolean): string {
  const day = (es ? DAYS_ES : DAYS_EN)[date.getDay()] ?? "";
  const month = (es ? MONTHS_ES : MONTHS_EN)[date.getMonth()] ?? "";
  return `${day} ${date.getDate()} ${es ? "de" : ""} ${month}, ${time}`.replace(/\s+/g, " ").trim();
}

/**
 * The unit a service is priced by ("uña" in "Desde $120 por uña"), from the
 * offering's long-tail `attributes.price_unit`: a plain string or `{ es, en }`.
 * Null when the service is not priced per unit.
 */
export function offeringPriceUnit(
  attributes: Record<string, unknown> | null | undefined,
  locale: string,
): string | null {
  const raw = attributes?.price_unit;
  if (typeof raw === "string") return raw.trim() || null;
  if (raw && typeof raw === "object") {
    const map = raw as Record<string, unknown>;
    const lang = locale.startsWith("es") ? "es" : "en";
    const pick = map[lang] ?? map.en ?? map.es;
    return typeof pick === "string" && pick.trim() ? pick.trim() : null;
  }
  return null;
}
