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
    const dateFmt = new Intl.DateTimeFormat(locale, {
      timeZone: zone,
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    // English reads day-first as the boards print it ("Fri 11 Sep", never
    // "Fri, Sep 11"). en-GB's own short month is "Sept", so the parts are
    // reassembled rather than the locale swapped; es/fr keep their own order.
    const date = /^en/i.test(locale)
      ? (() => {
          const dp = dateFmt.formatToParts(at);
          return `${pick(dp, "weekday")} ${pick(dp, "day")} ${pick(dp, "month")}`;
        })()
      : dateFmt.format(at);
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

// ── The board's states (G01 to G08, E09) ────────────────────────────────

/**
 * The second button under a verdict (G02 to G05, G07). `wired` is false when
 * the engine has no writer for it: the button is drawn disabled with its
 * sentence, never as a control that does nothing (D-POS-54).
 */
export type GateSecondaryAction = "redeemMeal" | "letInAnyway" | "exchangeDate" | "lookUpOrder";

export function gateSecondaryAction(key: DoorVerdictKey): { action: GateSecondaryAction; wired: boolean } | null {
  switch (key) {
    case "admitted":
    case "admittedParty":
    case "admittedWasNoShow":
      return { action: "redeemMeal", wired: false };
    case "alreadyIn":
      return { action: "letInAnyway", wired: false };
    case "wrongNight":
    case "wrongNightDated":
      return { action: "exchangeDate", wired: false };
    case "refunded":
    case "cancelled":
    case "superseded":
      return { action: "lookUpOrder", wired: true };
    default:
      return null;
  }
}

/**
 * The tier's own word from an order line's label. The engine labels a ticket
 * line "Event · Night · Tier" (the label the receipt prints); the door's
 * boards print the tier alone ("General admission #1", "Right · Child
 * admission"), so the leading segments that repeat the event's or the
 * night's name are dropped. A label with nothing to drop is returned as is.
 */
export function tierWord(label: string | null | undefined, ...contexts: Array<string | null | undefined>): string {
  if (!label) return "";
  const drop = contexts.filter((c): c is string => Boolean(c && c.trim())).map((c) => c.trim().toLowerCase());
  const parts = label.split(" · ").map((p) => p.trim());
  // A leading segment is the event's or the night's when it IS that name or
  // begins with it ("QA Night ticket" for the event "QA Night": the offering
  // the engine names the line after).
  const isContext = (seg: string) => drop.some((c) => seg.toLowerCase() === c || seg.toLowerCase().startsWith(`${c} `));
  while (parts.length > 1 && isContext(parts[0]!)) parts.shift();
  return parts.join(" · ");
}

/**
 * The admission id a scanned code NAMES, read off the token's payload
 * without verifying it. This is for the screen only: after the engine has
 * answered, the door prints who the verdict was about (the holder and the
 * tier from the list it already holds). It decides nothing: `check_in`
 * verifies the signature under its row lock, and a code that names a row
 * that is not on tonight's list simply prints no name.
 */
export function admissionIdOfCode(code: string): string | null {
  const parts = code.trim().split(".");
  if (parts.length !== 3 || parts[0] !== "adm1" || !parts[1]) return null;
  try {
    const payload = typeof atob === "function" ? atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")) : Buffer.from(parts[1], "base64url").toString("utf8");
    const id = payload.split(":")[0] ?? "";
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** One of two sentences by count: the boards say "1 ticket", never "1 tickets". */
export function byCount(count: number, one: string, other: string): string {
  return count === 1 ? one : other;
}

/** "#AB12" for an order, "#AB12-2" for its second ticket: the counter's own short reference. */
export function orderRef(orderId: string): string {
  return `#${orderId.replace(/-/g, "").slice(0, 4).toUpperCase()}`;
}

export function ticketRef(orderId: string | null, lineSeq: number | null, admissionId: string): string {
  if (!orderId) return `#${admissionId.replace(/-/g, "").slice(0, 4).toUpperCase()}`;
  // `line_seq` is minted 0-based; people count tickets from one.
  return lineSeq === null ? orderRef(orderId) : `${orderRef(orderId)}-${lineSeq + 1}`;
}

export type LookupRow = {
  readonly id: string;
  readonly holderName: string | null;
  readonly holderEmail?: string | null;
  readonly orderId: string | null;
  readonly lineSeq: number | null;
  readonly partySize: number;
  readonly admittedCount: number;
  readonly status: "valid" | "void" | "refunded";
  readonly seatedAt: string | null;
};

export type LookupGroup<T extends LookupRow> = {
  /** The order id, or the admission id for a walk-up sold without an order. */
  readonly key: string;
  readonly orderId: string | null;
  readonly ref: string;
  /** The first named holder on the order, or null when every ticket is unnamed. */
  readonly holderName: string | null;
  readonly rows: T[];
  readonly admitted: number;
};

/**
 * E09 groups tonight's list by ORDER: one result per order, its tickets on
 * the right. A walk-up sold at the events door has no order and is its own
 * group. Order of groups: the reader's (by holder name).
 */
export function groupByOrder<T extends LookupRow>(rows: readonly T[]): LookupGroup<T>[] {
  const groups = new Map<string, LookupGroup<T>>();
  for (const row of rows) {
    const key = row.orderId ?? row.id;
    let g = groups.get(key);
    if (!g) {
      g = { key, orderId: row.orderId, ref: row.orderId ? orderRef(row.orderId) : ticketRef(null, null, row.id), holderName: null, rows: [], admitted: 0 };
      groups.set(key, g);
    }
    g.rows.push(row);
  }
  return [...groups.values()].map((g) => ({
    ...g,
    holderName: g.rows.find((r) => r.holderName)?.holderName ?? null,
    admitted: g.rows.reduce((sum, r) => sum + (r.admittedCount > 0 ? 1 : 0), 0),
  }));
}

/** A lookup query against a whole order: any ticket's name or email, or the order's reference. */
export function groupMatches<T extends LookupRow>(group: LookupGroup<T>, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (group.ref.toLowerCase().includes(q) || group.ref.slice(1).toLowerCase().includes(q)) return true;
  return group.rows.some((r) => matchesGuest(r, q));
}
