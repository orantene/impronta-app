/**
 * TUL-36 slice 3: the READ-ONLY availability tool. Pure core, no I/O, no hold, no booking.
 *
 * Open times come from `loadPublicOpenTimes`, the one loader behind every public "when can
 * I book?" answer (published + approved + public offering, host-tenant match, effective mode,
 * the talent's own pause). This tool only shapes that answer: a few future starts for a
 * guest-confirmed pick, or a reason there are none. Only the guest's tap may place a hold
 * (a later slice, via the existing pick-a-time path); the assistant never holds or books.
 *
 * Rules:
 *  - the loader's verdict is final: an unknown / hidden / not-public service is a handoff and
 *    reveals nothing; an inquiry-only service is a handoff (a person confirms the time);
 *  - at most 6 future, de-duplicated, sorted starts; a past or malformed date hint starts
 *    from now; the window is 7 days;
 *  - the reply text is deterministic, in the talent's time zone.
 */
import type { OpenTimesReason, PublicOpenTimesHost, PublicOpenTimesResult } from "@/lib/scheduling/public-open-times";

export const AVAILABILITY_MAX_STARTS = 6;
export const AVAILABILITY_WINDOW_DAYS = 7;

export type AvailabilityInput = {
  /** Already resolved from a grounded service ref by the caller. */
  offeringId: string;
  /** YYYY-MM-DD hint from the guest, or null. */
  date?: string | null;
  now: Date;
  host: PublicOpenTimesHost;
  locale: string;
};

export type AvailabilityResult =
  | { kind: "times"; starts: string[]; timezone: string | null; mode: string | null }
  | { kind: "none"; reason: OpenTimesReason | "none_in_window"; timezone: string | null }
  | { kind: "handoff"; reason: "unknown_service" | "unsure" | "inquiry_only" };

export type AvailabilityDeps = {
  loadOpenTimes: (args: { host: PublicOpenTimesHost; offeringId: string; from: Date; days: number; now: Date }) => Promise<PublicOpenTimesResult>;
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Where to start looking: the hinted day when it is a real day after now, else now. */
export function availabilityFrom(date: string | null | undefined, now: Date): Date {
  if (!date || !YMD.test(date)) return now;
  const d = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== date) return now;
  return d.getTime() > now.getTime() ? d : now;
}

/** Future, de-duplicated, sorted, capped starts. */
export function pickAvailabilityStarts(slots: readonly string[], now: Date, max: number = AVAILABILITY_MAX_STARTS): string[] {
  const out = new Set<string>();
  for (const s of [...slots].sort()) {
    const t = Date.parse(s);
    if (Number.isFinite(t) && t > now.getTime()) out.add(new Date(t).toISOString());
    if (out.size >= max) break;
  }
  return [...out];
}

export async function runAvailabilityTool(input: AvailabilityInput, deps: AvailabilityDeps): Promise<AvailabilityResult> {
  const loaded = await deps.loadOpenTimes({
    host: input.host,
    offeringId: input.offeringId,
    from: availabilityFrom(input.date, input.now),
    days: AVAILABILITY_WINDOW_DAYS,
    now: input.now,
  });
  if (!loaded.ok) return { kind: "handoff", reason: loaded.status === 404 ? "unknown_service" : "unsure" };
  if (loaded.reason === "inquiry_only") return { kind: "handoff", reason: "inquiry_only" };
  const timezone = loaded.timezone ?? null;
  const starts = pickAvailabilityStarts(loaded.slots, input.now);
  if (starts.length === 0) {
    return { kind: "none", reason: loaded.reason ?? "none_in_window", timezone };
  }
  return { kind: "times", starts, timezone, mode: loaded.mode ?? null };
}

const isEs = (locale: string) => locale.toLowerCase().startsWith("es");

/** "mar 3 nov, 10:00" / "Tue, Nov 3, 10:00 AM", in the talent's zone (UTC when unknown). */
export function formatOfferedTime(iso: string, timezone: string | null, locale: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(isEs(locale) ? "es-MX" : "en-US", {
      weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: timezone || "UTC",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

export function availabilityReplyText(result: AvailabilityResult, locale: string): string {
  const es = isEs(locale);
  if (result.kind === "times") {
    const list = result.starts.map((s) => formatOfferedTime(s, result.timezone, locale)).join(" | ");
    return es ? `Estos horarios estan libres: ${list}. Elige uno para apartarlo.` : `These times are open: ${list}. Pick one to hold it.`;
  }
  if (result.kind === "none") {
    return es
      ? "No veo horarios libres en los proximos dias. Una persona del equipo te ayuda a encontrar uno en este chat."
      : "I do not see open times in the next few days. A person on the team will help you find one in this chat.";
  }
  return es ? "Una persona del equipo lo toma desde aqui y te responde en este chat." : "A person on the team will take it from here and reply in this chat.";
}
