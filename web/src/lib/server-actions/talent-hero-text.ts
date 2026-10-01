"use server";

// The hero copy a talent writes once in her profile: the website HEADLINE
// (`identity.headline`) and her years of craft (`experience.years_total`).
// Both live in the field catalog (System B) next to the tagline, so the hero
// reads them at render time (`loadTalentLiveText`) and a change shows on her
// site without a re-apply.
//
// One pair of actions serves both drawers: the talent editing her OWN profile
// (ownership by user_id) and agency staff on a rostered talent (roster check +
// the same personal-profile lock the About section uses).

import { revalidatePath } from "next/cache";

import { requireTalentSelfAction, requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { assertPersonalProfileEditable } from "@/lib/talent/personal-profile-lock";
import {
  readScalarFieldValuesFromCatalog,
  syncScalarFieldValuesToCatalog,
} from "@/lib/talent/scalar-field-values-catalog";

export interface HeroTextFields {
  headline: string | null;
  years: number | null;
}

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

const HERO_HEADLINE_MAX = 80;

/** Who is calling: the talent herself, else staff on her roster. */
async function resolveWriter(talentProfileId: string, mode: "self" | "staff") {
  if (mode === "self") {
    const auth = await requireTalentSelfAction(talentProfileId);
    if (!auth.ok) return auth;
    return { ok: true as const, supabase: auth.supabase, tenantId: auth.tenantId, path: `/t/${auth.profileCode}` };
  }
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return auth;
  const { supabase, tenantId, tenantSlug } = auth;
  const { data: roster, error } = await tenantScopedQuery(supabase, "agency_talent_roster", tenantId)
    .select("id")
    .eq("talent_profile_id", talentProfileId)
    .neq("status", "removed")
    .maybeSingle();
  if (error) {
    logServerError("hero-text.roster-check", error);
    return { ok: false as const, error: CLIENT_ERROR.update };
  }
  if (!roster) return { ok: false as const, error: "That talent isn't on your roster." };
  const lock = await assertPersonalProfileEditable(supabase, tenantId, talentProfileId);
  if (!lock.ok) return lock;
  return { ok: true as const, supabase, tenantId, path: `/${tenantSlug}/admin/roster` };
}

export async function loadHeroTextFields(input: {
  talent_profile_id: string;
  mode: "self" | "staff";
}): Promise<Result<{ fields: HeroTextFields }>> {
  const who = await resolveWriter(input.talent_profile_id, input.mode);
  if (!who.ok) return { ok: false, error: who.error };
  const read = await readScalarFieldValuesFromCatalog(who.supabase, input.talent_profile_id);
  return { ok: true, fields: { headline: read.headline ?? null, years: read.years_total ?? null } };
}

export async function saveHeroTextFields(input: {
  talent_profile_id: string;
  mode: "self" | "staff";
  headline?: string | null;
  years?: number | null;
}): Promise<Result<{ fields: HeroTextFields }>> {
  const who = await resolveWriter(input.talent_profile_id, input.mode);
  if (!who.ok) return { ok: false, error: who.error };
  const headline = input.headline === undefined ? undefined : input.headline?.trim().slice(0, HERO_HEADLINE_MAX) || null;
  const years =
    input.years === undefined
      ? undefined
      : typeof input.years === "number" && Number.isFinite(input.years) && input.years >= 0
        ? Math.min(Math.floor(input.years), 80)
        : null;
  // Independent talent with no roster tenant: the catalog write is skipped by the
  // helper, same as every other Tier-A scalar, so report it rather than pretend.
  if (!who.tenantId) return { ok: false, error: "Your profile is not attached to a workspace yet." };
  await syncScalarFieldValuesToCatalog(who.supabase, input.talent_profile_id, who.tenantId, {
    headline,
    years_total: years,
  });
  revalidatePath(who.path, "page");
  const read = await readScalarFieldValuesFromCatalog(who.supabase, input.talent_profile_id);
  return { ok: true, fields: { headline: read.headline ?? null, years: read.years_total ?? null } };
}
