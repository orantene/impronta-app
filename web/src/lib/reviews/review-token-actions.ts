"use server";

/**
 * Public review-INVITE by token — the server side of `/review/{invite_token}`.
 *
 * A talent (or tenant staff acting for them) invites a past client to review a
 * completed booking (see ./review-request-actions.ts, owned by another agent).
 * The invite email links here. This module owns the two functions that page
 * needs:
 *
 *   loadReviewInviteByToken(token)   — resolve a token → landing context (or an
 *                                      expired / unknown result). Async, so it
 *                                      is a valid export of a "use server" file;
 *                                      callable from the public server page.
 *   submitReviewViaTokenAction(...)  — validate the single-use token, auth-match
 *                                      the reviewing client, upsert the review,
 *                                      mark the request completed. Callable from
 *                                      the client form component.
 *
 * Trust model:
 *   - The token identifies the INVITE, never the reviewer. We ALWAYS auth-match:
 *     the submitting session's auth.uid() must equal the invite's client_user_id
 *     (or, when that is null, the account whose email = invited_email). A token
 *     alone can never write a review attributed to someone else.
 *   - The read uses the SERVICE-ROLE client because review_requests RLS only
 *     exposes rows to staff / the talent / the invited client — an unauthed
 *     visitor opening the emailed link would otherwise see nothing. We hand back
 *     only the fields the landing page renders, never the raw row.
 *   - Single-use + expiry are enforced server-side on BOTH the read (so the page
 *     shows an expired state) and the submit (so a stale link cannot write).
 *
 * The actual insert into talent_reviews goes through the reviewing client's OWN
 * authenticated session, so the DB verify trigger (arm's-length verified_paid)
 * and the client edit-guard trigger govern the row exactly as they do for the
 * in-workspace submit path in ./review-actions.ts — same columns, same
 * coercions. The request status flip to 'completed' uses service-role because
 * review_requests UPDATE RLS does not grant the reviewing client.
 *
 * Per the "use server" rule this file exports ONLY async functions. The public
 * page + form infer their shapes from the function types (Awaited<ReturnType>),
 * so no non-async type export leaks out (which would break the module boundary).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { isValidRating } from "./review-eligibility";

/** Statuses that mean the invite can no longer be used. */
const TERMINAL_STATUSES = new Set(["completed", "expired"]);

// ---------------------------------------------------------------------------
// Coercions — kept byte-for-byte identical to ./review-actions.ts so a review
// filed via the token writes the same shape as one filed inside the workspace.
// ---------------------------------------------------------------------------

/** Coerce an attribute rating to a clean 1–5 SMALLINT, or null. */
function cleanAttr(v: number | null | undefined): number | null {
  if (v == null) return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;
  return n;
}

/** Coerce a traits input to a clean, de-duplicated, trimmed string[] (or null). */
function cleanTraits(v: string[] | null | undefined): string[] | null {
  if (!Array.isArray(v)) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of v) {
    if (typeof raw !== "string") continue;
    const t = raw.trim().slice(0, 80);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out.length > 0 ? out : null;
}

/** Normalize a token from the URL to the stored shape (hex, no dashes). */
function cleanToken(token: string | null | undefined): string {
  return (token ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 128);
}

type ReviewRequestRow = {
  id: string;
  tenant_id: string;
  talent_profile_id: string;
  booking_id: string | null;
  client_user_id: string | null;
  invited_email: string | null;
  message: string | null;
  status: string;
  expires_at: string | null;
};

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Resolve an invite token → landing context. SERVICE-ROLE read (the emailed
 * link is opened by an unauthenticated visitor; RLS would hide the row). Returns
 * only the fields the page renders. Never throws — degrades to a null "kind"
 * result on any infra failure so the page shows a friendly "invalid link"
 * rather than a 500.
 *
 * Result kinds:
 *   { kind: "invalid" }  → token unknown (never reveal whether a token existed).
 *   { kind: "expired" }  → past expiry, or already completed / expired.
 *   { kind: "ok", … }    → a live invite the page can render + prefill.
 */
export async function loadReviewInviteByToken(token: string): Promise<
  | { kind: "invalid" }
  | { kind: "expired" }
  | {
      kind: "ok";
      /** Echoed back so the submit action re-validates the same row. */
      token: string;
      tenantId: string;
      talentProfileId: string;
      /** Public-safe talent label (display name, else first name, else "the talent"). */
      talentName: string;
      /** Public profile code so the page can link back to the talent's page. */
      talentProfileCode: string | null;
      bookingId: string | null;
      /** Event / booking title, when the invite is tied to a booking. */
      eventTitle: string | null;
      /** Event date (ISO) for context, when known. */
      eventDate: string | null;
      /** The account this invite is FOR (may be null — email-only invite). */
      clientUserId: string | null;
      /** The email the invite was sent to (auth-matches a null-client invite). */
      invitedEmail: string | null;
      /** The talent's optional personal note in the invite. */
      message: string | null;
    }
