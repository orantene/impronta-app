/**
 * First-confirm-wins guest-chat claim relink.
 *
 * A guest can send the sign-in link to a different/additional email; each one is
 * provisioned an onboarding client account and registered as a candidate in
 * inquiries.claim_candidate_user_ids (see guest-chat-actions). When ONE of those
 * candidate emails proves ownership (magic link, emailed code, either way), we
 * relink any inquiry where:
 *   - the confirming user is a registered candidate, AND
 *   - the inquiry's CURRENT owner account is still account_status='onboarding'
 *     (i.e. unclaimed) — so the FIRST candidate to confirm wins; once the owner
 *     is active, later confirms match nothing.
 *
 * This is secure: verifying the emailed token proves the confirming user owns
 * that email, and the email was a candidate the cookie-owning guest deliberately
 * added. The whole thing is best-effort / non-fatal so it can never block a login.
 *
 * P4: extracted verbatim from `app/auth/confirm/route.ts` (unchanged logic) so
 * the passwordless CLIENT flow, which verifies a typed 6-digit code inside a
 * server action instead of the /auth/confirm route, runs the exact same claim
 * mechanism. Two copies of this would have been how the guest claim silently
 * stopped working for whichever path was forgotten.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export async function relinkFirstConfirmedClaim(userId: string): Promise<void> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return;

    // Candidate inquiries where this confirming user is eligible to claim.
    const { data: rows, error } = await admin
      .from("inquiries")
      .select("id, client_user_id")
      .contains("claim_candidate_user_ids", [userId]);
    if (error || !rows || rows.length === 0) {
      if (error) logServerError("auth/relinkFirstConfirmedClaim/select", error);
      return;
    }

    for (const row of rows as Array<{ id: string; client_user_id: string | null }>) {
      const currentOwner = row.client_user_id;
      // Already owned by the confirming user — nothing to do.
      if (currentOwner === userId) continue;

      // The inquiry is only claimable while its current owner is an UNCLAIMED
      // (onboarding) provisioned account. If the owner has gone active, another
      // candidate already won — leave it alone (first-confirm-wins).
      if (currentOwner) {
        const { data: ownerProfile, error: ownerErr } = await admin
          .from("profiles")
          .select("account_status")
          .eq("id", currentOwner)
          .maybeSingle();
        if (ownerErr) {
          logServerError("auth/relinkFirstConfirmedClaim/ownerStatus", ownerErr);
          continue;
        }
        if ((ownerProfile?.account_status as string | null) !== "onboarding") {
          continue; // owner is active/claimed — do not steal it.
        }
      }

      // Re-attribute the guest's pre-claim messages to the confirming client
      // BEFORE clearing guest_session_id below — guest rows are
      // { sender_user_id: NULL, guest_session_id: <gid> }; without this they
      // render as left-aligned "System" in the client surface. Best-effort.
      const { error: reattributeErr } = await admin
        .from("inquiry_messages")
        .update({ sender_user_id: userId })
        .eq("inquiry_id", row.id)
        .is("sender_user_id", null)
        .not("guest_session_id", "is", null);
      if (reattributeErr) {
        logServerError("auth/relinkFirstConfirmedClaim/reattribute", reattributeErr);
      }

      // Relink AND sever the originating guest cookie's access by nulling
      // inquiries.guest_session_id (the guest read/write gate keys off it).
      const { error: relinkErr } = await admin
        .from("inquiries")
        .update({
          client_user_id: userId,
          guest_session_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (relinkErr) {
        logServerError("auth/relinkFirstConfirmedClaim/update", relinkErr);
      }
    }
  } catch (err) {
    logServerError("auth/relinkFirstConfirmedClaim", err);
  }
}
