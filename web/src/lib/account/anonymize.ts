import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Account anonymization: the one implementation both the platform-admin
 * "GDPR anonymize" action and the self-serve deletion executor use.
 *
 * WHAT IT DOES (legal plan 3.2):
 *   - scrubs names, bio, phone, birth date, socials and avatar on the user's
 *     profile and every talent profile they own; deletes that talent's
 *     profile field values (measurements, custom fields);
 *   - scrubs contact name / email / phone on inquiries and bookings where the
 *     user is the client, or where their email was used as the guest contact;
 *   - scrubs the payer email and cached receiver/talent names on money rows,
 *     WITHOUT deleting any of them (bookings + payment records are kept for
 *     3 years after last activity, anonymized);
 *   - scrubs the free-text `display_name` on the payout accounts the user owns
 *     (`owner_type` 'profile' = the user, 'talent' = their talent profiles),
 *     because it can carry bank or account details. Agency-owned accounts,
 *     `provider_account_id`, `status` and every id are kept (bookings,
 *     payouts and refunds reference them; Stripe ids are opaque);
 *   - keeps message bodies (they are the other party's record too) but
 *     removes files the user uploaded (inquiry attachments + voice notes) and
 *     the voice payload on their messages. Sender names are resolved from
 *     `profiles` at read time, so the profile scrub is what makes their
 *     messages read "Deleted user";
 *   - soft-deletes the talent's media (`media_assets.deleted_at`). The storage
 *     objects are removed by the media reaper after its 30-day grace once
 *     MEDIA_REAPER_ENABLED is on; that flag is NOT flipped here.
 *   - hides and unlists the talent profile (optional, on by default).
 *
 * WHAT IT NEVER DOES: delete a booking, an inquiry, a transaction, a payout or
 * a ledger row. Deleting an inquiry or a booking would cascade into the money
 * ledger (booking_transactions.booking_id is ON DELETE CASCADE).
 *
 * IDEMPOTENT: every step is an UPDATE/soft-delete to a fixed value or a
 * DELETE of rows that are gone after the first run, so a retry after a partial
 * failure converges. The auth email change (admin path) and the auth user
 * delete (executor) are left to the caller and must run LAST, because the
 * email is how guest-contact rows are found.
 */

export const DELETED_USER_LABEL = "Deleted user";
export const ANONYMIZED_EMAIL_DOMAIN = "anonymized.tulala.digital";
export const INQUIRY_FILES_BUCKET = "inquiry-files";

export function anonymizedEmailFor(userId: string): string {
  const suffix = userId.replace(/-/g, "").slice(0, 12).toLowerCase();
  return `deleted_${suffix}@${ANONYMIZED_EMAIL_DOMAIN}`;
}

export function isAnonymizedEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.toLowerCase().endsWith(`@${ANONYMIZED_EMAIL_DOMAIN}`);
}

/** Escape LIKE wildcards so an email containing `_` or `%` matches literally. */
export function escapeLikeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export type AnonymizeSubject = {
  userId: string;
  /** The user's real email, or null when unknown / already anonymized. */
  email: string | null;
  /** Talent profiles owned by the user (`talent_profiles.user_id`). */
  talentProfileIds: string[];
};

export type AnonymizeOptions = {
  /** Hide + unlist + soft-delete the talent profile(s). Default true. */
  hideTalentProfiles?: boolean;
  /** Remove the talent from every agency roster. Executor only. */
  removeRosterRows?: boolean;
  /** Demote the user's inquiry_coordinators rows. Executor only. */
  releaseCoordinatorSeats?: boolean;
};

type Filter =
  | { op: "eq"; col: string; value: string }
  | { op: "in"; col: string; value: string[] }
  | { op: "ilike"; col: string; value: string }
  | { op: "isNull"; col: string };

export type AnonymizeOp =
  | { kind: "update"; label: string; table: string; filters: Filter[]; patch: Record<string, unknown> }
  | { kind: "delete"; label: string; table: string; filters: Filter[] };

/**
 * The pure part: which rows get which values. No I/O, so the whole scrub
 * matrix is unit-tested.
 */