> {
  const t = cleanToken(token);
  if (!t) return { kind: "invalid" };

  const svc = createServiceRoleClient();
  if (!svc) return { kind: "invalid" };

  try {
    const { data, error } = await svc
      .from("review_requests")
      .select(
        "id, tenant_id, talent_profile_id, booking_id, client_user_id, invited_email, message, status, expires_at",
      )
      .eq("invite_token", t)
      .maybeSingle<ReviewRequestRow>();

    if (error) {
      logServerError("reviews/token/load", error);
      return { kind: "invalid" };
    }
    const row = data;
    if (!row) return { kind: "invalid" };

    // Single-use + expiry: a completed/expired request, or a past-expiry link,
    // renders the expired state — no context leaked.
    if (isInviteSpent(row)) return { kind: "expired" };

    const { talentName, talentProfileCode } = await resolveTalentLabel(
      svc,
      row.talent_profile_id,
    );

    // Booking context, when the invite is tied to a booking.
    let eventTitle: string | null = null;
    let eventDate: string | null = null;
    if (row.booking_id) {
      const { data: booking } = await svc
        .from("agency_bookings")
        .select("title, event_date")
        .eq("id", row.booking_id)
        .maybeSingle<{ title: string | null; event_date: string | null }>();
      eventTitle = (booking?.title ?? "").trim() || null;
      eventDate = booking?.event_date ?? null;
    }

    return {
      kind: "ok",
      token: t,
      tenantId: row.tenant_id,
      talentProfileId: row.talent_profile_id,
      talentName,
      talentProfileCode,
      bookingId: row.booking_id,
      eventTitle,
      eventDate,
      clientUserId: row.client_user_id,
      invitedEmail: (row.invited_email ?? "").trim() || null,
      message: (row.message ?? "").trim() || null,
    };
  } catch (err) {
    logServerError("reviews/token/load", err);
    return { kind: "invalid" };
  }
}

/** True when the invite can no longer be acted on (spent or expired). */
function isInviteSpent(
  row: Pick<ReviewRequestRow, "status" | "expires_at">,
): boolean {
  if (TERMINAL_STATUSES.has(row.status)) return true;
  if (row.expires_at) {
    const exp = new Date(row.expires_at).getTime();
    if (Number.isFinite(exp) && Date.now() > exp) return true;
  }
  return false;
}

