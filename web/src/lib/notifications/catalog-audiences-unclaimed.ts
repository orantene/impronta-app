import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { loadBookingConfirmedView } from "./catalog-audiences-booking";
import { workspaceManagersPlus } from "./catalog-audiences";
import type { AudienceContext, AudienceMember, NotificationEvent } from "./types";

/**
 * Bookings for UNCLAIMED talent profiles (TUL-647).
 *
 * A talent profile with no `user_id` has no account, so `allRosterTalent`
 * resolves nobody for it and the booking notified no one. The workspace staff
 * (owner / admin / coordinator) are told instead. The profile's own
 * `invitation_email` is deliberately NEVER used: that address has not
 * consented to receive mail from us.
 */

type ParticipantRow = {
  user_id: string | null;
  talent_profiles:
    | { user_id: string | null; display_name: string | null }
    | { user_id: string | null; display_name: string | null }[]
    | null;
};

/** Pure: names of roster talents that have no account (direct or via the profile). */
export function unclaimedTalentNames(rows: readonly ParticipantRow[]): string[] {
  const names: string[] = [];
  for (const p of rows) {
    const tp = Array.isArray(p.talent_profiles) ? p.talent_profiles[0] ?? null : p.talent_profiles;
    if (p.user_id || tp?.user_id) continue;
    names.push(tp?.display_name?.trim() || "");
  }
  return names;
}

export async function loadUnclaimedBookingView(
  event: NotificationEvent,
  ctx: AudienceContext,
): Promise<Record<string, unknown>> {
  const base = await loadBookingConfirmedView(event, ctx);
  if (!event.inquiryId || !event.tenantId) return base;
  const { data, error } = await ctx.admin
    .from("inquiry_participants")
    .select("user_id, talent_profiles!talent_profile_id(user_id, display_name)")
    .eq("inquiry_id", event.inquiryId)
    .eq("tenant_id", event.tenantId)
    .eq("role", "talent")
    .neq("status", "removed");
  if (error) {
    logServerError("notifications.unclaimedBooking.roster", error);
    return base;
  }
  const names = unclaimedTalentNames((data ?? []) as unknown as ParticipantRow[]);
  return {
    ...base,
    unclaimedTalentCount: names.length,
    unclaimedTalentNames: names.filter(Boolean).join(", "),
  };
}

/** Workspace staff, only when at least one booked talent is unclaimed. */
export const unclaimedTalentWorkspaceStaff = async (
  event: NotificationEvent,
  ctx: AudienceContext,
): Promise<AudienceMember[]> => {
  const count = Number(event.payload.unclaimedTalentCount ?? 0);
  if (!Number.isFinite(count) || count <= 0) return [];
  return workspaceManagersPlus(event, ctx);
};
