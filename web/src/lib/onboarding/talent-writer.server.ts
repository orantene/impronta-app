import "server-only";

/**
 * Brief → talent profile. Everything the person said lands where the profile
 * engine reads it; nothing is invented. Runs at build time so `/talent/today`
 * exists, and is safe to re-run (each write is an upsert or a replace).
 *
 * Writes, table by table (see execution-plan Phase 5):
 *   talent_profiles         row via the onboarding RPC (display name only; the
 *                           legal identity is never asked here), then city,
 *                           country, short bio, contact email
 *   agency_talent_roster    the platform hub roster (tenant scope for the rest)
 *   talent_profile_taxonomy primary_role from the type chip (validated slug)
 *   talent_languages        the brief's languages, else the module's language
 *   talent_offerings        one draft per stated service, quote price
 *   catalog `bios`          the drafted bio (≥ 30 chars, rules in draft-bio.ts)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { scheduleRebuildAiSearchDocument } from "@/lib/ai/schedule-rebuild-ai-search-document";
import { logServerError } from "@/lib/server/safe-error";
import { ensurePlatformHubRoster } from "@/lib/saas/registration-policy";
import { syncTalentTypeTaxonomyFromShellSlugs } from "@/lib/talent/profile-shell-taxonomy-sync";
import { buildTalentLanguageRpcRows } from "@/lib/talent/talent-profile-shell-persistence";
import { syncBlobFieldValuesToCatalog } from "@/lib/talent/blob-field-values-catalog";
import { blankOffering, offeringToRowPatch, validateOffering } from "@/lib/talent/offerings-types";
import type { Brief } from "@/lib/tulala/brief-store";
import { listFact, numberFact, stringFact } from "@/lib/tulala/brief-store";

import { bioPassesRules, draftBio } from "./draft-bio";
import { proposeTalentType } from "./type-chip";
import { loadTalentTypeTerms } from "./type-chip.server";

export type TalentWriteOutcome = "written" | "skipped" | "failed";

export type TalentWriteResult = {
  ok: boolean;
  talentProfileId: string | null;
  profileCode: string | null;
  hubTenantId: string | null;
  wrote: Record<"profile" | "roster" | "type" | "languages" | "offerings" | "bio", TalentWriteOutcome>;
  /** Which lines came from a draft (marked "AI draft · tap to change" on Today). */
  aiDrafted: string[];
};

