/**
 * Canonical result type for all server actions.
 * Use `ok: true` for success (with optional data), `ok: false` for errors.
 */
export type ServerActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; reason?: string };

// Convenience constructors
export const ok = <T>(data: T): ServerActionResult<T> => ({ ok: true, data });
export const fail = (error: string, reason?: string): ServerActionResult<never> => ({ ok: false, error, reason });