/** Public-safe talent label + profile code for an invite. Never leaks more. */
async function resolveTalentLabel(
  svc: SupabaseClient,
  talentProfileId: string,
): Promise<{ talentName: string; talentProfileCode: string | null }> {
  try {
    const { data } = await svc
      .from("talent_profiles")
      .select("display_name, first_name, profile_code")
      .eq("id", talentProfileId)
      .maybeSingle<{
        display_name: string | null;
        first_name: string | null;
        profile_code: string | null;
      }>();
    const name =
      (data?.display_name ?? "").trim() ||
      (data?.first_name ?? "").trim() ||
      "the talent";
    return { talentName: name, talentProfileCode: data?.profile_code ?? null };
  } catch {
    return { talentName: "the talent", talentProfileCode: null };
  }
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

/**
 * Submit a review through an invite token.
 *
 * Flow:
 *   1. Validate the token (service-role read): reject unknown / spent / expired.
 *   2. Resolve the reviewing client — ACCOUNT PATH ONLY for now. Require an
 *      authenticated session whose auth.uid() matches the invite's
 *      client_user_id; if that is null, match the account whose email =
 *      invited_email. No match → { ok: false, needsAuth: true } so the page can
 *      prompt sign-in. The token is never trusted for identity.
 *   3. Upsert into talent_reviews through the CLIENT'S OWN session (RLS attributes
 *      the row to auth.uid(); the verify + edit-guard triggers govern
 *      verified_paid + the 48h window). Same columns / coercions as the workspace
 *      submit in ./review-actions.ts.
 *   4. Mark the request completed (service-role — the reviewing client is not
 *      granted UPDATE on review_requests under RLS).
 */
export async function submitReviewViaTokenAction(
  token: string,
  input: {
    rating: number;
    body?: string;
    wouldBookAgain?: boolean | null;
    /** Individual attribute stars (1–5) or null. */
    attrs?: {
      professionalism?: number | null;
      skill?: number | null;
      communication?: number | null;
      reliability?: number | null;
    } | null;
    traits?: string[] | null;
    privateNote?: string | null;
    anon?: boolean | null;
  },
): Promise<
  | { ok: true }
  | { ok: false; needsAuth: true }
  | { ok: false; error: string }
> {
  const t = cleanToken(token);
  if (!t) return { ok: false, error: "This review link is not valid." };

  const r = Math.round(Number(input?.rating));
  if (!isValidRating(r)) {
    return { ok: false, error: "Rating must be between 1 and 5." };
  }

  // 1. Validate the token against the live invite (service-role — the row is
  //    not visible under RLS until we know who the caller is).
  const svc = createServiceRoleClient();
  if (!svc) return { ok: false, error: CLIENT_ERROR.update };

  const { data: inviteData, error: inviteErr } = await svc
    .from("review_requests")
    .select(
      "id, tenant_id, talent_profile_id, booking_id, client_user_id, invited_email, status, expires_at",
    )
    .eq("invite_token", t)
    .maybeSingle<ReviewRequestRow>();

  if (inviteErr) {
    logServerError("reviews/token/submit/load", inviteErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  const invite = inviteData;
  if (!invite) return { ok: false, error: "This review link is not valid." };
  if (isInviteSpent(invite)) {
    return { ok: false, error: "This review link has expired or was already used." };
  }

  // The invite MUST be tied to a booking: talent_reviews requires booking_id
  // NOT NULL (RLS + the unique key), and verified_paid is derived from the
  // booking's payment. A booking-less invite cannot produce a review row.
  const bookingId = (invite.booking_id ?? "").trim();
  if (!bookingId) {
    return {
      ok: false,
      error: "This invite is not linked to a booking, so it can't take a review yet.",
    };
  }

  // 2. Resolve the reviewing client — ACCOUNT PATH ONLY. Never trust the token
  //    for identity: the session must auth-match the invite's intended account.
  const session = await getCachedActorSession();
  const supabase = session.supabase;
  const user = session.user;
  if (!supabase || !user) {
    // Not signed in — the page shows a sign-in CTA to /login?next=/review/{token}.
    return { ok: false, needsAuth: true };
  }

  const matchesClientId =
    !!invite.client_user_id && invite.client_user_id === user.id;
  const inviteEmail = (invite.invited_email ?? "").trim().toLowerCase();
  const sessionEmail = (user.email ?? "").trim().toLowerCase();
  const matchesEmail =
    !invite.client_user_id &&
    inviteEmail.length > 0 &&
    sessionEmail.length > 0 &&
    inviteEmail === sessionEmail;

  if (!matchesClientId && !matchesEmail) {
    // A signed-in account that is not who the invite was for. Treat as
    // needs-auth so the page prompts them to sign in as the invited client;
    // we never write a review attributed to the wrong person.
    // TODO(guest-shadow): support a true guest (no account) who owns this
    // invited_email via a shadow/claim profile: mint (or link) a profiles row,
    // set review_requests.client_user_id to it, then insert talent_reviews with
    // that id through a service-role write that still satisfies the arm's-length
    // verify trigger. Deferred here so we NEVER make talent_reviews.client_user_id
    // nullable. Until then, reviewing requires a matching account/session.
    return { ok: false, needsAuth: true };
  }

  // 3. Coerce the STANDING signal exactly like ./review-actions.ts.
  const cleanBody = (input.body ?? "").trim().slice(0, 4000);
  const wouldBookAgain =
    input.wouldBookAgain === true
      ? true
      : input.wouldBookAgain === false
        ? false
        : null;
  const a = input.attrs ?? {};
  const attrProfessionalism = cleanAttr(a.professionalism);
  const attrSkill = cleanAttr(a.skill);
  const attrCommunication = cleanAttr(a.communication);
  const attrReliability = cleanAttr(a.reliability);
  const traits = cleanTraits(input.traits);
  const privateNoteRaw = (input.privateNote ?? "").trim().slice(0, 4000);
  const privateNote = privateNoteRaw.length > 0 ? privateNoteRaw : null;
  const anon = input.anon === true;

  // Upsert through the CLIENT'S session so RLS attributes the row to auth.uid()
  // and the verify (arm's-length verified_paid) + edit-guard (48h window,
  // column allow-list) triggers govern it — identical to the workspace path.
  const { error: upsertErr } = await supabase
    .from("talent_reviews")
    .upsert(
      {
        tenant_id: invite.tenant_id,
        talent_profile_id: invite.talent_profile_id,
        booking_id: bookingId,
        client_user_id: user.id,
        rating: r,
        body: cleanBody || null,
        would_book_again: wouldBookAgain,
        attr_professionalism: attrProfessionalism,
        attr_skill: attrSkill,
        attr_communication: attrCommunication,
        attr_reliability: attrReliability,
        traits,
        private_note: privateNote,
        anon,
        status: "published",
      },
      { onConflict: "booking_id,talent_profile_id,client_user_id" },
    );

  if (upsertErr) {
    logServerError("reviews/token/submit/upsert", upsertErr);
    // The most common cause is the caller not actually being the booking's
    // paid client (RLS INSERT check / verify path), or the talent not being on
    // the booking. Keep the message honest but non-leaky.
    return {
      ok: false,
      error: "We couldn't save this review. This link may not match your account.",
    };
  }

  // 4. Mark the request completed (single-use). Service-role: the reviewing
  //    client is not granted UPDATE on review_requests under RLS. Best-effort —
  //    the review already saved, so a failure here must not fail the submit.
  const { error: completeErr } = await svc
    .from("review_requests")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", invite.id)
    .in("status", ["pending", "sent"]);
  if (completeErr) {
    logServerError("reviews/token/submit/complete", completeErr);
  }

  return { ok: true };
}
