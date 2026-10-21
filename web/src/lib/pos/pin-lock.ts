/**
 * TUL-1723: a locked PIN is not a typo. After five wrong PINs in five minutes
 * the engine (`pos_unlock_till`, `pos_approve_custom_amount`) answers
 * `pin_throttled` without checking the PIN, and the till and the manager
 * approval dialog say so with the wait time instead of "That PIN is not right".
 *
 * Pure: no server-only import, so the client screens and the tests share it.
 */

/** The sliding window of the throttle (staff_pin_attempts, TUL-1516). */
export const PIN_LOCK_WINDOW_MINUTES = 5;

/** Whole minutes to show: the engine's seconds rounded up, else the full window. */
export function pinLockMinutes(retryAfterSeconds?: number | null): number {
  if (typeof retryAfterSeconds === "number" && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(PIN_LOCK_WINDOW_MINUTES, Math.max(1, Math.ceil(retryAfterSeconds / 60)));
  }
  return PIN_LOCK_WINDOW_MINUTES;
}

/** Fill `{minutes}` in the catalogue sentence. */
export function pinLockSentence(template: string, retryAfterSeconds?: number | null): string {
  return template.replace("{minutes}", String(pinLockMinutes(retryAfterSeconds)));
}

/** What a screen keeps from a refusal: the sentence and whether it is the lockout. */
export type PinStatus = { readonly text: string; readonly locked: boolean };

export function pinStatusFor(
  refusal: Readonly<Record<string, string>>,
  reason: unknown,
  retryAfterSeconds?: unknown,
): PinStatus {
  const secs = typeof retryAfterSeconds === "number" ? retryAfterSeconds : null;
  if (reason === "pin_throttled") {
    return { text: pinLockSentence(refusal.pin_throttled ?? refusal.unavailable ?? "", secs), locked: true };
  }
  const text = (typeof reason === "string" && refusal[reason]) || refusal.unavailable || "";
  return { text, locked: false };
}