export function buildAnonymizationPlan(
  subject: AnonymizeSubject,
  nowIso: string,
  options: AnonymizeOptions = {},
): AnonymizeOp[] {
  const { userId, talentProfileIds } = subject;
  const email = subject.email && !isAnonymizedEmail(subject.email) ? subject.email.trim() : null;
  const hide = options.hideTalentProfiles !== false;
  const anonEmail = anonymizedEmailFor(userId);
  const ops: AnonymizeOp[] = [];
  const hasTalent = talentProfileIds.length > 0;
  const emailFilter = (col: string): Filter | null =>
    email ? { op: "ilike", col, value: escapeLikeLiteral(email) } : null;

  ops.push({
    kind: "update",
    label: "profile",
    table: "profiles",
    filters: [{ op: "eq", col: "id", value: userId }],
    patch: { display_name: DELETED_USER_LABEL, avatar_url: null },
  });

  ops.push({
    kind: "update",
    label: "client_profile",
    table: "client_profiles",
    filters: [{ op: "eq", col: "user_id", value: userId }],
    patch: {
      phone: null,
      whatsapp_phone: null,
      company_name: null,
      website_url: null,
      notes: null,
    },
  });

  if (hasTalent) {
    const talentIn: Filter = { op: "in", col: "id", value: talentProfileIds };
    const scrub: Record<string, unknown> = {
      display_name: DELETED_USER_LABEL,
      first_name: null,
      last_name: null,
      legal_name: null,
      short_bio: null,
      bio_i18n: {},
      bio_draft_i18n: {},
      intro_italic: null,
      pronunciation: null,
      booking_note: null,
      phone: null,
      phone_e164: null,
      date_of_birth: null,
      gender: null,
      nationality: null,
      height_cm: null,
      invitation_email: null,
      home_city_text: null,
      social_links: [],
      embedded_media: [],
      ai_search_document: null,
    };
    if (hide) {
      // is_publicly_listed is trigger-maintained; never written directly.
      Object.assign(scrub, {
        is_publicly_hidden: true,
        hidden_at: nowIso,
        published_globally: false,
        is_discoverable: false,
        is_featured: false,
        deleted_at: nowIso,
      });
    }
    ops.push({ kind: "update", label: "talent_profiles", table: "talent_profiles", filters: [talentIn], patch: scrub });

    ops.push({
      kind: "delete",
      label: "talent_field_values",
      table: "talent_profile_field_values",
      filters: [{ op: "in", col: "talent_profile_id", value: talentProfileIds }],
    });

    ops.push({
      kind: "update",
      label: "talent_media",
      table: "media_assets",
      filters: [
        { op: "in", col: "owner_talent_profile_id", value: talentProfileIds },
        { op: "isNull", col: "deleted_at" },
      ],
      patch: { deleted_at: nowIso },
    });

    // TUL-231: the site logo lives at talent-site-logos/{talentProfileId}/ and is
    // named by talent_sites.logo_url (keyed by talent_profile_id, the same id as
    // the path). Clearing it stops the media reaper treating it as a live reference.
    ops.push({
      kind: "update",
      label: "talent_site_logo",
      table: "talent_sites",
      filters: [{ op: "in", col: "talent_profile_id", value: talentProfileIds }],
      patch: { logo_url: null },
    });

    ops.push({
      kind: "update",
      label: "booking_talent_names",
      table: "booking_talent",
      filters: [{ op: "in", col: "talent_profile_id", value: talentProfileIds }],
      patch: { talent_name_snapshot: DELETED_USER_LABEL },
    });

    if (options.removeRosterRows) {
      ops.push({
        kind: "delete",
        label: "roster_rows",
        table: "agency_talent_roster",
        filters: [{ op: "in", col: "talent_profile_id", value: talentProfileIds }],
      });
    }
  }

  // Inquiries where they are the client, then where their email was the
  // guest contact (before they had an account, or on a staff-entered lead).
  const inquiryPatch = {
    contact_name: DELETED_USER_LABEL,
    contact_email: anonEmail,
    contact_phone: null,
    company: null,
  };
  ops.push({
    kind: "update",
    label: "inquiries_as_client",
    table: "inquiries",
    filters: [{ op: "eq", col: "client_user_id", value: userId }],
    patch: inquiryPatch,
  });
  const inqEmail = emailFilter("contact_email");
  if (inqEmail) {
    ops.push({ kind: "update", label: "inquiries_as_guest", table: "inquiries", filters: [inqEmail], patch: inquiryPatch });
  }

  const bookingPatch = { contact_name: DELETED_USER_LABEL, contact_email: null, contact_phone: null };
  ops.push({
    kind: "update",
    label: "bookings_as_client",
    table: "agency_bookings",
    filters: [{ op: "eq", col: "client_user_id", value: userId }],
    patch: bookingPatch,
  });
  const bookEmail = emailFilter("contact_email");
  if (bookEmail) {
    ops.push({ kind: "update", label: "bookings_as_guest", table: "agency_bookings", filters: [bookEmail], patch: bookingPatch });
  }

  // Money rows: anonymize, never delete.
  ops.push({
    kind: "update",
    label: "transactions_as_payer",
    table: "booking_transactions",
    filters: [{ op: "eq", col: "payer_user_id", value: userId }],
    patch: { payer_email: null },
  });
  const payerEmail = emailFilter("payer_email");
  if (payerEmail) {
    ops.push({ kind: "update", label: "transactions_as_guest_payer", table: "booking_transactions", filters: [payerEmail], patch: { payer_email: null } });
  }
  ops.push({
    kind: "update",
    label: "transactions_as_receiver",
    table: "booking_transactions",
    filters: [{ op: "in", col: "payout_receiver_id", value: [userId, ...talentProfileIds] }],
    patch: { payout_receiver_display_name: DELETED_USER_LABEL },
  });

  // Payout accounts: display_name is free text (NOT NULL) and can carry bank
  // details. Only the name is scrubbed; owner_type 'agency' rows, the provider
  // account id, status and ids stay because bookings and payouts reference them.
  ops.push({
    kind: "update",
    label: "payout_accounts_profile",
    table: "payout_accounts",
    filters: [
      { op: "eq", col: "owner_type", value: "profile" },
      { op: "eq", col: "owner_id", value: userId },
    ],
    patch: { display_name: DELETED_USER_LABEL },
  });
  if (hasTalent) {
    ops.push({
      kind: "update",
      label: "payout_accounts_talent",
      table: "payout_accounts",
      filters: [
        { op: "eq", col: "owner_type", value: "talent" },
        { op: "in", col: "owner_id", value: talentProfileIds },
      ],
      patch: { display_name: DELETED_USER_LABEL },
    });
  }

  // Files they uploaded into conversations. Storage objects are removed by
  // the caller before this soft-delete (see removeUploadedInquiryFiles).
  ops.push({
    kind: "update",
    label: "inquiry_attachments",
    table: "inquiry_attachments",
    filters: [
      { op: "eq", col: "uploaded_by", value: userId },
      { op: "isNull", col: "deleted_at" },
    ],
    patch: { deleted_at: nowIso },
  });

  if (options.releaseCoordinatorSeats) {
    ops.push({
      kind: "update",
      label: "coordinator_seats",
      table: "inquiry_coordinators",
      filters: [
        { op: "eq", col: "user_id", value: userId },
        { op: "eq", col: "status", value: "active" },
      ],
      patch: { status: "former_coordinator" },
    });
  }

  return ops;
}

