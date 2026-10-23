/**
 * staffing-holds.ts - the plan for holding picked people's dates on a job
 * before anything is confirmed (TUL-1373). For any coordinator of any agency
 * or network. Pure.
 *
 * The hold is the existing `talent_holds` row (firm, so two coordinators cannot
 * both hold the same person for overlapping time). It lapses on its own: after
 * a week, or when the job starts, whichever comes first.
 */

export const STAFFING_HOLD_MAX_DAYS = 7;
export const STAFFING_HOLD_MAX_PICKS = 50;

export type HoldWindow = { startsAt: string | null; endsAt: string | null };

export type HoldSkipReason = "already_assigned" | "already_held" | "duplicate";

export type HoldPlan =
  | { ok: false; reason: "no_window" | "window_past" | "none_picked" | "too_many" }
  | {
      ok: true;
      startsAt: string;
      endsAt: string;
      expiresAt: string;
      place: string[];
      skipped: Array<{ talentProfileId: string; reason: HoldSkipReason }>;
    };

export function planJobHolds(input: {
  window: HoldWindow;
  picked: readonly string[];
  /** People already on the job (a hold would collide with their own booking). */
  assignedIds: readonly string[];
  /** People who already carry a live hold for this job. */
  heldIds: readonly string[];
  now?: Date;
}): HoldPlan {
  const now = input.now ?? new Date();
  const s = input.window.startsAt ? Date.parse(input.window.startsAt) : NaN;
  const e = input.window.endsAt ? Date.parse(input.window.endsAt) : NaN;
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return { ok: false, reason: "no_window" };
  if (e <= now.getTime()) return { ok: false, reason: "window_past" };
  const picked = input.picked.filter((id) => typeof id === "string" && id.length > 0);
  if (picked.length === 0) return { ok: false, reason: "none_picked" };
  if (picked.length > STAFFING_HOLD_MAX_PICKS) return { ok: false, reason: "too_many" };

  const assigned = new Set(input.assignedIds);
  const held = new Set(input.heldIds);
  const seen = new Set<string>();
  const place: string[] = [];
  const skipped: Array<{ talentProfileId: string; reason: HoldSkipReason }> = [];
  for (const id of picked) {
    if (seen.has(id)) {
      skipped.push({ talentProfileId: id, reason: "duplicate" });
      continue;
    }
    seen.add(id);
    if (assigned.has(id)) skipped.push({ talentProfileId: id, reason: "already_assigned" });
    else if (held.has(id)) skipped.push({ talentProfileId: id, reason: "already_held" });
    else place.push(id);
  }
  const cap = now.getTime() + STAFFING_HOLD_MAX_DAYS * 86_400_000;
  // Never outlive the job: a hold that lasts past the start is a hold on a day already worked.
  const expiresMs = Math.min(cap, s > now.getTime() ? s : cap);
  return {
    ok: true,
    startsAt: new Date(s).toISOString(),
    endsAt: new Date(e).toISOString(),
    expiresAt: new Date(expiresMs).toISOString(),
    place,
    skipped,
  };
}

/** The small tag next to a held person: "Held until Nov 3" style is done by the screen; this is the state word. */
export function holdTag(expiresAt: string | null, locale: string, now: Date = new Date()): string {
  const es = locale.toLowerCase().startsWith("es");
  if (!expiresAt) return es ? "Reservado" : "Held";
  const ms = Date.parse(expiresAt);
  if (!Number.isFinite(ms) || ms <= now.getTime()) return es ? "Reserva vencida" : "Hold lapsed";
  return es ? "Reservado" : "Held";
}
