/**
 * TUL-1722: the owner's per-role refund / discount limits for managers and
 * admins. Unset is CLOSED since TUL-1516 (O4): the engine refuses a refund or
 * discount for a role with no `role_limits` row. Pure, so the settings card,
 * the owner-only server action and the tests share one reading of "unset".
 */

export type StaffLimitRole = "manager" | "admin";
export type StaffLimitAction = "discount" | "refund";

export const STAFF_LIMIT_ROLES: readonly StaffLimitRole[] = ["manager", "admin"];
export const STAFF_LIMIT_ACTIONS: readonly StaffLimitAction[] = ["refund", "discount"];

export type StaffLimitWrite = { role: StaffLimitRole; action: StaffLimitAction; limitCents: number | null };

/** Cents per role and action; null (or absent) is closed. */
export type StaffLimitsInput = Readonly<Record<StaffLimitRole, Readonly<Record<StaffLimitAction, number | null>>>>;

/** One write per cell, in a fixed order. A null deletes the row, so the cell is closed again. */
export function planStaffLimitWrites(input: StaffLimitsInput): StaffLimitWrite[] {
  const out: StaffLimitWrite[] = [];
  for (const role of STAFF_LIMIT_ROLES) {
    for (const action of STAFF_LIMIT_ACTIONS) {
      out.push({ role, action, limitCents: input[role][action] });
    }
  }
  return out;
}

/** Which of the four manager / admin cells have no row (closed). */
export function closedStaffCells(rows: ReadonlyArray<{ role: string; action: string }>): Array<{ role: StaffLimitRole; action: StaffLimitAction }> {
  const closed: Array<{ role: StaffLimitRole; action: StaffLimitAction }> = [];
  for (const role of STAFF_LIMIT_ROLES) {
    for (const action of STAFF_LIMIT_ACTIONS) {
      if (!rows.some((r) => r.role === role && r.action === action)) closed.push({ role, action });
    }
  }
  return closed;
}

/** "" is closed (null); a number of 0 or more is that many currency units, in cents. */
export function parseStaffLimit(raw: string, divisor: number): { ok: true; cents: number | null } | { ok: false } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, cents: null };
  const n = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return { ok: false };
  return { ok: true, cents: Math.round(n * divisor) };
}
