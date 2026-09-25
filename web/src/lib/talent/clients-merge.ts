export type TalentClientRow = {
  id: string;
  name: string;
  lastVisit: string | null;
  visitCount: number;
  amountOwedCents: number | null;
  currency: string | null;
  conversationHref: string | null;
  source: "inquiry" | "booking";
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

/**
 * Merge one source row into the client map.
 * `accumulateVisit` — true for agency legs only, so talent calendar mirrors
 * and inquiry stubs do not double-count the same appointment.
 */
export function upsertClient(
  byKey: Map<string, TalentClientRow>,
  row: TalentClientRow,
  opts: { inquiryId: string | null | undefined; accumulateVisit: boolean },
): void {
  const key = clientMergeKey({
    prefixedId: row.id,
    inquiryId: opts.inquiryId,
  });
  const existing = byKey.get(key);
  if (!existing) {
    byKey.set(key, { ...row, id: key });
    return;
  }
  if (opts.accumulateVisit && row.visitCount > 0) {
    existing.visitCount += row.visitCount;
  }
  if (row.lastVisit && (!existing.lastVisit || row.lastVisit > existing.lastVisit)) {
    existing.lastVisit = row.lastVisit;
  }
  if (!existing.conversationHref && row.conversationHref) {
    existing.conversationHref = row.conversationHref;
  }
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
  // Prefer booking provenance when we later learn of a real visit.
  if (existing.source === "inquiry" && row.source === "booking") {
    existing.source = "booking";
  }
}
