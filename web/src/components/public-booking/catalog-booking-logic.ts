import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";
import { resolveOfferingCta, type TalentOffering } from "@/lib/talent/offerings-types";

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

export function catalogCanContinueWhen(time: string | null): boolean {
  return Boolean(time);
}

export function catalogRowHasOptions(o: Pick<TalentOffering, "variants" | "addOns">): boolean {
  return (o.variants ?? []).length > 0 || (o.addOns ?? []).length > 0;
}

export function catalogRowCtaLabel(opts: {
  selected: boolean;
  offering: Pick<TalentOffering, "visibility" | "variants" | "addOns" | "kind" | "bookingMode" | "priceType" | "priceDisplay" | "amountCents">;
  locale: string;
  inspectorLabel?: string;
}): string {
  if (opts.selected) return opts.locale.startsWith("es") ? "Seleccionado" : "Selected";
  if (opts.inspectorLabel?.trim()) return opts.inspectorLabel.trim();
  const es = opts.locale.startsWith("es");
  const cta = resolveOfferingCta(opts.offering);
  // Meaning-preserving labels (brief §10). Never say Book when the path is inquiry/quote.
  if (cta === "ask_quote") return es ? "Pedir cotización" : "Request a quote";
  if (cta === "request" || opts.offering.visibility === "on_request") {
    return es ? "Consultar" : "Ask about this";
  }
  if (cta === "request_to_book") {
    if (catalogRowHasOptions(opts.offering)) return es ? "Elegir opciones" : "Choose options";
    return es ? "Solicitar cita" : "Request appointment";
  }
  if (cta === "buy_now") {
    // Product purchase UI in this sheet is not a full cart — open options/detail only.
    if (catalogRowHasOptions(opts.offering)) return es ? "Ver opciones" : "View options";
    return es ? "Ver" : "View";
  }
  if (catalogRowHasOptions(opts.offering)) return es ? "Elegir opciones" : "Choose options";
  // Instant appointment — menu-style "Select" matches mockups; sheet opens time picker.
  return es ? "Seleccionar" : "Select";
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
