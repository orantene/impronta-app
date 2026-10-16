/**
 * Notification email copies: the kinds an address on the platform-admin copy
 * list can subscribe to, and which catalog entries each kind covers. Pure: no
 * IO, safe for client components and unit tests.
 *
 * The allowed set is mirrored by the CHECK constraint in
 * supabase/migrations/20261231380500_notification_email_copies.sql.
 */

export const COPY_KINDS = [
  "support_new",
  "support_urgent",
  "support_inbound",
  "leads",
  "payment_issues",
] as const;

export type CopyKind = (typeof COPY_KINDS)[number];

export const COPY_KIND_LABELS: Record<CopyKind, string> = {
  support_new: "New support tickets",
  support_urgent: "Urgent / escalated tickets",
  support_inbound: "Support email replies",
  leads: "New leads",
  payment_issues: "Payment issues",
};

/**
 * Catalog entry id to copy kind. `support_inbound` has no catalog entry: it is
 * fed by the Resend inbound webhook (resend-inbound-forward.ts).
 */
const ENTRY_TO_KIND: Readonly<Record<string, CopyKind>> = {
  "support.ticket.created.platform": "support_new",
  "support.ticket.escalated.platform": "support_urgent",
  "inquiry.submitted.coordinator": "leads",
  "payment.failed.workspace": "payment_issues",
  "refund.failed.workspace": "payment_issues",
  "payment.needs_attention.workspace": "payment_issues",
  "payment.dispute.opened.platform": "payment_issues",
};

export function copyKindForEntry(entryId: string): CopyKind | null {
  return Object.prototype.hasOwnProperty.call(ENTRY_TO_KIND, entryId)
    ? ENTRY_TO_KIND[entryId]
    : null;
}

export function catalogEntriesForKind(kind: CopyKind): string[] {
  return Object.entries(ENTRY_TO_KIND)
    .filter(([, k]) => k === kind)
    .map(([id]) => id);
}

export function isCopyKind(value: unknown): value is CopyKind {
  return typeof value === "string" && (COPY_KINDS as readonly string[]).includes(value);
}

/** Keep only known kinds, deduped, in canonical order. */
export function normalizeCopyKinds(values: readonly unknown[]): CopyKind[] {
  const set = new Set(values.filter(isCopyKind));
  return COPY_KINDS.filter((k) => set.has(k));
}

export type CopyListRow = {
  email: string;
  kinds: readonly string[] | null;
  paused: boolean | null;
};

/** Active (not paused) addresses subscribed to `kind`, lowercased + deduped. */
export function filterActiveCopyRecipients(
  rows: readonly CopyListRow[],
  kind: CopyKind,
): string[] {
  const out = new Set<string>();
  for (const r of rows) {
    if (r.paused) continue;
    if (!(r.kinds ?? []).includes(kind)) continue;
    const email = (r.email ?? "").trim().toLowerCase();
    if (email) out.add(email);
  }
  return [...out];
}

const EMAIL_SHAPE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

/** Basic address shape check, same as the table CHECK constraint. */
export function isPlausibleCopyEmail(value: string): boolean {
  return EMAIL_SHAPE.test(value.trim());
}

/**
 * Inbound forward targets: the list wins whenever it has ANY rows (even if all
 * are paused or none subscribe to support_inbound: then nobody gets a copy).
 * The env fallback applies only when the list is completely empty.
 */
export function resolveInboundTargets(args: {
  listIsEmpty: boolean;
  listRecipients: readonly string[];
  envTarget: string | null;
}): { targets: string[]; source: "list" | "env" } {
  if (args.listIsEmpty) {
    return { targets: args.envTarget ? [args.envTarget] : [], source: "env" };
  }
  return { targets: [...args.listRecipients], source: "list" };
}
