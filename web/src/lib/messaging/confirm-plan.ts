/**
 * S3: the availability recheck that runs BEFORE a Messages confirm creates
 * anything (board D19, owner decision 4).
 *
 * Two pure pieces, both tested without a database:
 *
 *   `buildConfirmPlan`  - turns the lines of an accepted offer or a shared
 *                         draft into the list of checks that must pass.
 *   `runConfirmChecks`  - runs that list through injected READERS (the
 *                         calendar busy reader and the capacity remaining
 *                         reader the POS already uses) and names every
 *                         conflict as "<line> is no longer free on <date>".
 *
 * Neither piece writes. The writer (`confirm.ts`) refuses with
 * `unavailable` + `conflicts` when this returns any, and creates nothing.
 *
 * What is checked, per line kind:
 *   people (a talent)          -> the talent's calendar for the dated window
 *                                 (holds, bookings, availability blocks)
 *   resources / spaces / seats -> the capacity pool's remaining units for the
 *                                 window (a session tier pool, a space pool, a
 *                                 stock pool)
 *   menu / anything undated    -> nothing; recorded as a skipped line so the
 *                                 caller can see what was NOT checked.
 */

import type { BusyInterval } from "@/lib/scheduling/slots";
import { utcToZonedYmd } from "@/lib/scheduling/tz";

export type ConfirmSource = "offer" | "draft";

/** One line of the thing being confirmed, normalised from either source. */
export type ConfirmLineInput = {
  id: string;
  label: string;
  /** The person this line books, when it books one. */
  talentProfileId?: string | null;
  /** The pool this line consumes units from, when it consumes any. */
  poolId?: string | null;
  units?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  timezone?: string | null;
  /**
   * The draft already holds these units live (`capacity_allocations` under
   * this line, not released). Rechecking a pool the order itself is holding
   * would count our own hold against us; the hold IS the availability.
   */
  alreadyHeld?: boolean;
};

export type ConfirmCheck =
  | {
      kind: "person";
      lineId: string;
      label: string;
      talentProfileId: string;
      startsAt: string;
      endsAt: string;
      timezone: string | null;
    }
  | {
      kind: "capacity";
      lineId: string;
      label: string;
      poolId: string;
      units: number;
      startsAt: string | null;
      endsAt: string | null;
      timezone: string | null;
    };

export type ConfirmSkip = {
  lineId: string;
  label: string;
  why: "menu" | "no_date" | "already_held";
};

export type ConfirmPlan = {
  source: ConfirmSource;
  checks: ConfirmCheck[];
  skipped: ConfirmSkip[];
};

export type ConfirmConflict = {
  /** The line as the person reading the thread knows it. */
  line: string;
  /** EN sentence, e.g. "Ana is no longer free on 2026-09-20". */
  why: string;
  /** ISO instant of the window start, when the line has one. */
  at: string | null;
  code: "person_busy" | "capacity_short" | "capacity_unknown";
};

function positiveUnits(units: number | undefined): number {
  if (typeof units !== "number" || !Number.isFinite(units)) return 1;
  return Math.max(1, Math.trunc(units));
}

function datedWindow(line: ConfirmLineInput): { startsAt: string; endsAt: string } | null {
  if (!line.startsAt || !line.endsAt) return null;
  const s = Date.parse(line.startsAt);
  const e = Date.parse(line.endsAt);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null;
  return { startsAt: new Date(s).toISOString(), endsAt: new Date(e).toISOString() };
}

