/* eslint-disable ratchet/no-untenanted-from -- identity probes are keyed by the user's own id; a membership/profile check spans every workspace on purpose. */
/**
 * Who a SIGNED-IN visitor books as (TUL-93).
 *
 * THE BUG: auth rides a cookie shared across `.tulala.digital`, so a business
 * account (workspace owner / talent / staff) left signed in in the same browser
 * was silently attached as the booking's CLIENT, and the confirmation went to
 * its inbox instead of the address the guest typed in the form.
 *
 * THE RULES (pinned by instant-book-session-identity.test.ts):
 *  1. only a real CLIENT account may be attached as the booking's client;
 *     talent, staff, platform admins, workspace members and anything we cannot
 *     classify are never attached;
 *  2. the confirmation address is always the one TYPED in the form;
 *  3. a signed-in client who types a DIFFERENT address is booking for someone
 *     else: nothing of the signed-in account is attached (no id, no email);
 *  4. with nothing typed, only an attached client may fall back to its own
 *     address. Anyone else must type one.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";

export type SessionBookingIdentity =
  | {
      ok: true;
      /** The auth account to attach as the client; `null` = book as a guest by email. */
      userId: string | null;
      contactEmail: string;
      contactName: string;
    }
  | { ok: false; reason: "validation" };

export function resolveSessionBookingIdentity(input: {
  sessionUserId: string;
  sessionEmail: string | null | undefined;
  /** From `loadSessionIsClient`. Anything unknown must arrive as `false`. */
  sessionIsClient: boolean;
  typedEmail: string | null | undefined;
  typedName: string | null | undefined;
}): SessionBookingIdentity {
  const typed = (input.typedEmail ?? "").trim().toLowerCase();
  const typedOk = typed.includes("@");
  const sessionEmail = (input.sessionEmail ?? "").trim().toLowerCase();
  const name = (input.typedName ?? "").trim();

  if (typedOk) {
    const attach = input.sessionIsClient && sessionEmail !== "" && sessionEmail === typed;
    return {
      ok: true,
      userId: attach ? input.sessionUserId : null,
      contactEmail: typed,
      contactName: name || typed,
    };
  }

  // Nothing (usable) typed: only a client account may stand in for itself.
  if (input.sessionIsClient && sessionEmail.includes("@")) {
    return {
      ok: true,
      userId: input.sessionUserId,
      contactEmail: sessionEmail,
      contactName: name || sessionEmail,
    };
  }
  return { ok: false, reason: "validation" };
}

/**
 * True only for an account that is a plain client: `profiles.app_role =
 * 'client'`, no workspace membership, no talent profile. Fails CLOSED: a read
 * error means "not a client", which only costs a signed-in client the
 * attachment (they still book and still get the email).
 */
export async function loadSessionIsClient(
  admin: Pick<SupabaseClient, "from">,
  userId: string,
): Promise<boolean> {
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("app_role")
    .eq("id", userId)
    .maybeSingle();
  if (profileErr) {
    logServerError("instantBook.sessionIsClient.profile", profileErr);
    return false;
  }
  if ((profile as { app_role?: string | null } | null)?.app_role !== "client") return false;

  const { data: memberships, error: memErr } = await admin
    .from("agency_memberships")
    .select("profile_id")
    .eq("profile_id", userId)
    .limit(1);
  if (memErr) {
    logServerError("instantBook.sessionIsClient.membership", memErr);
    return false;
  }
  if ((memberships ?? []).length > 0) return false;

  const { data: talent, error: talentErr } = await admin
    .from("talent_profiles")
    .select("id")
    .eq("user_id", userId)
    .limit(1);
  if (talentErr) {
    logServerError("instantBook.sessionIsClient.talent", talentErr);
    return false;
  }
  return (talent ?? []).length === 0;
}
