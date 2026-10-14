/**
 * Product filter for talent Messages: hide agent/journey fixture threads (rows
 * marked `source_context.qa_fixture`) from a live talent's inbox. Prefer this over deleting production rows.
 *
 * Demo talents (`is_demo`) keep seeing their journey data — that account is
 * the fixture. Live talents should not.
 */

import type { InboxRow } from "@/lib/messaging/types";

/**
 * TUL-622: a fixture is what its row SAYS it is (`inquiries.source_context.qa_fixture`),
 * never what its display text looks like. Name, @example.com and body-text
 * matching hid real clients ("QA Solutions", "please ignore my earlier date").
 */
export const QA_FIXTURE_CONTEXT_KEY = "qa_fixture";

/** Reads the explicit marker off an inquiry's `source_context` jsonb. */
export function readQaFixtureMarker(sourceContext: unknown): boolean {
  if (!sourceContext || typeof sourceContext !== "object" || Array.isArray(sourceContext)) return false;
  return (sourceContext as Record<string, unknown>)[QA_FIXTURE_CONTEXT_KEY] === true;
}

// TODO(TUL-622): remove this fallback once the qa_fixture backfill has run on prod.
const TRANSITION_TEST_EMAIL_SUFFIX = "@impronta.test";

type FixtureProbe = Pick<InboxRow, "contactEmail"> & { qaFixture?: boolean };

export function isQaFixtureInboxRow(row: FixtureProbe): boolean {
  if (row.qaFixture === true) return true;
  return (row.contactEmail ?? "").trim().toLowerCase().endsWith(TRANSITION_TEST_EMAIL_SUFFIX);
}

export function filterQaFixtureInboxRows<T extends FixtureProbe & Pick<InboxRow, "unread">>(
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