// ─── I/O ──────────────────────────────────────────────────────────────────────

export type StepResult = { label: string; ok: boolean; error?: string };
export type AnonymizeReport = { ok: boolean; steps: StepResult[] };

type FilterableQuery = {
  eq(col: string, v: unknown): FilterableQuery;
  in(col: string, v: unknown[]): FilterableQuery;
  ilike(col: string, v: string): FilterableQuery;
  is(col: string, v: null): FilterableQuery;
} & PromiseLike<{ error: { message: string } | null }>;

function applyFilters(q: FilterableQuery, filters: Filter[]): FilterableQuery {
  let out = q;
  for (const f of filters) {
    if (f.op === "eq") out = out.eq(f.col, f.value);
    else if (f.op === "in") out = out.in(f.col, f.value);
    else if (f.op === "ilike") out = out.ilike(f.col, f.value);
    else out = out.is(f.col, null);
  }
  return out;
}

function errMsg(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

export async function runAnonymizationOp(admin: SupabaseClient, op: AnonymizeOp): Promise<StepResult> {
  try {
    const base = admin.from(op.table);
    const q = (op.kind === "update" ? base.update(op.patch) : base.delete()) as unknown as FilterableQuery;
    const { error } = await applyFilters(q, op.filters);
    return error ? { label: op.label, ok: false, error: error.message } : { label: op.label, ok: true };
  } catch (e) {
    return { label: op.label, ok: false, error: errMsg(e) };
  }
}

export async function loadAnonymizeSubject(
  admin: SupabaseClient,
  userId: string,
): Promise<{ ok: true; subject: AnonymizeSubject; authUserExists: boolean } | { ok: false; error: string }> {
  const { data: talents, error: tErr } = await admin.from("talent_profiles").select("id").eq("user_id", userId);
  if (tErr) return { ok: false, error: `talent_profiles: ${tErr.message}` };

  let email: string | null = null;
  let authUserExists = true;
  const { data: authData, error: aErr } = await admin.auth.admin.getUserById(userId);
  if (aErr) {
    // A missing auth user is a normal state on an executor retry. Any OTHER
    // error must not be read as "gone": that would mark a deletion complete
    // without having deleted anything.
    const status = (aErr as { status?: number }).status;
    if (status !== 404 && !/not.?found/i.test(aErr.message)) {
      return { ok: false, error: `auth.getUserById: ${aErr.message}` };
    }
    authUserExists = false;
  } else if (!authData?.user) {
    authUserExists = false;
  } else {
    email = authData.user.email ?? null;
  }

  return {
    ok: true,
    authUserExists,
    subject: {
      userId,
      email,
      talentProfileIds: ((talents ?? []) as Array<{ id: string }>).map((t) => t.id),
    },
  };
}

/**
 * Remove storage objects for every inquiry attachment the user uploaded
 * (documents and voice notes), then strip the voice payload from their
 * messages so nothing points at a removed file. Message bodies stay.
 */
export async function removeUploadedInquiryFiles(admin: SupabaseClient, userId: string): Promise<StepResult[]> {
  const steps: StepResult[] = [];
  const { data: files, error } = await admin
    .from("inquiry_attachments")
    .select("storage_path")
    .eq("uploaded_by", userId);
  if (error) return [{ label: "inquiry_files.list", ok: false, error: error.message }];

  const paths = ((files ?? []) as Array<{ storage_path: string | null }>)
    .map((f) => f.storage_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  for (let i = 0; i < paths.length; i += 100) {
    // Removing an already-removed object is not an error, so retries are safe.
    const { error: rmErr } = await admin.storage.from(INQUIRY_FILES_BUCKET).remove(paths.slice(i, i + 100));
    steps.push(rmErr ? { label: "inquiry_files.remove", ok: false, error: rmErr.message } : { label: "inquiry_files.remove", ok: true });
  }

  const { data: voiceRows, error: vErr } = await admin
    .from("inquiry_messages")
    .select("id, metadata")
    .eq("sender_user_id", userId)
    .not("metadata->voice", "is", null);
  if (vErr) {
    steps.push({ label: "message_voice.list", ok: false, error: vErr.message });
    return steps;
  }
  for (const row of (voiceRows ?? []) as Array<{ id: string; metadata: Record<string, unknown> | null }>) {
    const next = { ...(row.metadata ?? {}) };
    delete next.voice;
    const { error: uErr } = await admin.from("inquiry_messages").update({ metadata: next }).eq("id", row.id);
    if (uErr) steps.push({ label: "message_voice.strip", ok: false, error: uErr.message });
  }
  steps.push({ label: "message_voice.strip", ok: true });
  return steps;
}

/** Public bucket that holds profile pictures at `avatars/{userId}/avatar.<ext>`. */
export const AVATAR_BUCKET = "media-public";
const AVATAR_USER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Remove the user's profile picture file(s). The avatar is keyed by the AUTH user
 * id, which no longer maps to anyone once the executor deletes the auth user, and
 * the media reaper protects the `avatars/` prefix, so this is the only moment the
 * file can be found. Clearing `profiles.avatar_url` (the plan) does not delete the
 * object, which would stay reachable by its public URL. Idempotent: listing an
 * empty prefix is a no-op, and removing an already-removed object is not an error.
 */
export async function removeUserAvatarFiles(admin: SupabaseClient, userId: string): Promise<StepResult[]> {
  // Never list `avatars/` itself: the id becomes a path segment, so it must be a uuid.
  if (!AVATAR_USER_ID_RE.test(userId)) {
    return [{ label: "avatar_files.list", ok: false, error: "invalid user id" }];
  }
  const prefix = `avatars/${userId}`;
  const { data, error } = await admin.storage.from(AVATAR_BUCKET).list(prefix, { limit: 100 });
  if (error) return [{ label: "avatar_files.list", ok: false, error: error.message }];
  const paths = (data ?? [])
    .filter((o) => typeof o.name === "string" && o.name.length > 0)
    .map((o) => `${prefix}/${o.name}`);
  if (paths.length === 0) return [{ label: "avatar_files.remove", ok: true }];
  const { error: rmErr } = await admin.storage.from(AVATAR_BUCKET).remove(paths);
  return [rmErr ? { label: "avatar_files.remove", ok: false, error: rmErr.message } : { label: "avatar_files.remove", ok: true }];
}

/**
 * Run the full scrub for one user. Does NOT touch the auth user; the caller
 * changes the auth email (admin anonymize) or deletes it (executor) only when
 * this report is ok.
 */
export async function anonymizeUserData(
  admin: SupabaseClient,
  subject: AnonymizeSubject,
  options: AnonymizeOptions = {},
  now: Date = new Date(),
): Promise<AnonymizeReport> {
  const steps: StepResult[] = [];
  steps.push(...(await removeUploadedInquiryFiles(admin, subject.userId)));
  steps.push(...(await removeUserAvatarFiles(admin, subject.userId)));
  for (const op of buildAnonymizationPlan(subject, now.toISOString(), options)) {
    steps.push(await runAnonymizationOp(admin, op));
  }
  return { ok: steps.every((s) => s.ok), steps };
}

export function firstFailure(report: AnonymizeReport): string | null {
  const f = report.steps.find((s) => !s.ok);
  return f ? `${f.label}: ${f.error ?? "failed"}` : null;
}
