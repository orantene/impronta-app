/**
 * Premium-app install gate for talent draft-save chokepoints.
 *
 * Unlike `loadTalentSiteSaveCapabilities`, this does NOT short-circuit when
 * `TALENT_FREE_WEBSITE_ENABLED` is off. A talent owner is always plan-checked
 * (fail closed). Returns `skip` when the actor is clearly not the owning
 * talent (workspace staff on another talent's row, or a null-id publish by a
 * non-talent staff/agency caller). A talent cannot bypass via the free-website
 * flag, a null plan, or a transient own-profile load miss — with a row id,
 * profile lookup failure denies with a retryable message (PM ruling on #2778).
 *
 * Plain module (no `"use server"` / `server-only`) so tsx lanes can import it.
 */

import {
  assertPremiumAppTreeMutation,
  canAddLibraryApp,
} from "@/lib/site-admin/add-gallery/app-plan-gate";
import { requireSession } from "@/lib/server/action-guards";
import {
  requireTalentSelf,
  type TalentSelfScopeResult,
} from "@/lib/server/talent-self-guard";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/** Who the signed-in actor is relative to the row being written. */
export type TalentRowActorKind = "own" | "other" | "unknown";

/**
 * - `ok` — apply the plan gate (`canUsePremiumApps`)
 * - `skip` — confirmed non-owner (staff on another talent's row)
 * - `lookup_failed` — own-profile miss / not found / unknown → deny + retry
 */
export type TalentPremiumAppSaveGateResult =
  | { status: "ok"; canUsePremiumApps: boolean }
  | { status: "skip" }
  | { status: "lookup_failed" };

export type PremiumAppSaveGateDeps = {
  requireTalentSelf: () => Promise<TalentSelfScopeResult>;
  /**
   * When self-scope fails with `talent_profile_not_found`, classify whether
   * `talentProfileId` belongs to the session user (`own`), someone else
   * (`other` = staff skip), or cannot be determined (`unknown` → deny).
   */
  classifyTalentRowActor: (talentProfileId: string) => Promise<TalentRowActorKind>;
};

async function defaultClassifyTalentRowActor(
  talentProfileId: string,
): Promise<TalentRowActorKind> {
  const session = await requireSession();
  if (!session.ok) return "unknown";
  const admin = createServiceRoleClient() ?? session.supabase;
  try {
    const { data, error } = await admin
      .from("talent_profiles")
      .select("user_id")
      .eq("id", talentProfileId)
      .maybeSingle<{ user_id: string | null }>();
    if (error || !data?.user_id) return "unknown";
    return data.user_id === session.user.id ? "own" : "other";
  } catch {
    return "unknown";
  }
}

const DEFAULT_DEPS: PremiumAppSaveGateDeps = {
  requireTalentSelf: () => requireTalentSelf(),
  classifyTalentRowActor: defaultClassifyTalentRowActor,
};

/** Retryable deny when the talent profile cannot be resolved (en + es). */
export function talentProfileLookupFailedMessage(
  locale?: string | null,
): string {
  return locale === "es"
    ? "No pudimos verificar tu perfil. Inténtalo de nuevo."
    : "We could not verify your profile. Please try again.";
}

/**
 * Resolve the premium-app save gate for this actor + row.
 *
 * Own-profile miss / not found (with a row id) → `lookup_failed` (fail closed).
 * Signed-in staff on another talent's row → `skip`.
 * Null row id + no talent profile (staff/agency publish) → `skip`.
 */
export async function loadTalentPremiumAppSaveGate(
  talentProfileId: string | null | undefined,
  deps: PremiumAppSaveGateDeps = DEFAULT_DEPS,
): Promise<TalentPremiumAppSaveGateResult> {
  const scope = await deps.requireTalentSelf();
  if (scope.ok) {
    // Signed-in talent editing a different talent's row → staff-equivalent skip.
    if (talentProfileId && talentProfileId !== scope.talentProfile.id) {
      return { status: "skip" };
    }
    // Fail closed: null / unknown plan → cannot add premium apps.
    return {
      status: "ok",
      canUsePremiumApps: canAddLibraryApp(scope.planKey),
    };
  }

  // Publish preflight calls this with a null id. A failed self-scope with
  // `talent_profile_not_found` means the caller is not a talent (staff /
  // agency) — skip the plan gate. Save chokepoints always pass a profile id,
  // where own-miss still returns `lookup_failed` via classify below.
  if (!talentProfileId) {
    if (scope.code === "talent_profile_not_found") return { status: "skip" };
    // not_authenticated / workspace_not_found → deny.
    return { status: "lookup_failed" };
  }

  if (scope.code === "talent_profile_not_found") {
    const who = await deps.classifyTalentRowActor(talentProfileId);
    // Only a confirmed non-owner (staff on another's row) may skip.
    if (who === "other") return { status: "skip" };
    // own-profile miss, or ownership unknown → deny (no talent bypass).
    return { status: "lookup_failed" };
  }

  // not_authenticated / workspace_not_found → deny.
  return { status: "lookup_failed" };
}

/**
 * Run the premium-app insert check for a talent-owner save. Returns an error
 * message to refuse the write, or `null` when the save may proceed (staff
 * path, or plan allows, or no new premium node).
 *
 * Profile lookup failure always denies with a retryable message — even when
 * the tree does not introduce a premium node (PM ruling on #2778).
 */
export async function refuseTalentPremiumAppTreeMutation(
  input: {
    talentProfileId: string | null | undefined;
    previousTree: unknown;
    nextTree: unknown;
    locale?: string | null;
  },
  deps: PremiumAppSaveGateDeps = DEFAULT_DEPS,
): Promise<string | null> {
  const gate = await loadTalentPremiumAppSaveGate(input.talentProfileId, deps);
  if (gate.status === "skip") return null;
  if (gate.status === "lookup_failed") {
    return talentProfileLookupFailedMessage(input.locale);
  }
  const verdict = assertPremiumAppTreeMutation({
    previousTree: input.previousTree,
    nextTree: input.nextTree,
    canUsePremiumApps: gate.canUsePremiumApps,
    locale: input.locale,
  });
  return verdict.ok ? null : verdict.message;
}
