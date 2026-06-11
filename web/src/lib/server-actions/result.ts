/**
 * Canonical result type for non-form server actions.
 *
 * Use `ok: true` for success (with optional data), `ok: false` for errors.
 * Invoked from drawers, buttons, callbacks where the caller checks `ok`
 * and dispatches a toast / state update.
 *
 * NOT used by form-state actions bound to React's `useFormState` —
 * those need a shape that carries `{ values, error }` on the error
 * branch so the form can re-render with the user's last input. See
 * `admin-inquiries.ts`, `admin-clients.ts`, `admin-talent.ts`,
 * `admin-bookings.ts`, `client-pipeline.ts`,
 * `talent-pipeline.ts`, `client-guest-merge.ts` for the form-state
 * shape. The divergence is intentional, not technical debt.
 *
 * Rule of thumb:
 *   - Action called via `form action={fn}` → form-state shape
 *   - Action called via `await fn(...)` from a click handler → ServerActionResult
 */
export type ServerActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; reason?: string };

// Convenience constructors
export const ok = <T>(data: T): ServerActionResult<T> => ({ ok: true, data });
export const fail = (error: string, reason?: string): ServerActionResult<never> => ({ ok: false, error, reason });
