/**
 * rollout-ramp.ts — PURE (no "use server", no DB) ramp-logic for the G8 timed
 * rollout cron. Split out so the advance math + the auto-archive predicate are
 * unit-testable without a Supabase client. The cron route + the ramp-stamp
 * server action import these; tests import them directly.
 *
 * Two deterministic primitives:
 *
 *   computeRampStep(...) — given a template's current rollout_percentage, its
 *     ramp target (rollout_ramp_to), and a per-tick step size, decide the next
 *     rollout_percentage and whether the ramp is now complete (target reached,
 *     so the cron should clear rollout_ramp_to / rollout_ramp_at).
 *
 *   shouldAutoArchive(...) — given a status_expire_at and "now", decide whether a
 *     draft is past its expiry and should be flipped to archived.
 *
 * Both clamp to the same [0,100] integer domain `normalizeRolloutPatch` uses, so
 * the cron never writes an out-of-range percentage.
 */

/** Inclusive bounds for a rollout percentage (mirrors normalizeRolloutPatch). */
export const ROLLOUT_MIN = 0;
export const ROLLOUT_MAX = 100;

/** Default step the cron advances per tick when no per-template step is set. */
export const DEFAULT_RAMP_STEP = 10;

/** Clamp + round to the [0,100] integer rollout domain. NaN/∞ ⇒ clamped min. */
export function clampRollout(n: number): number {
  if (!Number.isFinite(n)) return ROLLOUT_MIN;
  const r = Math.round(n);
  return Math.max(ROLLOUT_MIN, Math.min(ROLLOUT_MAX, r));
}

export interface RampStepInput {
  /** The template's live rollout_percentage before this tick. */
  current: number;
  /** The ramp target (rollout_ramp_to). */
  target: number;
  /**
   * How far to move toward the target this tick. Defaults to DEFAULT_RAMP_STEP.
   * Negative / non-finite values are coerced to the default; the move always
   * heads toward the target regardless of the step's sign.
   */
  step?: number;
}

export interface RampStepResult {
  /** The rollout_percentage to write this tick (clamped, never past target). */
  next: number;
  /** True when `next` has reached the target ⇒ cron clears the ramp columns. */
  complete: boolean;
  /** True when `next` differs from `current` ⇒ a write + audit row is warranted. */
  changed: boolean;
}

/**
 * Advance `current` one step toward `target`, never overshooting. Works for both
 * up-ramps (10 → 100) and down-ramps (100 → 10). When the current value already
 * equals the (clamped) target, the ramp is immediately complete with no change.
 */
export function computeRampStep(input: RampStepInput): RampStepResult {
  const current = clampRollout(input.current);
  const target = clampRollout(input.target);

  // Resolve the step magnitude: a sane positive integer, defaulting when absent
  // or invalid. The direction is derived from current→target, not the sign.
  let stepMag = input.step === undefined ? DEFAULT_RAMP_STEP : Math.round(input.step);
  if (!Number.isFinite(stepMag) || stepMag <= 0) stepMag = DEFAULT_RAMP_STEP;
  stepMag = Math.abs(stepMag);

  if (current === target) {
    return { next: current, complete: true, changed: false };
  }

  const direction = target > current ? 1 : -1;
  const raw = current + direction * stepMag;
  // Don't overshoot: clamp the move to the target in the ramp direction.
  const next = direction > 0 ? Math.min(raw, target) : Math.max(raw, target);
  const clamped = clampRollout(next);

  return {
    next: clamped,
    complete: clamped === target,
    changed: clamped !== current,
  };
}

/**
 * True when a draft's status_expire_at has passed and it should be auto-archived.
 * A null/empty/unparseable expiry never archives (degrade safe). `now` is passed
 * in so the predicate stays pure + deterministic in tests.
 */
export function shouldAutoArchive(
  statusExpireAt: string | null | undefined,
  now: Date,
): boolean {
  if (!statusExpireAt) return false;
  const expiry = Date.parse(statusExpireAt);
  if (!Number.isFinite(expiry)) return false;
  return now.getTime() >= expiry;
}
