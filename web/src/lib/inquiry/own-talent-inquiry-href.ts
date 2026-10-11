/**
 * TUL-571: a studio owner who also books work as themselves ("myself") has
 * those bookings in the Tulala hub, not in their studio. When they open such
 * an inquiry from the studio admin, send them to their own talent inbox, where
 * the booking lives, instead of "This request isn't in this workspace".
 *
 * Only for the signed-in user's OWN talent profile on that inquiry: it never
 * reveals that some other workspace's inquiry exists.
 */

import { logServerError } from "@/lib/server/safe-error";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Reader = { from: (table: string) => any };

export async function ownTalentInquiryHref(
  admin: Reader,
  userId: string | null | undefined,
  inquiryId: string,
): Promise<string | null> {
  if (!userId || !inquiryId) return null;

  const { data: profiles, error: profileErr } = await admin
    .from("talent_profiles")
    .select("id")
    .eq("user_id", userId)
    .is("deleted_at", null);
  if (profileErr) {
    logServerError("admin.work.ownTalentInquiry.profile", profileErr);
    return null;
  }
  const ids = ((profiles ?? []) as { id: string }[]).map((p) => p.id).filter(Boolean);
  if (ids.length === 0) return null;

  const { data: rows, error: partErr } = await admin
    .from("inquiry_participants")
    .select("id")
    .eq("inquiry_id", inquiryId)
    .eq("role", "talent")
    .in("talent_profile_id", ids)
    .is("removed_at", null)
    .limit(1);
  if (partErr) {
    logServerError("admin.work.ownTalentInquiry.participant", partErr);
    return null;
  }
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return `/talent/inbox/${encodeURIComponent(inquiryId)}`;
}
