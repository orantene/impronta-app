/**
 * rules.ts — parsing a venue's reservation rules, fail-closed.
 *
 * The rule this file exists to hold: GARBAGE IN, DEFAULT OUT, NEVER A GUESS.
 * A malformed `turn_time_bands` blob yields `defaultTurnMinutes` for every
 * party. It does not yield the bands it could salvage, because a half-read band
 * table is a turn time that is wrong for exactly the party sizes whose rows were
 * broken, and nobody finds out until a table is double-seated.
 *
 * PURE. No DB.
 */

import type { ServiceRules, TurnTimeBand } from "./types";

const DEFAULT_TURN_MINUTES = 90;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function intIn(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isInteger(v)) return null;
  if (v < min || v > max) return null;
  return v;
}

/**
 * Bands, or an empty array. Never a partial list.
 *
 * Refuses: a non-array, an empty array, a malformed entry, an inverted range,
 * and any overlap between two bands. Overlap is refused rather than resolved by
 * order, because "first match wins" makes the turn time depend on how the rows
 * happen to be sorted, which is not a decision anyone made.
 */
export function parseTurnTimeBands(raw: unknown): TurnTimeBand[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];

  const bands: TurnTimeBand[] = [];
  for (const entry of raw) {
    if (!isPlainObject(entry)) return [];
    const minParty = intIn(entry.minParty ?? entry.min_party, 1, 1000);
    const maxParty = intIn(entry.maxParty ?? entry.max_party, 1, 1000);
    const turnMinutes = intIn(entry.turnMinutes ?? entry.turn_minutes, 5, 1440);
    if (minParty === null || maxParty === null || turnMinutes === null) return [];
    if (maxParty < minParty) return [];
    bands.push({ minParty, maxParty, turnMinutes });
  }

  const sorted = [...bands].sort((a, b) => a.minParty - b.minParty);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.minParty <= sorted[i - 1]!.maxParty) return [];
  }
  return sorted;
}

type RulesRow = {
  venue_id?: unknown;
  is_active?: unknown;
  party_size_min?: unknown;
  party_size_max?: unknown;
  horizon_days?: unknown;
  min_notice_minutes?: unknown;
  turn_time_bands?: unknown;
  default_turn_minutes?: unknown;
  allow_public_upsize?: unknown;
  card_on_file_from_party?: unknown;
  no_show_fee_cents?: unknown;
  no_show_fee_basis?: unknown;
  no_show_grace_minutes?: unknown;
  deposit_from_party?: unknown;
  deposit_cents_per_person?: unknown;
  free_cancel_hours?: unknown;
  waitlist_enabled?: unknown;
  walkins_enabled?: unknown;
  notes_enabled?: unknown;
};

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = intIn(v, min, max);
  return n === null ? fallback : n;
}

/**
 * A threshold, or `null` meaning NEVER ASK.
 *
 * `null` and a number are different statements, so a bad value collapses to
 * `null` — never to 0, which would mean "ask every party of one", and never to
 * a large sentinel, which would mean "ask nobody" while looking like a number
 * somebody chose.
 */
function threshold(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  return intIn(v, 1, 1000);
}

function money(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return Math.round(v);
  // Postgres returns BIGINT as a string through PostgREST.
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  return 0;
}

/** Parse a `venue_service_rules` row. Every field independently fail-closed. */
export function parseServiceRules(row: unknown, venueId: string): ServiceRules {
  const r: RulesRow = isPlainObject(row) ? row : {};

  const partySizeMin = clampInt(r.party_size_min, 1, 1000, 1);
  const partySizeMaxRaw = clampInt(r.party_size_max, 1, 1000, 8);

  return {
    venueId,
    isActive: bool(r.is_active, false),
    partySizeMin,
    // A max below the min is not a range; widening to the min is the only
    // reading that offers anything at all, and it is visible in the UI.
    partySizeMax: Math.max(partySizeMaxRaw, partySizeMin),
    horizonDays: clampInt(r.horizon_days, 1, 365, 60),
    minNoticeMinutes: clampInt(r.min_notice_minutes, 0, 60 * 24 * 365, 120),
    turnTimeBands: parseTurnTimeBands(r.turn_time_bands),
    defaultTurnMinutes: clampInt(r.default_turn_minutes, 15, 720, DEFAULT_TURN_MINUTES),
    allowPublicUpsize: bool(r.allow_public_upsize, false),
    cardOnFileFromParty: threshold(r.card_on_file_from_party),
    noShowFeeCents: money(r.no_show_fee_cents),
    noShowFeeBasis: r.no_show_fee_basis === "per_party" ? "per_party" : "per_person",
    noShowGraceMinutes: clampInt(r.no_show_grace_minutes, 0, 240, 30),
    depositFromParty: threshold(r.deposit_from_party),
    depositCentsPerPerson: money(r.deposit_cents_per_person),
    freeCancelHours:
      typeof r.free_cancel_hours === "number" && Number.isFinite(r.free_cancel_hours)
        ? Math.max(0, r.free_cancel_hours)
        : typeof r.free_cancel_hours === "string" && /^\d+(\.\d+)?$/.test(r.free_cancel_hours)
          ? Number(r.free_cancel_hours)
          : 2,
    waitlistEnabled: bool(r.waitlist_enabled, false),
    walkinsEnabled: bool(r.walkins_enabled, true),
    notesEnabled: bool(r.notes_enabled, true),
  };
}

/**
 * The turn time for a party, in minutes.
 *
 * No band matching the party falls through to the default rather than to the
 * nearest band: a party outside every band is a party nobody wrote a rule for,
 * and borrowing a neighbouring band's number invents one.
 */
export function turnMinutesForParty(rules: ServiceRules, partySize: number): number {
  if (!Number.isInteger(partySize) || partySize < 1) return rules.defaultTurnMinutes;
  for (const band of rules.turnTimeBands) {
    if (partySize >= band.minParty && partySize <= band.maxParty) return band.turnMinutes;
  }
  return rules.defaultTurnMinutes;
}

/** Does this party need a card on file? `null` threshold means never. */
export function requiresCardOnFile(rules: ServiceRules, partySize: number): boolean {
  return rules.cardOnFileFromParty !== null && partySize >= rules.cardOnFileFromParty;
}

/** Deposit for this party in integer cents. `null` threshold means never. */
export function depositCentsForParty(rules: ServiceRules, partySize: number): number {
  if (rules.depositFromParty === null || partySize < rules.depositFromParty) return 0;
  return rules.depositCentsPerPerson * partySize;
}

/** No-show fee in integer cents, per the venue's basis. */
export function noShowFeeCentsForParty(rules: ServiceRules, partySize: number): number {
  if (rules.noShowFeeCents === 0) return 0;
  return rules.noShowFeeBasis === "per_party"
    ? rules.noShowFeeCents
    : rules.noShowFeeCents * partySize;
}
