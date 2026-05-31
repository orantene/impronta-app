import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Suppression check for the email channel.
 *
 * The Resend webhook (Phase 9) writes `email_suppressions` rows on hard
 * bounce / complaint. The email channel calls this before every send so a
 * dead or complaining address is never mailed again.
 *
 * Scope precedence:
 *  - When we have the destination address, match on it (the table's real
 *    grain is `(user_id, email_address)`, and a user who changed email should
 *    get a fresh slate on the new address while the old one stays suppressed).
 *  - Guests (no user id) match on address only.
 *  - With neither, nothing is suppressed.
 *
 * Degrades open: any error (including the table not existing yet, before the
 * Phase 1 migration is applied) returns `false` so delivery is never blocked
 * by an infrastructure gap.
 */
export async function isEmailSuppressed(
  admin: SupabaseClient,
  userId: string | null,
  email: string | null,
): Promise<boolean> {
  try {
    let query = admin
      .from("email_suppressions")
      .select("id", { head: true, count: "exact" });

    if (email) {
      // Escape LIKE metacharacters — '_' is legal in email local parts.
      const safe = email.toLowerCase().replace(/([%_\\])/g, "\\$1");
      query = query.ilike("email_address", safe);
    } else if (userId) {
      query = query.eq("user_id", userId);
    } else {
      return false;
    }

    const { count, error } = await query;
    if (error) {
      const code = (error as { code?: string }).code;
      // PGRST205 / 42P01 = table missing (migration not yet applied). Silent.
      if (code !== "PGRST205" && code !== "42P01") {
        logServerError("notifications.suppressions", error);
      }
      return false;
    }
    return (count ?? 0) > 0;
  } catch (err) {
    logServerError(
      "notifications.suppressions",
      err instanceof Error ? err : new Error(String(err)),
    );
    return false;
  }
}
