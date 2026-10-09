/**
 * guest-client.ts — provision (or match) a client account for a guest
 * inquiry submission.
 *
 * Lane B / B1 (2026-05-22): extracted out of
 * `app/(public)/directory/actions.ts` so the canonical InquiryDrawer
 * submit path (`submitInquiryNowAction`) and the legacy directory
 * actions share ONE implementation. When a guest submits an inquiry we
 * need a `client_user_id` so the inquiry has a real client participant
 * and the visitor can later claim / track it via a magic link.
 *
 * Behaviour (SECURITY, 2026-10-09):
 *   • Every public caller passes an email the visitor TYPED. Nobody has proved
 *     they own it. So by default an email that matches an existing account is
 *     "unlinked": NOTHING is written to that account (profiles, auth metadata,
 *     client_profiles) and the inquiry is NOT attached to it. Before this, any
 *     stranger could rename or wipe another client's profile, and drop an
 *     inquiry into their portal, just by typing their email.
 *   • The account is linked only (a) by a TRUSTED caller that already knows who
 *     the person is (`trustedLink`, e.g. staff logging an inquiry), still with no
 *     writes to the account, or (b) later, after the person verifies the email
 *     (guest-claim-relink / claim-by-email seat them as the client then).
 *   • email belongs to staff / talent / super_admin → "unlinked" always.
 *   • email is new → "unlinked" — do NOT mint auth.users; guests keep a
 *     customers / guest_session identity until they deliberately sign up.
 *
 * The caller submits the inquiry regardless: an "unlinked" result simply
 * means the inquiry has a null client_user_id (guest_session_id still
 * links it for the magic-link merge).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export type GuestClientProvisionResult =
  | { status: "matched"; clientUserId: string }
  | { status: "created"; clientUserId: string }
  | { status: "unlinked"; clientUserId: null };

export async function ensureGuestClientByEmail(
  args: {
    email: string;
    /** Legacy full name — used when first/last are omitted (directory submit). */
    name: string;
    firstName?: string;
    lastName?: string;
    company: string;
    phone: string;
  },
  opts: {
    /**
     * Only for a caller that already knows who the person is (staff logging an inquiry).
     * Links the matching account WITHOUT writing to it. Never set this from a public form.
     */
    trustedLink?: boolean;
    /** Test seam: the service-role client. Production callers never pass it. */
    __admin?: Pick<SupabaseClient, "rpc"> | null;
  } = {},
): Promise<GuestClientProvisionResult> {
  const admin = opts.__admin !== undefined ? opts.__admin : createServiceRoleClient();
  if (!admin) {
    return { status: "unlinked", clientUserId: null };
  }

  const normalizedEmail = args.email.trim().toLowerCase();

  const { data: matchRows, error: matchErr } = await admin.rpc(
    "find_auth_user_identity_by_email",
    { p_email: normalizedEmail },
  );

  if (matchErr) {
    logServerError("inquiry/ensureGuestClientByEmail/find", matchErr);
    return { status: "unlinked", clientUserId: null };
  }

  const match = Array.isArray(matchRows) ? matchRows[0] : null;
  if (match?.user_id) {
    const role = match.app_role as string | null;
    if (role === "super_admin" || role === "agency_staff" || role === "talent") {
      return { status: "unlinked", clientUserId: null };
    }
    // An unverified email never links and never writes: contact details stay on the
    // inquiry, and the person is seated as the client when they verify (claim flow).
    if (!opts.trustedLink) {
      return { status: "unlinked", clientUserId: null };
    }
    return { status: "matched", clientUserId: match.user_id as string };
  }

  // No match → do NOT mint an auth.users row. Tickets and POS already use
  // `customers` without accounts; inquiry-time createUser was the path that
  // littered production with menu-qa-* identities. A new guest stays
  // `unlinked` (inquiry may still open on guest_session_id); they gain an
  // account only when they deliberately sign up or claim a magic link.
  return { status: "unlinked", clientUserId: null };
}

/**
 * Resolve the client party for a STAFF-CREATED inquiry (2026-09-03).
 *
 * THE GAP THIS CLOSES: an inquiry a coordinator logs by hand — a booking that
 * arrived by phone, WhatsApp or in person — was created with
 * `client_user_id: null`, on the reasoning that a later merge layer would link
 * the person by email on signup. That is fine for identity, but it silently
 * disables the reply mirror: `decideGuestReplyNudge` gates on a reachable
 * inquirer (a guest session OR an attached client account), and a staff-created
 * inquiry has neither. The coordinator replies in the thread, the client is
 * never emailed, and nothing reports a failure. It is the same silent-reply bug
 * the email loop fixed for web-form leads, surviving in the path staff use most.
 *
 * POLICY, in one place so both admin creation paths agree:
 *   - staff explicitly picked an existing client → use it, never re-provision;
 *   - otherwise match by contact email when an account already exists;
 *   - no usable email / no match → null, and the inquiry is still created.
 *
 * Never throws — a match failure must not stop a coordinator from logging an inquiry.
 */
export async function resolveStaffCreatedInquiryClient(args: {
  /** Client the staff member explicitly selected, when the form offers that. */
  existingClientUserId?: string | null;
  contactEmail: string;
  contactName: string;
  contactPhone?: string | null;
  company?: string | null;
}): Promise<string | null> {
  const existing = args.existingClientUserId?.trim();
  if (existing) return existing;

  const email = args.contactEmail.trim();
  if (!email) return null;

  try {
    const provisioned = await ensureGuestClientByEmail(
      {
        email,
        name: args.contactName.trim(),
        company: args.company?.trim() ?? "",
        phone: args.contactPhone?.trim() ?? "",
      },
      // Staff logged this inquiry and know the client: link the account, but never write to it.
      { trustedLink: true },
    );
    return provisioned.clientUserId;
  } catch (err) {
    logServerError("inquiry/resolveStaffCreatedInquiryClient", err);
    return null;
  }
}
