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
 * Behaviour:
 *   • email already belongs to a client (or an unclaimed account) →
 *     "matched" — reuse that user, refresh the client profile.
 *   • email belongs to staff / talent / super_admin → "unlinked" — never
 *     silently convert a privileged account into a client.
 *   • email is new → "unlinked" — do NOT mint auth.users; guests keep a
 *     customers / guest_session identity until they deliberately sign up.
 *
 * The caller submits the inquiry regardless: an "unlinked" result simply
 * means the inquiry has a null client_user_id (guest_session_id still
 * links it for the magic-link merge).
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export type GuestClientProvisionResult =
  | { status: "matched"; clientUserId: string }
  | { status: "created"; clientUserId: string }
  | { status: "unlinked"; clientUserId: null };

function buildGuestDisplayName(args: {
  name?: string;
  firstName?: string;
  lastName?: string;
}): string {
  const combined = joinGuestDisplayName(args.firstName ?? "", args.lastName ?? "");
  if (combined) return combined;
  return args.name?.trim() ?? "";
}

function joinGuestDisplayName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
}

export async function ensureGuestClientByEmail(args: {
  email: string;
  /** Legacy full name — used when first/last are omitted (directory submit). */
  name: string;
  firstName?: string;
  lastName?: string;
  company: string;
  phone: string;
}): Promise<GuestClientProvisionResult> {
  const admin = createServiceRoleClient();
  if (!admin) {
    return { status: "unlinked", clientUserId: null };
  }

  const normalizedEmail = args.email.trim().toLowerCase();
  const displayName = buildGuestDisplayName(args);
  const firstName = args.firstName?.trim() ?? "";
  const lastName = args.lastName?.trim() ?? "";
  const userMetadata: Record<string, string> = {};
  if (displayName) {
    userMetadata.full_name = displayName;
    userMetadata.name = displayName;
  }
  if (firstName) userMetadata.given_name = firstName;
  if (lastName) userMetadata.family_name = lastName;

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

    const userId = match.user_id as string;
    const existingDisplayName = (match.display_name as string | null)?.trim() || "";
    const nextDisplayName = displayName || existingDisplayName;
    const profilePatch: Record<string, unknown> = {
      display_name: nextDisplayName || null,
      app_role: "client",
      account_status:
        match.account_status === "active" ? "active" : "onboarding",
      updated_at: new Date().toISOString(),
    };
    if (match.account_status !== "active") {
      profilePatch.onboarding_completed_at = null;
    }

    const { error: profileErr } = await admin
      .from("profiles")
      .update(profilePatch)
      .eq("id", userId);

    if (profileErr) {
      logServerError("inquiry/ensureGuestClientByEmail/profileUpdate", profileErr);
      return { status: "unlinked", clientUserId: null };
    }

    if (Object.keys(userMetadata).length > 0) {
      const { error: authMetaErr } = await admin.auth.admin.updateUserById(userId, {
        user_metadata: userMetadata,
      });
      if (authMetaErr) {
        logServerError("inquiry/ensureGuestClientByEmail/authMetadata", authMetaErr);
      }
    }

    const { error: clientProfileErr } = await admin
      .from("client_profiles")
      .upsert(
        {
          user_id: userId,
          company_name: args.company || null,
          phone: args.phone || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (clientProfileErr) {
      logServerError(
        "inquiry/ensureGuestClientByEmail/clientProfileUpsert",
        clientProfileErr,
      );
      return { status: "unlinked", clientUserId: null };
    }

    return { status: "matched", clientUserId: userId };
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
    const provisioned = await ensureGuestClientByEmail({
      email,
      name: args.contactName.trim(),
      company: args.company?.trim() ?? "",
      phone: args.contactPhone?.trim() ?? "",
    });
    return provisioned.clientUserId;
  } catch (err) {
    logServerError("inquiry/resolveStaffCreatedInquiryClient", err);
    return null;
  }
}
