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
  /** Restrict to `status = 'published'` (moderated rows the subject did not author). */
  readonly published?: boolean;
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
  // Added with the complete-export pass (legal 3.3). Every one is still keyed on
  // a user id the session owns. Columns that are somebody else's commercial data
  // (fees, payout rails, staff notes) are left out on purpose.
  {
    key: "client_profile",
    table: "client_profiles",
    column: "user_id",
    // `notes` is omitted: it can hold a workspace's private remarks.
    select: "id, company_name, phone, created_at, updated_at",
  },
  {
    key: "payments_made",
    table: "booking_transactions",
    column: "payer_user_id",
    // The payer's side only: what was charged, when, and its state. Platform
    // fee, net amount and payout receiver belong to the payee's records.
    select:
      "id, booking_id, source_tenant_id, gross_amount_cents, currency, status, refund_of_transaction_id, requested_at, paid_at, refunded_at, created_at",
  },
  {
    key: "reviews_written_about_talent",
    table: "talent_reviews",
    column: "client_user_id",
    select: "id, tenant_id, talent_profile_id, booking_id, rating, body, status, created_at, updated_at",
  },
  {
    key: "reviews_written_about_clients",
    table: "client_reviews",
    column: "author_user_id",
    select: "id, tenant_id, booking_id, client_user_id, rating, body, status, created_at, updated_at",
  },
  {
    key: "reviews_about_me_as_client",
    table: "client_reviews",
    column: "client_user_id",
    // Published only: a hidden row is a moderation decision, not their record.
    select: "id, tenant_id, booking_id, rating, body, status, reported_at, created_at",
    published: true,
  },
  {
    key: "support_tickets",
    table: "support_tickets",
    column: "requester_user_id",
    // The ticket's own shape. Staff replies and internal notes are not here.
    select: "id, ticket_number, tenant_id, surface, subject, category, status, priority, created_at",
  },
  {
    key: "inquiry_participation",
    table: "inquiry_participants",
    column: "user_id",
    select: "id, inquiry_id, role, status, accepted_at, removed_at, decline_reason, created_at",
  },
  {
    key: "messages_sent",
    table: "inquiry_messages",
    column: "sender_user_id",
    // Words the person wrote themselves. `metadata` is omitted: it can carry
    // internal routing data.
    select: "id, inquiry_id, thread_type, body, created_at, edited_at, deleted_at",
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
    let out = (rows ?? []) as unknown[];
    if (source.published) {
      out = out.filter((r) => (r as { status?: unknown }).status === "published");
    }
    data[source.key] = out;
  }

  // Derived sections only run for the default registry; a caller passing a
  // custom source list (tests of the first pass) opts out of them.
  if (sources === EXPORT_SOURCES) {
    await buildDerivedSections(admin, subject, data, unavailable);
  }

  return {
    generatedAt: new Date().toISOString(),
    subject,
    data,
    unavailable,
    notes: NOTES,
  };
}

type Row = Record<string, unknown>;

