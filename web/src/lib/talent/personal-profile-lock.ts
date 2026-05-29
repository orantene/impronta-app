import type { SupabaseClient } from "@supabase/supabase-js";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

/**
 * Phase 2b — multi-tenant talent identity safety floor (shared).
 *
 * A talent who owns their Tulala identity (`talent_profiles.user_id` set) keeps
 * ownership of their personal/identity fields — name, bio, contact, photos,
 * languages. An agency that manages them may overwrite those fields ONLY when
 * the roster relationship is `'confirmed'` exclusivity. Every other state
 * (`auto_assigned`, `declined`, `notice_period`, `pending`, or no roster row)
 * means the agency manages the roster relationship only — not the person.
 *
 * This is the server-side floor behind the disabled <fieldset>s in the admin
 * profile editor (Phase 2b UI). Disabled inputs aren't submitted by the
 * browser, but a scripted/DOM-tampered client could still POST to the save
 * actions directly — so each personal-data write path re-derives the lock here
 * and fails closed, independent of the UI.
 *
 * Forward path (Phase 3): when the OAuth-style `roster_permission_grant` model
 * lands, this collapses into the `profile.edit_personal` scope check. Keeping
 * the rule in ONE place means that swap happens once, not in N actions.
 */

/** The only exclusivity state that unlocks personal-field editing by an agency. */
const CONFIRMED_EXCLUSIVITY = "confirmed";

export const PERSONAL_PROFILE_LOCK_MESSAGE =
  "This talent owns their personal profile. Your agency can manage the roster relationship only — not the talent's personal details. Ask the talent to confirm exclusivity first.";

/**
 * PURE lock decision — no I/O, trivially testable.
 *
 * Locked ⇔ the talent is Tulala-native AND the agency relationship is not
 * confirmed-exclusive. A non-native talent (agency-created record, no auth
 * user) is agency-owned and never locked.
 */
export function isPersonalProfileLocked(input: {
  nativeUserId: string | null | undefined;
  rosterExclusivity: string | null | undefined;
}): boolean {
  const tulalaNativeIdentity = !!input.nativeUserId;
  if (!tulalaNativeIdentity) return false;
  return (input.rosterExclusivity ?? null) !== CONFIRMED_EXCLUSIVITY;
}

export type PersonalProfileEditableResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * I/O wrapper around {@link isPersonalProfileLocked}.
 *
 * Reads the talent's native-identity flag and the agency's exclusivity for that
 * talent, then applies the pure rule. Fails closed: a DB fault returns the
 * generic update error rather than allowing the write.
 *
 * `talent_profiles` is a GLOBAL table (talents exist cross-tenant; no
 * `tenant_id`), so that read is a raw `.from()` — it cannot route through
 * {@link tenantScopedQuery}, which forces a `tenant_id` filter. This helper
 * lives in `lib/talent/`, outside the `ratchet/no-untenanted-from` lint glob
 * (`src/lib/server-actions/**`), so the raw read needs no suppression entry —
 * which is also why server actions that previously inlined this read carry
 * grandfathered suppressions while this shared helper does not. The
 * `agency_talent_roster` read is tenant-scoped via {@link tenantScopedQuery}.
 *
 * @param supabase        any Supabase client (RLS-bound or service-role).
 * @param tenantId        the editing agency's tenant.
 * @param talentProfileId the talent whose personal data is being written.
 */
export async function assertPersonalProfileEditable(
  supabase: SupabaseClient,
  tenantId: string,
  talentProfileId: string,
): Promise<PersonalProfileEditableResult> {
  // GLOBAL table — no tenant_id, cannot route through tenantScopedQuery.
  const { data: talentRow, error: tErr } = await supabase
    .from("talent_profiles")
    .select("user_id")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (tErr) {
    logServerError("personal-profile-lock.talent-check", tErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  const nativeUserId =
    (talentRow as { user_id?: string | null } | null)?.user_id ?? null;

  // Non-native talents are agency-owned: no lock, and no roster read needed.
  if (!nativeUserId) return { ok: true };

  const { data: roster, error: rErr } = await tenantScopedQuery(
    supabase,
    "agency_talent_roster",
    tenantId,
  )
    .select("exclusivity_status")
    .eq("talent_profile_id", talentProfileId)
    .neq("status", "removed")
    .maybeSingle();
  if (rErr) {
    logServerError("personal-profile-lock.roster-check", rErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  const rosterExclusivity =
    (roster as { exclusivity_status?: string | null } | null)
      ?.exclusivity_status ?? null;

  if (isPersonalProfileLocked({ nativeUserId, rosterExclusivity })) {
    return { ok: false, error: PERSONAL_PROFILE_LOCK_MESSAGE };
  }
  return { ok: true };
}
