export type TalentClientNextStatus = "confirmed" | "hold" | "requested";

export type TalentClientRow = {
  id: string;
  name: string;
  lastVisit: string | null;
  /** Completed (past) visits — used for New filter and "X completed". */
  completedCount: number;
  /** @deprecated prefer completedCount; kept as alias while callers migrate. */
  visitCount: number;
  amountOwedCents: number | null;
  currency: string | null;
  conversationHref: string | null;
  source: "inquiry" | "booking";
  phone: string | null;
  email: string | null;
  nextStartsAt: string | null;
  nextStatus: TalentClientNextStatus | null;
  nextBookingHref: string | null;
  overdue: boolean;
};

/**
 * Person key for the Clients directory.
 * - Prefer inquiry id when present (unifies message + agency + talent mirror).
 * - Else bare booking uuid so `booking:X` and `agency:X` collapse (create-slot
 *   mirrors share the PK). Never key by lower-cased name (A5 / defect #6).
 */
export function clientMergeKey(opts: {
  prefixedId: string;
  inquiryId: string | null | undefined;
}): string {
  if (opts.inquiryId) return `inquiry:${opts.inquiryId}`;
  const colon = opts.prefixedId.indexOf(":");
  return colon >= 0 ? opts.prefixedId.slice(colon + 1) : opts.prefixedId;
}

function preferSoonerNext(
  existing: TalentClientRow,
  incoming: TalentClientRow,
): void {
  if (!incoming.nextStartsAt) return;
  if (!existing.nextStartsAt || incoming.nextStartsAt < existing.nextStartsAt) {
    existing.nextStartsAt = incoming.nextStartsAt;
    existing.nextStatus = incoming.nextStatus;
    existing.nextBookingHref = incoming.nextBookingHref;
  }
}

/**
 * Merge one source row into the client map.
 * `accumulateVisit` — true for agency legs only, so talent calendar mirrors
 * and inquiry stubs do not double-count the same appointment.
 * `countCompleted` — when true and the visit is in the past, bump completedCount.
 */
export function upsertClient(
  byKey: Map<string, TalentClientRow>,
  row: TalentClientRow,
  opts: {
    inquiryId: string | null | undefined;
    accumulateVisit: boolean;
    countCompleted?: boolean;
  },
): void {
  const key = clientMergeKey({
    prefixedId: row.id,
    inquiryId: opts.inquiryId,
  });
  const existing = byKey.get(key);
  if (!existing) {
    byKey.set(key, {
      ...row,
      id: key,
      visitCount: row.completedCount,
    });
    return;
  }
  if (opts.accumulateVisit && opts.countCompleted && row.completedCount > 0) {
    existing.completedCount += row.completedCount;
    existing.visitCount = existing.completedCount;
  }
  if (row.lastVisit && (!existing.lastVisit || row.lastVisit > existing.lastVisit)) {
    existing.lastVisit = row.lastVisit;
  }
  if (!existing.conversationHref && row.conversationHref) {
    existing.conversationHref = row.conversationHref;
  }
  if (!existing.phone && row.phone) existing.phone = row.phone;
  if (!existing.email && row.email) existing.email = row.email;
  if (row.overdue) existing.overdue = true;
  if (row.amountOwedCents != null) {
    if (existing.amountOwedCents == null) {
      existing.amountOwedCents = row.amountOwedCents;
      existing.currency = row.currency;
    } else if (opts.accumulateVisit) {
      // Multiple agency bookings for the same person (same inquiry).
      existing.amountOwedCents += row.amountOwedCents;
      existing.currency = row.currency ?? existing.currency;
    }
  }
  preferSoonerNext(existing, row);
  // Prefer booking provenance when we later learn of a real visit.
  if (existing.source === "inquiry" && row.source === "booking") {
    existing.source = "booking";
  }
}
