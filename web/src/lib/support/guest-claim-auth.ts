import "server-only";

import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { verifyGuestCookie } from "@/lib/guest-cookie";
import { resolveGuestSessionId } from "@/lib/guest/guest-session";
import { logServerError } from "@/lib/server/safe-error";
import { claimGuestSupportTickets } from "./guest-claim";
import { verifiedEmailForGuestClaim } from "./guest-claim-email";

const GUEST_COOKIE = "impronta_guest";

/**
 * Role-agnostic claim after ANY successful sign-in or sign-up.
 * Sweep B still requires email_confirmed_at. Never throws.
 */
export async function claimGuestSupportOnAuth(userId: string): Promise<{ claimed: number }> {
  try {
    let guestSessionId: string | null = await resolveGuestSessionId();
    if (!guestSessionId) {
      const cookieStore = await cookies();
      const sessionKey = verifyGuestCookie(cookieStore.get(GUEST_COOKIE)?.value);
      if (sessionKey) {
        const admin = createServiceRoleClient();
        if (admin) {
          const { data } = await admin
            .from("guest_sessions")
            .select("id")
            .eq("session_key", sessionKey)
            .maybeSingle();
          guestSessionId = typeof data?.id === "string" ? data.id : null;
        }
      }
    }

    const admin = createServiceRoleClient();
    let verifiedEmail: string | null = null;
    if (admin) {
      const { data: authUser, error } = await admin.auth.admin.getUserById(userId);
      if (error) {
        logServerError("support.guestClaimOnAuth.emailConfirm", error);
      } else {
        verifiedEmail = verifiedEmailForGuestClaim({
          email: authUser?.user?.email,
          emailConfirmedAt: authUser?.user?.email_confirmed_at,
        });
      }
    }

    return await claimGuestSupportTickets({
      userId,
      guestSessionId,
      verifiedEmail,
    });
  } catch (err) {
    logServerError("support.guestClaimOnAuth", err);
    return { claimed: 0 };
  }
}
