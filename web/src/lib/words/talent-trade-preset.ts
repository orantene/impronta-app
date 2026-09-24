/**
 * talent-trade-preset.ts — the words preset for a SOLO TALENT'S OWN SITE.
 *
 * WHY THIS EXISTS
 * ───────────────
 * `loadTenantWords` reads `agencies.settings.industry_preset`, which is the
 * right authority on a tenant's own storefront and the WRONG one on a talent
 * vanity host. A free talent's inquiry tenant is the platform hub, so the hub's
 * preset ("agency") decided the voice on her site: the launcher invited an event
 * brief and the catalog tab read "Talent & services" on a lash artist's booking
 * page, because the hub really is an agency that lists talent. She is not.
 *
 * Her trade was already in the row all along. `talent_profiles.
 * service_category_slug` holds a `category_group` (L2) slug — "beauty-services"
 * for Jorg Beauty — and every L2 rolls up to one of the nineteen L1
 * `parent_category` terms. That L1 is the closest thing the taxonomy has to an
 * industry, so it maps here to an `IndustryPresetId` and supplies the voice.
 *
 * NO `server-only` HERE ON PURPOSE. The Supabase client arrives as an argument
 * rather than from ambient request state, exactly like `resolve.ts`, so the map
 * and the roll-up stay reachable from the `node:test` lane — pulling
 * `server-only` in would break it (see
 * `reference_server_only_import_breaks_test_lanes`).
 *
 * REFUSES RATHER THAN GUESSES. An unmapped slug, a talent with no category
 * (most of them), a missing term row or absent Supabase all resolve to `null`,
 * and a null leaves the tenant preset exactly as it was. Nothing about the
 * agency surfaces changes; this only ever narrows the voice on a talent's own
 * host, and only when the taxonomy actually knows her trade.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { IndustryPresetId } from "./presets";

/**
 * L1 `parent_category` slug → the preset whose vocabulary that trade speaks.
 *
 * Exhaustive over the nineteen active parent categories. A category whose trade
 * has no closer preset than the generic one maps to `practice` (a professional
 * who books time) or `act` (a performer who is booked for a date) rather than to
 * `agency`, because `agency` is the one preset that talks about OTHER people's
 * talent and is never right on a solo operator's own site.
 */
/**
 * L2 groups that must not inherit their L1 parent. Massage and beauty share
 * `wellness-beauty`; rolling massage up to that parent called a therapist a
 * stylist. Checked before the parent map, and again on the parent slug so an
 * L3 talent type (parent `massage-spa`) does not fall through to null.
 */
export const L2_CATEGORY_PRESET: Readonly<Record<string, IndustryPresetId>> = {
  "massage-spa": "spa_wellness",
  "private-chefs": "private_chef",
  "cuisine-specialists": "private_chef",
  "pastry-dessert": "private_chef",
  "beverage-talent": "private_chef",
  "culinary-experiences": "private_chef",
};

export const PARENT_CATEGORY_PRESET: Readonly<Record<string, IndustryPresetId>> = {
  "wellness-beauty": "salon_barber",
  "sports-fitness": "studio_gym",
  "chefs-culinary": "private_chef",
  "photo-video-creative": "practice",
  "speakers-coaches-experts": "practice",
  "kids-family-services": "practice",
  "home-technical-services": "dropoff_service",
  "hospitality-property": "venue_for_hire",
  "travel-concierge": "tours_activities",
  "transportation": "rentals",
  "security-protection": "practice",
  "production-bts": "practice",
  "event-staff": "act",
  "hosts-promo": "act",
  "music-djs": "act",
  "performers": "act",
  "animals-specialty-acts": "act",
  "influencers-creators": "portfolio",
  "models": "portfolio",
};

/**
 * The preset for a talent's own site, or `null` to keep the tenant's.
 *
 * `serviceCategorySlug` is the L2 group slug off `talent_profiles`. One read:
 * the term, then its parent's slug. Any failure is a null, never a throw — a
 * taxonomy problem must not blank a live booking dock.
 */
export async function resolveTalentTradePreset(
  admin: SupabaseClient,
  serviceCategorySlug: string | null | undefined,
): Promise<IndustryPresetId | null> {
  const slug = serviceCategorySlug?.trim();
  if (!slug) return null;

  // L2 wins over the L1 roll-up. A profile that stores the L1 slug still hits
  // the parent map below.
  const l2 = L2_CATEGORY_PRESET[slug];
  if (l2) return l2;

  const direct = PARENT_CATEGORY_PRESET[slug];
  if (direct) return direct;

  const { data, error } = await admin
    .from("taxonomy_terms")
    .select("parent:parent_id(slug)")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return null;

  // Supabase types an embedded to-one as an object or a one-element array
  // depending on how it infers the relationship; accept both.
  const parent = (data as { parent?: { slug?: string | null } | { slug?: string | null }[] | null })
    .parent;
  const parentSlug = Array.isArray(parent) ? parent[0]?.slug : parent?.slug;
  if (!parentSlug) return null;

  const resolved = parentSlug.trim();
  return L2_CATEGORY_PRESET[resolved] ?? PARENT_CATEGORY_PRESET[resolved] ?? null;
}
