/**
 * Refund ONE ticket of a multi-ticket line (TUL-1429 / TUL-1431).
 *
 * A paid ticket line carries `units` tickets (one `admissions` row each). The
 * line-level refund voided and repaid ALL of them when ONE holder asked. This
 * module is the pure arithmetic and selection for the per-unit path: which
 * admissions a request may touch, and what they are worth. No I/O; the
 * executor (`refund-execute-lines.ts`) reads the rows and moves the money.
 */

export type UnitAdmission = { id: string; admittedCount: number; status: string };

export type UnitScope =
  | { ok: true; amountCents: number; selectedIds: string[] }
  | { ok: false; reason: "admission_not_on_line" | "already_admitted" | "line_already_refunded" };

/**
 * @param remainingCents what the line can still return (net of its discount share, minus refunds)
 * @param netCents       what the line was worth in total (net of its discount share), the per-unit base
 * @param admissions     EVERY admission minted for the line, any status
 * @param selectedIds    the admissions this refund is for
 */
export function scopeUnitRefund(input: {
  remainingCents: number;
  netCents: number;
  admissions: readonly UnitAdmission[];
  selectedIds: readonly string[];
}): UnitScope {
  const byId = new Map(input.admissions.map((a) => [a.id, a]));
  const selected = [...new Set(input.selectedIds)];
  if (selected.length === 0 || selected.some((id) => !byId.has(id))) {
    return { ok: false, reason: "admission_not_on_line" };
  }
  const picked = selected.map((id) => byId.get(id)!);
  if (picked.some((a) => a.status === "refunded")) return { ok: false, reason: "line_already_refunded" };
  if (picked.some((a) => a.admittedCount > 0)) return { ok: false, reason: "already_admitted" };

  const units = input.admissions.length;
  const remaining = Math.max(0, Math.trunc(input.remainingCents));
  const net = Math.max(0, Math.trunc(input.netCents));
  // Whoever takes the LAST unrefunded tickets takes the remainder, so rounding
  // never strands a cent on a line that is otherwise fully refunded.
  const untouched = input.admissions.filter((a) => a.status !== "refunded");
  const takesEverythingLeft = untouched.length === picked.length;
  const share = takesEverythingLeft ? remaining : Math.floor((net * picked.length) / Math.max(1, units));
  return { ok: true, amountCents: Math.min(remaining, share), selectedIds: selected };
}