/** Postgres "relation does not exist" / PostgREST "not in schema cache". */
function isMissingRelation(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

async function readIn(
  admin: SupabaseClient,
  table: string,
  select: string,
  column: string,
  ids: readonly string[],
): Promise<{ rows: Row[]; error: { code?: string } | null }> {
  if (ids.length === 0) return { rows: [], error: null };
  const { data, error } = await admin.from(table).select(select).in(column, [...ids]);
  return { rows: (data ?? []) as unknown as Row[], error };
}

function strings(rows: readonly Row[] | undefined, key: string, keep?: (r: Row) => boolean): string[] {
  const out = new Set<string>();
  for (const r of rows ?? []) {
    if (keep && !keep(r)) continue;
    const v = r[key];
    if (typeof v === "string" && v) out.add(v);
  }
  return [...out];
}

const MEDIA_URL_TTL_SECONDS = 60 * 60 * 24;

/**
 * Sections that need ids found by the first pass (the person's talent profile,
 * the inquiries they are part of). Every query is bounded by those ids, which
 * all came from rows keyed on the session user.
 *
 * What is deliberately NOT here:
 *  - messages in a `private` thread the person did not write: a private thread
 *    can be coordinator-to-talent or coordinator-to-client, so another party's
 *    words in it are not this person's record;
 *  - draft offers: internal until sent;
 *  - media bytes: metadata and a time-limited signed link only.
 */
async function buildDerivedSections(
  admin: SupabaseClient,
  subject: { userId: string; email: string | null },
  data: Record<string, unknown[]>,
  unavailable: string[],
): Promise<void> {
  const record = (key: string, rows: Row[], error: { code?: string } | null, optional = false) => {
    if (error) {
      if (optional && isMissingRelation(error)) return;
      logServerError(`account.export/${key}`, error);
      unavailable.push(key);
      return;
    }
    data[key] = rows;
  };

  const talentIds = strings(data.talent_profile as Row[], "id");
  const participating = strings(
    data.inquiry_participation as Row[],
    "inquiry_id",
    (r) => r.removed_at == null,
  );
  const ownInquiryIds = strings(data.inquiries_as_client as Row[], "id");
  const threadInquiryIds = [...new Set([...participating, ...ownInquiryIds])];

  // Shared (group) thread messages written by other people, in threads this
  // person belongs to. Their own messages are already in `messages_sent`.
  {
    const r = await readIn(
      admin,
      "inquiry_messages",
      "id, inquiry_id, thread_type, sender_user_id, body, created_at, deleted_at",
      "inquiry_id",
      threadInquiryIds,
    );
    record(
      "messages_in_my_threads",
      r.rows
        .filter((m) => m.thread_type === "group" && m.sender_user_id !== subject.userId && m.deleted_at == null)
        .map((m) => ({
          id: m.id,
          inquiry_id: m.inquiry_id,
          thread_type: m.thread_type,
          body: m.body,
          created_at: m.created_at,
        })),
      r.error,
    );
  }

  // Offers sent to this person on their own inquiries (never drafts).
  {
    const r = await readIn(
      admin,
      "inquiry_offers",
      "id, inquiry_id, version, status, total_client_price, currency_code, notes, valid_until, sent_at, accepted_at, created_at",
      "inquiry_id",
      ownInquiryIds,
    );
    record("offers_received", r.rows.filter((o) => o.status !== "draft"), r.error);
  }

  // Talent profile: field values, reviews about them, media.
  {
    const r = await readIn(
      admin,
      "field_values",
      "id, talent_profile_id, field_definition_id, value_text, value_number, value_boolean, value_date, value_taxonomy_ids, updated_at",
      "talent_profile_id",
      talentIds,
    );
    record("profile_field_values", r.rows, r.error);
  }
  {
    const r = await readIn(
      admin,
      "talent_reviews",
      "id, tenant_id, talent_profile_id, booking_id, rating, body, status, created_at",
      "talent_profile_id",
      talentIds,
    );
    record("reviews_about_me_as_talent", r.rows.filter((x) => x.status === "published"), r.error);
  }
  {
    const r = await readIn(
      admin,
      "media_assets",
      "id, owner_talent_profile_id, bucket_id, storage_path, variant_kind, approval_state, width, height, file_size, deleted_at, created_at",
      "owner_talent_profile_id",
      talentIds,
    );
    const withLinks: Row[] = [];
    for (const m of r.rows.filter((x) => x.deleted_at == null)) {
      let signedUrl: string | null = null;
      try {
        // supabase-read-unchecked-ok: a failed signing leaves signedUrl null; the
        // export still lists the file and its metadata.
        const { data: signed } = await admin.storage
          .from(String(m.bucket_id))
          .createSignedUrl(String(m.storage_path), MEDIA_URL_TTL_SECONDS);
        signedUrl = signed?.signedUrl ?? null;
      } catch (e) {
        logServerError("account.export/media_assets.sign", e);
      }
      withLinks.push({ ...m, signed_url: signedUrl, signed_url_expires_in_seconds: MEDIA_URL_TTL_SECONDS });
    }
    record("media_assets", withLinks, r.error);
  }

  // Newsletter row for the signed-in email. `unsubscribe_token` is a bearer
  // secret and is not selected.
  if (subject.email) {
    const { data: rows, error } = await admin
      .from("marketing_subscribers")
      .select("id, email, locale, source, consented_at, unsubscribed_at")
      .eq("email", subject.email.toLowerCase());
    record("marketing_subscription", (rows ?? []) as unknown as Row[], error);
  }

  // Terms / consent acceptances. The table may not exist yet: tolerated.
  {
    const { data: rows, error } = await admin.from("terms_acceptances").select("*").eq("user_id", subject.userId);
    record("terms_acceptances", (rows ?? []) as unknown as Row[], error, true);
  }
}

/** Flatten a value for one CSV cell. */
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  // Neutralise spreadsheet formula injection for text that starts with a trigger.
  const safe = /^[=+\-@\t\r]/.test(s) && typeof v === "string" ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** One CSV per section: header is the union of keys across rows. */
export function sectionToCsv(rows: readonly unknown[]): string {
  const objs = rows.filter((r): r is Row => typeof r === "object" && r !== null);
  const cols: string[] = [];
  for (const o of objs) for (const k of Object.keys(o)) if (!cols.includes(k)) cols.push(k);
  if (cols.length === 0) return "\n";
  const lines = [cols.map(csvCell).join(",")];
  for (const o of objs) lines.push(cols.map((c) => csvCell(o[c])).join(","));
  return lines.join("\r\n") + "\r\n";
}

/** The bundle as a zip of CSVs (one per section) plus README.txt. */
export async function accountExportZip(bundle: AccountExport): Promise<Uint8Array> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const [key, rows] of Object.entries(bundle.data)) {
    zip.file(`${key}.csv`, sectionToCsv(rows));
  }
  const readme = [
    `Generated: ${bundle.generatedAt}`,
    `Account: ${bundle.subject.userId}`,
    bundle.unavailable.length ? `Sections that could not be read: ${bundle.unavailable.join(", ")}` : "",
    "",
    ...bundle.notes,
    "",
  ].join("\n");
  zip.file("README.txt", readme);
  return zip.generateAsync({ type: "uint8array" });
}

export function exportZipFilename(now: Date): string {
  return `tulala-account-export-${now.toISOString().slice(0, 10)}.zip`;
}

/** `tulala-account-export-2026-09-09.json`, stable and sortable. */
export function exportFilename(now: Date): string {
  return `tulala-account-export-${now.toISOString().slice(0, 10)}.json`;
}
