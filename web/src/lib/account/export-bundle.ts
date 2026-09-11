import "server-only";

/**
 * Everything this platform holds about one signed-in person, as one file.
 *
 * THE DEFECT THIS CLOSES. `20260513181600_f11_user_privacy_prefs.sql` states
 * that privacy preferences are "exportable via /api/account/export". The route
 * has never existed. `requestDataExport` writes a timestamp into
 * `privacy_prefs.dataExportRequestedAt` and nothing reads it, so the export was
 * a rate-limit counter for a job that was never written. A person who asked for
 * their data got a stored date.
 *
 *
 * WHY A DECLARED REGISTRY AND NOT A HAND-ROLLED QUERY LIST
 * ═══════════════════════════════════════════════════════
 * A subject access request is only correct if it is COMPLETE, and completeness
 * is the thing an ad-hoc list silently loses: a table added next quarter joins
 * the schema and never joins the export, and nobody finds out because the
 * export still returns 200 with a plausible-looking file.
 *
 * So the sources are declared as data, each naming the table and the column
 * that ties a row to a person. That makes the set enumerable, which makes it
 * testable — `export-bundle.test.ts` asserts against the declaration rather
 * than against a fixture — and it makes adding a source a one-line change
 * next to fifteen others rather than a new query buried in a handler.
 *
 *
 * WHY EVERY SOURCE IS KEYED ON A USER COLUMN, NEVER ON AN EMAIL
 * ════════════════════════════════════════════════════════════
 * `customers` is deliberately tenant-scoped and deliberately does NOT unify the
 * same email across workspaces — that is a locked decision, and its header
 * argues it: two venues that both know a. person@example.com have two separate
 * relationships with them, and merging those would leak one venue's guest list
 * into another's.
 *
 * Matching on email here would quietly undo that. A signed-in user asking for
 * their data would receive every tenant's record of anybody sharing their
 * address, which is a cross-tenant disclosure dressed as a privacy feature.
 * So every source joins on a UUID the auth session owns, and guest purchase
 * records made without an account are out of scope by construction. That is a
 * real limitation and it is named in the bundle itself rather than hidden.
 *
 *
 * WHAT IS DELIBERATELY EXCLUDED
 * ═════════════════════════════
 * Anything that is somebody ELSE'S data with this person's id attached. A
 * booking's commission split, another party's contact details on a shared
 * thread, a talent's payout rail. The rule applied is: a column is exported
 * when it is about the requester, not when it merely mentions them.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";

/**
 * One place a person's data lives.
 *
 * `column` is the FK to `auth.users`. It is stated per source rather than
 * assumed to be `user_id` because it genuinely is not: bookings key on
 * `client_user_id`, notifications on `recipient_user_id`, and an assumption
 * here would return an empty array with no error — a silently incomplete
 * export, which is the worst possible outcome for this endpoint.
 */
export type ExportSource = {
  readonly key: string;
  readonly table: string;
  readonly column: string;
  /** Columns to return. Explicit, so a new column is a decision to export it. */
  readonly select: string;
};

export const EXPORT_SOURCES: readonly ExportSource[] = [
  {
    key: "profile",
    table: "profiles",
    column: "id",
    select: "id, display_name, avatar_url, account_status, app_role, onboarding_completed_at, created_at, updated_at",
  },
  {
    key: "preferences",
    table: "user_prefs",
    column: "user_id",
    // `unsubscribe_token` is deliberately absent. It is a bearer secret: anyone
    // holding it can unsubscribe this person, and an export file gets emailed,
    // forwarded and stored in places the session never was.
    select: "user_id, privacy_prefs, notification_prefs, preferred_surface, updated_at",
  },
  {
    key: "workspace_memberships",
    table: "agency_memberships",
    column: "profile_id",
    // Never the other members of the same workspace: that is a colleague list,
    // not this person's data.
    select: "tenant_id, role, status, invited_at, accepted_at, removed_at, created_at, updated_at",
  },
  {
    key: "staff_permissions",
    table: "staff_permissions",
    column: "user_id",
    select: "permission",
  },
  {
    key: "talent_profile",
    table: "talent_profiles",
    column: "user_id",
    select: "id, display_name, short_bio, visibility, workflow_status, claimed_at, created_at, updated_at",
  },
  {
    key: "bookings_as_client",
    table: "agency_bookings",
    column: "client_user_id",
    // Contact fields and dates only. Commission, talent cost and payout columns
    // are the AGENCY's commercial data on a row this person appears in.
    select: "id, tenant_id, title, status, starts_at, ends_at, contact_name, contact_email, contact_phone, created_at",
  },
  {
    key: "inquiries_as_client",
    table: "inquiries",
    column: "client_user_id",
    // The inquiry's own shape, not its message body: a thread has other people
    // in it and their words are not this person's record.
    select: "id, tenant_id, status, contact_name, contact_email, contact_phone, event_date, created_at, updated_at",
  },
  {
    key: "notifications",
    table: "notifications",
    column: "user_id",
    select: "id, tenant_id, title, body, created_at, read_at",
  },
] as const;

export type AccountExport = {
  readonly generatedAt: string;
  readonly subject: { readonly userId: string; readonly email: string | null };
  readonly data: Record<string, unknown[]>;
  /**
   * Sources that could not be read, by key.
   *
   * NAMED IN THE FILE rather than logged and dropped. An export missing a
   * section it could not read is indistinguishable from an export of a person
   * who has no rows there, and the person reading it has no way to tell. A
   * partial export that says which part is missing is honest; a silent one is
   * a false statement about what we hold.
   */
  readonly unavailable: string[];
  readonly notes: readonly string[];
};

const NOTES = [
  "This file covers records tied to your signed-in account.",
  "Purchases made as a guest, without signing in, are held by the individual business you bought "
    + "from and are not linked to this account. Contact that business directly for those.",
  "Rows where you appear as somebody else's counterparty are not included, because they are that "
    + "party's records rather than yours.",
] as const;

/**
 * Build the bundle.
 *
 * A source that fails is recorded and the export CONTINUES. Refusing the whole
 * request because one table was briefly unreadable would leave a person with
 * nothing at all; returning six of seven sections with the seventh named is
 * strictly better, and the caller can ask again.
 */
export async function buildAccountExport(
  admin: SupabaseClient,
  subject: { userId: string; email: string | null },
  sources: readonly ExportSource[] = EXPORT_SOURCES,
): Promise<AccountExport> {
  const data: Record<string, unknown[]> = {};
  const unavailable: string[] = [];

  for (const source of sources) {
    const { data: rows, error } = await admin
      .from(source.table)
      .select(source.select)
      .eq(source.column, subject.userId);
    if (error) {
      logServerError(`account.export/${source.key}`, error);
      unavailable.push(source.key);
      continue;
    }
    data[source.key] = (rows ?? []) as unknown[];
  }

  return {
    generatedAt: new Date().toISOString(),
    subject,
    data,
    unavailable,
    notes: NOTES,
  };
}

/** `tulala-account-export-2026-09-09.json`, stable and sortable. */
export function exportFilename(now: Date): string {
  return `tulala-account-export-${now.toISOString().slice(0, 10)}.json`;
}
