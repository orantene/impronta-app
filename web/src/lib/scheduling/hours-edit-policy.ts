/**
 * Who may WRITE talent_booking_hours.
 * Talent always edits their own claimed person profile.
 * Staff write only resource profiles or unclaimed (user_id IS NULL) people.
 */

export type HoursProfileGate = {
  profileKind: "person" | "resource" | string;
  userId: string | null;
};

export function staffMayWriteHours(profile: HoursProfileGate): boolean {
  return profile.profileKind === "resource" || profile.userId == null;
}

export function actorMayWriteHours(
  actor: { isOwner: boolean; isStaff: boolean },
  profile: HoursProfileGate,
): boolean {
  if (actor.isOwner) return true;
  if (actor.isStaff) return staffMayWriteHours(profile);
  return false;
}
