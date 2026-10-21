/**
 * TUL-1735: the ONE authorization decision behind the talent services-menu and
 * booking-terms writers (both use the service role after this check).
 *
 * Allowed: the talent themselves (profile.user_id === session user) OR staff of a
 * workspace that holds `agency.roster.edit` AND has the talent on its roster
 * (`staffMayEditTalent`). A global staff role is never enough, and staff of another
 * workspace is Forbidden. Everything the caller needs to decide arrives through
 * `deps`, so the decision is testable with fakes: the two "use server" files wire
 * the real session / client / `staffMayEditTalent`, and cannot export a non-async
 * seam themselves. No `server-only`: the test imports this directly.
 */

export type TalentAccessDeps<P extends { user_id: string | null }> = {
  /** The signed-in user id, or null when signed out. */
  getUserId: () => Promise<string | null>;
  /** The profile row (must carry user_id), or the read error. `row: null` = not found. */
  loadProfile: (talentProfileId: string) => Promise<{ row: P | null; error: unknown }>;
  /** Staff path: `staffMayEditTalent`. Only called when the caller is not the owner. */
  staffMayEdit: (talentProfileId: string) => Promise<boolean>;
  /** Called with the read error (logging); optional. */
  onReadError?: (error: unknown) => void;
};

export type TalentAccessResult<P> =
  | { ok: true; userId: string; isOwner: boolean; isStaff: boolean; profile: P }
  | { ok: false; error: "Not authenticated." | "Profile not found." | "Forbidden." };

export async function authorizeTalentProfileAccess<P extends { user_id: string | null }>(
  deps: TalentAccessDeps<P>,
  talentProfileId: string,
): Promise<TalentAccessResult<P>> {
  const userId = await deps.getUserId();
  if (!userId) return { ok: false, error: "Not authenticated." };

  const { row, error } = await deps.loadProfile(talentProfileId);
  if (error || !row) {
    if (error) deps.onReadError?.(error);
    return { ok: false, error: "Profile not found." };
  }

  const isOwner = row.user_id === userId;
  const isStaff = !isOwner && (await deps.staffMayEdit(talentProfileId));
  if (!isOwner && !isStaff) return { ok: false, error: "Forbidden." };
  return { ok: true, userId, isOwner, isStaff, profile: row };
}
