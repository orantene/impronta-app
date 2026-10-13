/**
 * Product filter for talent Messages: hide agent/journey fixture threads from
 * a live talent's inbox. Prefer this over deleting production rows.
 *
 * Demo talents (`is_demo`) keep seeing their journey data — that account is
 * the fixture. Live talents should not.
 */

import type { InboxRow } from "@/lib/messaging/types";

const TEST_EMAIL_SUFFIXES = ["@impronta.test", "@example.com", "@example.org"] as const;

/** Local-parts used by seeded PathA/PathB / tip-prove / Bozo journeys. */
const QA_EMAIL_LOCAL = /^(qa[-.+]|tip[-.+]|bozo|ana\.(fd\.)?(qa|retest|strip)|pathb)/i;

/** Display names agents stamp on fixture guests. */
const QA_NAME = /^(QA\b|Bozo\b|Tip\b|PATHB\b)/i;

/** Bodies/subjects that are clearly test instructions, not a real client. */
const QA_BODY =
  /\b(QA test|please ignore|PATHB|TIP-OFERTA-PROVE|D-MSG-|controlled submit|tip prove|Story \d+ QA)\b/i;

export function isQaFixtureInboxRow(
  row: Pick<InboxRow, "contactName" | "contactEmail" | "subject" | "lastMessagePreview">,
): boolean {
  const email = (row.contactEmail ?? "").trim().toLowerCase();
  if (email) {
    if (TEST_EMAIL_SUFFIXES.some((suffix) => email.endsWith(suffix))) return true;
    const local = email.split("@")[0] ?? "";
    if (QA_EMAIL_LOCAL.test(local)) return true;
  }
  const name = row.contactName.trim();
  if (name && QA_NAME.test(name)) return true;
  const haystack = `${row.subject}\n${row.lastMessagePreview}`;
  if (QA_BODY.test(haystack)) return true;
  return false;
}

export function filterQaFixtureInboxRows<T extends Pick<InboxRow, "contactName" | "contactEmail" | "subject" | "lastMessagePreview" | "unread">>(
  rows: readonly T[],
): { rows: T[]; unreadCount: number } {
  const kept = rows.filter((row) => !isQaFixtureInboxRow(row));
  return {
    rows: kept,
    unreadCount: kept.reduce((n, row) => n + (row.unread ? 1 : 0), 0),
  };
}

/**
 * Who keeps fixture threads in Messages: demo talents, and QA accounts (their
 * display name starts with "QA", e.g. "QA Fixture - Max Talent"). Without the
 * second case a QA talent's own test client ("QA Grok Cliente") matched the
 * fixture filter, so its guest chat and quote showed "no messages yet".
 * A real talent never has a name starting with "QA".
 */
export function talentKeepsFixtureThreads(talent: { isDemo: boolean; displayName?: string | null }): boolean {
  return talent.isDemo || /^QA\b/i.test((talent.displayName ?? "").trim());
}
