/**
 * door-model.ts — what the Door mode SHOWS, decided as pure functions.
 *
 * PURE. No Supabase, no React, no `server-only`, so it runs in every lane and
 * in the browser bundle alike. Three jobs:
 *
 *   1. THE VENUE'S CLOCK. Every time the door prints goes through
 *      `venueClock`, which formats with an explicit IANA zone and returns the
 *      zone's own short name beside it. A door tablet on a hotel Wi-Fi may be
 *      set to any zone at all; the only clock that means anything at a door
 *      is the venue's, and a time printed without saying whose clock it is
 *      was rule 5 of the program brief.
 *
 *   2. TONIGHT VERSUS LATER. `splitTonight` files a session under "tonight"
 *      when it is already running or starts on the venue's own calendar day,
 *      and everything else under "coming up", so a door opened at 23:40 for a
 *      show that starts at 00:30 still finds it (it is running-or-today by the
 *      venue's clock only if it is; otherwise it is the first row of tomorrow,
 *      which is one tap away rather than hidden).
 *
 *   3. THE VERDICT AS A SENTENCE KEY. `doorVerdict` maps Sessions'
 *      `DoorOutcome` (the ONLY authority on whether someone walks in, see
 *      `lib/sessions/door.ts`) onto a message key plus its variables, so the
 *      sentence comes from the catalogue in the request's language rather
 *      than from an English literal in a component. Total over the union:
 *      an outcome the engine gains without a sentence here fails to compile.
 */

import type { DoorOutcome } from "@/lib/sessions/door";

// ── 1. The venue's clock ────────────────────────────────────────────────

export type VenueClock = {
  /** "19:30" on the venue's clock. */
  readonly time: string;
  /** "Fri 12 Sep" on the venue's clock. */
  readonly date: string;
  /** The zone's short name for that instant, e.g. "CST", so the reader knows whose clock. */
  readonly zoneName: string;
  /** "2026-09-12" on the venue's calendar, for grouping. */
  readonly dayKey: string;
};

function parts(at: Date, zone: string, locale: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, { timeZone: zone, ...options }).formatToParts(at);
}

function pick(list: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return list.find((p) => p.type === type)?.value ?? "";
}

/**
 * Format one instant on the venue's clock. Returns null for an unparseable
 * instant or an unknown zone rather than a wall-clock guess: a door that
 * prints the tablet's own time when the venue's zone is misconfigured would be
 * "a function that answers instead of refusing".
 */
