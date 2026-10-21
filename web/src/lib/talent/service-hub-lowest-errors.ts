/**
 * Maps the database function's errors for "lowest price I accept" to a reason
 * the screen can explain. Pure.
 *
 * `below_floor` (SQLSTATE 23514, DETAIL = the floor in cents) is raised by the
 * listing guard when the talent's new minimum puts the listing's client price
 * under its floor. It is NOT a generic invalid input: the fix is a lower minimum
 * or a higher workspace price, and the screen says so with the floor amount.
 */

export type LowestErrorLike = { code?: string | null; message?: string | null; details?: string | null };

export type LowestFailure =
  | { reason: "below_floor"; floorCents: number | null }
  | { reason: "invalid" | "not_allowed" | "not_ready" | "unavailable" };

export function classifyLowestError(error: LowestErrorLike): LowestFailure {
  if (error.code === "42501") return { reason: "not_allowed" };
  if (error.code === "23514" && (error.message ?? "").trim() === "below_floor") {
    // A missing or garbled detail is "unknown", never 0.
    const raw = (error.details ?? "").trim();
    return { reason: "below_floor", floorCents: /^\d{1,15}$/.test(raw) ? Number(raw) : null };
  }
  // Function or table missing (migrations held): honest, not a fake success.
  if (error.code === "PGRST202" || error.code === "42883" || error.code === "55000") return { reason: "not_ready" };
  if (error.code === "22023" || error.code === "23514") return { reason: "invalid" };
  return { reason: "unavailable" };
}