export function buildConfirmPlan(source: ConfirmSource, lines: readonly ConfirmLineInput[]): ConfirmPlan {
  const checks: ConfirmCheck[] = [];
  const skipped: ConfirmSkip[] = [];
  const seenPeople = new Set<string>();

  for (const line of lines) {
    const window = datedWindow(line);
    const hasPerson = !!line.talentProfileId;
    const hasPool = !!line.poolId;

    if (!hasPerson && !hasPool) {
      skipped.push({ lineId: line.id, label: line.label, why: "menu" });
      continue;
    }

    if (line.alreadyHeld) {
      skipped.push({ lineId: line.id, label: line.label, why: "already_held" });
      continue;
    }

    if (hasPerson) {
      if (!window) {
        skipped.push({ lineId: line.id, label: line.label, why: "no_date" });
      } else {
        // One talent booked twice on the same window by two lines is one
        // calendar question, not two.
        const key = `${line.talentProfileId}|${window.startsAt}|${window.endsAt}`;
        if (!seenPeople.has(key)) {
          seenPeople.add(key);
          checks.push({
            kind: "person",
            lineId: line.id,
            label: line.label,
            talentProfileId: line.talentProfileId as string,
            startsAt: window.startsAt,
            endsAt: window.endsAt,
            timezone: line.timezone ?? null,
          });
        }
      }
    }

    if (hasPool) {
      checks.push({
        kind: "capacity",
        lineId: line.id,
        label: line.label,
        poolId: line.poolId as string,
        units: positiveUnits(line.units),
        startsAt: window?.startsAt ?? null,
        endsAt: window?.endsAt ?? null,
        timezone: line.timezone ?? null,
      });
    }
  }

  return { source, checks, skipped };
}

/**
 * The readers a recheck needs. Both exist already:
 *   busy      -> `collectBusyIntervals` over talent_holds / talent_bookings /
 *                talent_availability_blocks (lib/scheduling/load-busy.ts)
 *   remaining -> `capacityRemaining` (lib/capacity/reserve.ts), null when the
 *                pool cannot be read.
 */
export type ConfirmReaders = {
  busy: (check: Extract<ConfirmCheck, { kind: "person" }>) => Promise<readonly BusyInterval[]>;
  remaining: (check: Extract<ConfirmCheck, { kind: "capacity" }>) => Promise<number | null>;
};

export function overlaps(a: { startsAt: string; endsAt: string }, b: BusyInterval): boolean {
  const s = Date.parse(a.startsAt);
  const e = Date.parse(a.endsAt);
  return b.startsAt.getTime() < e && b.endsAt.getTime() > s;
}

export function conflictDate(startsAt: string | null, timezone: string | null): string | null {
  if (!startsAt) return null;
  const instant = new Date(startsAt);
  if (Number.isNaN(instant.getTime())) return null;
  if (timezone) {
    const zoned = utcToZonedYmd(instant, timezone);
    if (zoned) return zoned;
  }
  return instant.toISOString().slice(0, 10);
}

function noLongerFree(label: string, startsAt: string | null, timezone: string | null): string {
  const date = conflictDate(startsAt, timezone);
  return date ? `${label} is no longer free on ${date}` : `${label} is no longer free`;
}

/**
 * Every check runs, so a refusal names EVERY conflict, not the first one; a
 * person fixing a two-line problem should not learn about the second line
 * after fixing the first.
 */
export async function runConfirmChecks(plan: ConfirmPlan, readers: ConfirmReaders): Promise<ConfirmConflict[]> {
  const conflicts: ConfirmConflict[] = [];
  for (const check of plan.checks) {
    if (check.kind === "person") {
      const busy = await readers.busy(check);
      if (busy.some((b) => overlaps(check, b))) {
        conflicts.push({
          line: check.label,
          why: noLongerFree(check.label, check.startsAt, check.timezone),
          at: check.startsAt,
          code: "person_busy",
        });
      }
      continue;
    }
    const remaining = await readers.remaining(check);
    if (remaining == null) {
      // Fail closed: a pool that cannot be read is not free.
      conflicts.push({
        line: check.label,
        why: `${check.label} could not be checked`,
        at: check.startsAt,
        code: "capacity_unknown",
      });
      continue;
    }
    if (remaining < check.units) {
      conflicts.push({
        line: check.label,
        why: noLongerFree(check.label, check.startsAt, check.timezone),
        at: check.startsAt,
        code: "capacity_short",
      });
    }
  }
  return conflicts;
}