export async function writeTalentProfileFromBrief(input: {
  userClient: SupabaseClient;
  admin: SupabaseClient;
  userId: string;
  email: string | null;
  brief: Brief;
  locale: "en" | "es";
  /** The chip the person tapped, when any (`module_state.typeChoice`). */
  typeSlug: string | null;
  originDomain: string | null;
}): Promise<TalentWriteResult> {
  const { admin, brief } = input;
  const result: TalentWriteResult = {
    ok: false,
    talentProfileId: null,
    profileCode: null,
    hubTenantId: null,
    wrote: { profile: "skipped", roster: "skipped", type: "skipped", languages: "skipped", offerings: "skipped", bio: "skipped" },
    aiDrafted: [],
  };

  // ── profile row ───────────────────────────────────────────────────────────
  const displayName = stringFact(brief, "person.professional_name") ?? stringFact(brief, "person.name") ?? (input.email?.split("@")[0] ?? "");
  const { data: existing, error: existingErr } = await admin.from("talent_profiles").select("id, profile_code").eq("user_id", input.userId).is("deleted_at", null).maybeSingle();
  if (existingErr) {
    logServerError("onboarding.talentWriter.lookup", existingErr);
    result.wrote.profile = "failed";
    return result;
  }
  let id = (existing?.id as string | undefined) ?? null;
  let profileCode = (existing?.profile_code as string | null) ?? null;
  if (!id) {
    const { error } = await input.userClient.rpc("complete_talent_onboarding_with_locations", {
      p_residence_country_iso2: null, p_residence_country_name_en: null, p_residence_country_name_es: null,
      p_residence_city_slug: null, p_residence_city_name_en: null, p_residence_city_name_es: null,
      p_residence_lat: null, p_residence_lng: null,
      p_display_name: displayName || "My page", p_first_name: null, p_last_name: null, p_phone: null,
      p_gender: null, p_date_of_birth: null, p_nationality: null,
    });
    if (error) {
      logServerError("onboarding.talentWriter.rpc", error);
      result.wrote.profile = "failed";
      return result;
    }
    const { data: created, error: createdErr } = await admin.from("talent_profiles").select("id, profile_code").eq("user_id", input.userId).is("deleted_at", null).maybeSingle();
    if (createdErr || !created?.id) {
      logServerError("onboarding.talentWriter.reread", createdErr ?? new Error("no row after rpc"));
      result.wrote.profile = "failed";
      return result;
    }
    id = created.id as string;
    profileCode = (created.profile_code as string | null) ?? null;
  }
  result.talentProfileId = id;
  result.profileCode = profileCode;

  const city = stringFact(brief, "person.city");
  const country = stringFact(brief, "person.country");
  const discipline = stringFact(brief, "work.discipline") ?? stringFact(brief, "work.industry");
  const services = listFact(brief, "work.services");
  const bioFacts = { name: displayName || null, discipline, city, services, yearsExperience: numberFact(brief, "work.years_experience") };
  const bio = draftBio(bioFacts, input.locale);
  const bioOk = bioPassesRules(bio, bioFacts).ok;

  const patch: Record<string, unknown> = {};
  if (city) patch.home_city_text = city;
  if (country) patch.home_country_text = country;
  if (bioOk) patch.short_bio = bio;
  if (input.email) patch.invitation_email = input.email;
  if (Object.keys(patch).length) {
    const { error } = await admin.from("talent_profiles").update(patch).eq("id", id);
    if (error) logServerError("onboarding.talentWriter.patch", error);
    else result.wrote.profile = "written";
  } else {
    result.wrote.profile = "written";
  }

  // ── hub roster (tenant scope for everything below) ────────────────────────
  const hub = await ensurePlatformHubRoster(admin, { talentProfileId: id, userId: input.userId, originDomain: input.originDomain });
  if (!hub.ok) {
    logServerError("onboarding.talentWriter.hubRoster", new Error(hub.error));
    result.wrote.roster = "failed";
  } else {
    result.hubTenantId = hub.tenantId;
    result.wrote.roster = "written";
  }
  const tenantId = result.hubTenantId;

  // ── primary type ──────────────────────────────────────────────────────────
  if (tenantId) {
    let slug = input.typeSlug;
    if (!slug && discipline) {
      const proposal = proposeTalentType(discipline, await loadTalentTypeTerms());
      slug = proposal.proposed?.slug ?? null;
      if (slug) result.aiDrafted.push("primary_role");
    }
    if (slug) {
      const r = await syncTalentTypeTaxonomyFromShellSlugs(admin, { tenantId, talentProfileId: id, primarySlug: slug, secondarySlugs: [] });
      result.wrote.type = r.ok ? "written" : "failed";
      if (!r.ok) logServerError("onboarding.talentWriter.type", new Error(r.error ?? "taxonomy sync failed"));
    }
  }

  // ── languages ─────────────────────────────────────────────────────────────
  if (tenantId) {
    const stated = listFact(brief, "person.languages");
    const languages = stated.length ? stated : [input.locale === "es" ? "Spanish" : "English"];
    if (!stated.length) result.aiDrafted.push("languages");
    const rows = buildTalentLanguageRpcRows(languages.map((language) => ({ language, level: "fluent" })));
    const { error } = await admin.rpc("replace_talent_languages", { p_talent_profile_id: id, p_tenant_id: tenantId, p_rows: rows });
    result.wrote.languages = error ? "failed" : "written";
    if (error) logServerError("onboarding.talentWriter.languages", error);
  }

  // ── offerings (one draft per stated service, price on request) ────────────
  if (tenantId && services.length) {
    const { data: have, error: haveErr } = await admin.from("talent_offerings").select("title").eq("talent_profile_id", id).eq("tenant_id", tenantId);
    if (haveErr) {
      logServerError("onboarding.talentWriter.offeringsRead", haveErr);
      result.wrote.offerings = "failed";
    } else {
      const known = new Set((have ?? []).map((r) => String(r.title).trim().toLowerCase()));
      const rows = services
        .map((title, i) => ({ ...blankOffering({ kind: "talent", talentProfileId: id! }, "USD", i), tenantId, title: title.trim(), priceDisplay: "quote" as const, priceType: "custom" as const, status: "draft" as const }))
        .filter((o) => !known.has(o.title.toLowerCase()) && validateOffering(o).length === 0)
        .map((o) => ({ ...offeringToRowPatch(o), talent_profile_id: id }));
      if (rows.length) {
        const { error } = await admin.from("talent_offerings").insert(rows);
        result.wrote.offerings = error ? "failed" : "written";
        if (error) logServerError("onboarding.talentWriter.offerings", error);
      } else {
        result.wrote.offerings = "skipped";
      }
    }
  }

  // ── bio (the catalog value the publish floor reads) ───────────────────────
  if (tenantId && bioOk) {
    try {
      await syncBlobFieldValuesToCatalog(admin, id, tenantId, { bios: [{ locale: input.locale, text: bio }] });
      result.wrote.bio = "written";
      result.aiDrafted.push("bio");
    } catch (err) {
      logServerError("onboarding.talentWriter.bio", err);
      result.wrote.bio = "failed";
    }
  }

  await scheduleRebuildAiSearchDocument(input.userClient, id);
  result.ok = true;
  return result;
}