export function venueClock(iso: string, zone: string, locale = "en"): VenueClock | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  try {
    const dayParts = parts(at, zone, "en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
    const dayKey = `${pick(dayParts, "year")}-${pick(dayParts, "month")}-${pick(dayParts, "day")}`;
    const time = new Intl.DateTimeFormat(locale, {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(at);
    const date = new Intl.DateTimeFormat(locale, {
      timeZone: zone,
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(at);
    const zoneName = pick(parts(at, zone, "en", { timeZoneName: "short" }), "timeZoneName") || zone;
    return { time, date, zoneName, dayKey };
  } catch {
    return null;
  }
}

// ── 2. Tonight versus later ─────────────────────────────────────────────

export type DoorSessionWindow = {
  readonly id: string;
  readonly startsAt: string;
  readonly endsAt: string;
};

/**
 * Which sessions belong to tonight's door, by the venue's calendar.
 *
 * A session is TONIGHT when it is running now (started, not yet ended) or when
 * it starts on the venue's current calendar day. Everything else that has not
 * ended is LATER, in start order. A session that already ended is dropped: a
 * door does not admit to a show that is over, and listing it invites exactly
 * that scan.
 */
export function splitTonight<T extends DoorSessionWindow>(
  sessions: readonly T[],
  nowIso: string,
  zone: string,
): { tonight: T[]; later: T[] } {
  const now = Date.parse(nowIso);
  const today = venueClock(nowIso, zone)?.dayKey ?? null;
  const tonight: T[] = [];
  const later: T[] = [];
  const sorted = [...sessions].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  for (const s of sorted) {
    const start = Date.parse(s.startsAt);
    const end = Date.parse(s.endsAt);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (Number.isFinite(now) && end <= now) continue;
    const running = Number.isFinite(now) && start <= now && now < end;
    const startsToday = today !== null && venueClock(s.startsAt, zone)?.dayKey === today;
    if (running || startsToday) tonight.push(s);
    else later.push(s);
  }
  return { tonight, later };
}

// ── 3. The verdict ──────────────────────────────────────────────────────

export type DoorVerdictKey =
  | "admitted"
  | "admittedParty"
  | "admittedWasNoShow"
  | "alreadyIn"
  | "superseded"
  | "wrongNightDated"
  | "wrongNight"
  | "refunded"
  | "cancelled"
  | "forged"
  | "unknown"
  | "tooMany"
  | "misconfigured"
  | "engineError";

export type DoorVerdict = {
  readonly key: DoorVerdictKey;
  /** `in` turns the screen green; `refused` red; `warn` is our problem, not the holder's. */
  readonly tone: "in" | "refused" | "warn";
  /** Interpolation variables for the sentence. */
  readonly vars: Readonly<Record<string, string | number>>;
};

/**
 * The outcome as a sentence key. Green ONLY on `admitted` — the same rule as
 * `doorAdmits`; `already_in` is a real ticket that was used, which is a
 * different sentence from "come in" and from "this is fake".
 *
 * `wrong_session` carries the ticket's own night when the row has one, and
 * `dateFor` turns it into words on the venue's clock: "wrong night" alone
 * starts an argument that "this ticket is for Fri 12 Sep" ends.
 */
export function doorVerdict(
  outcome: DoorOutcome,
  dateFor: (iso: string) => string | null,
): DoorVerdict {
  switch (outcome.kind) {
    case "admitted":
      if (outcome.wasMarkedNoShow) return { key: "admittedWasNoShow", tone: "in", vars: {} };
      if (outcome.partySize > 1) {
        return {
          key: "admittedParty",
          tone: "in",
          vars: { admitted: outcome.admittedCount, party: outcome.partySize },
        };
      }
      return { key: "admitted", tone: "in", vars: {} };
    case "already_in":
      return {
        key: "alreadyIn",
        tone: "refused",
        vars: { admitted: outcome.admittedCount, party: outcome.partySize },
      };
    case "superseded":
      return { key: "superseded", tone: "refused", vars: {} };
    case "wrong_session": {
      const date = outcome.ticketStartsAt ? dateFor(outcome.ticketStartsAt) : null;
      return date
        ? { key: "wrongNightDated", tone: "refused", vars: { date } }
        : { key: "wrongNight", tone: "refused", vars: {} };
    }
    case "not_valid":
      return outcome.status === "refunded"
        ? { key: "refunded", tone: "refused", vars: {} }
        : { key: "cancelled", tone: "refused", vars: {} };
    case "forged":
      return { key: "forged", tone: "refused", vars: {} };
    case "unknown_ticket":
      return { key: "unknown", tone: "refused", vars: {} };
    case "too_many":
      return { key: "tooMany", tone: "warn", vars: { remaining: outcome.remaining } };
    case "door_misconfigured":
      return { key: "misconfigured", tone: "warn", vars: {} };
    case "engine_error":
      return { key: "engineError", tone: "warn", vars: {} };
  }
}

// ── The list ────────────────────────────────────────────────────────────

/**
 * A guest-list search: name, email or the first characters of the ticket's
 * id, case-insensitive. Empty query returns every row, so the list never
 * blanks while someone is typing.
 */
export function matchesGuest(
  row: { holderName: string | null; holderEmail?: string | null; id: string },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    (row.holderName ?? "").toLowerCase().includes(q) ||
    (row.holderEmail ?? "").toLowerCase().includes(q) ||
    row.id.toLowerCase().startsWith(q)
  );
}
