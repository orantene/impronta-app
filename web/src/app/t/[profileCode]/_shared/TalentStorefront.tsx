/**
 * TalentStorefront — the public "Services" section (offerings catalog).
 *
 * KIND-AWARE presenter over ONE dataset: services render as calm price-list
 * rows (optional 56px thumb), packages as editorial cards (2-up), products as
 * an image grid — always in that order (see StorefrontBody). At most ONE
 * featured offering gets the hero rail. When offerings span 2+ distinct
 * categories, a client category filter mounts above the list (StorefrontFilter);
 * otherwise the full list renders directly. No ecommerce tells: no ratings, no
 * scarcity nags, no cart language.
 *
 * Server component; interactivity lives in the OfferingCta + StorefrontFilter
 * client islands. Replaces ServiceMenuBlock whenever the talent has offerings
 * (the legacy menu stays as the zero-regression fallback). Display-only — money
 * resolves in Messages / instant-book, never here.
 */

import type { TalentOffering } from "@/lib/talent/offerings-types";
import { talentOffersInstantBooking } from "@/lib/scheduling/talent-booking-mode";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { StorefrontBody } from "./StorefrontBody";
import { StorefrontFilter } from "./StorefrontFilter";
import { orderCategoryNames } from "@/lib/site-admin/builder-node/services-catalog-title";
import { LightSectionLabel } from "../_light/section-label";
import { needsUsdRates } from "@/lib/pricing/usd-equivalent";
import { loadUsdRates } from "@/lib/pricing/usd-rates";

export async function TalentStorefront({
  offerings,
  locale,
  heading,
}: {
  offerings: TalentOffering[];
  locale: string;
  heading: string;
}) {
  // Defensive re-filter (loader already applies the public policy).
  const visible = offerings.filter(
    (o) => o.status === "published" && o.visibility !== "agency_only" && o.moderationState === "approved",
  );
  if (visible.length === 0) return null;

  const profileId = visible.find((o) => o.talentProfileId)?.talentProfileId ?? null;
  let confirmsByHand = true;
  let savedOrder: string[] = [];
  if (profileId) {
    const admin = createServiceRoleClient();
    if (admin) {
      const { data, error } = await admin.from("talent_profiles").select("talent_plan_key, category_order").eq("id", profileId).maybeSingle();
      if (!error) {
        confirmsByHand = !talentOffersInstantBooking((data as { talent_plan_key?: string | null } | null)?.talent_plan_key);
        const raw = (data as { category_order?: string[] | null } | null)?.category_order;
        if (Array.isArray(raw)) savedOrder = raw.filter((name): name is string => typeof name === "string");
      }
    }
  }

  // Distinct non-empty categories, saved order first.
  const seen: string[] = [];
  for (const o of visible) {
    const c = o.category?.trim();
    if (c && !seen.includes(c)) seen.push(c);
  }
  const categories = orderCategoryNames(seen, savedOrder);
  const showFilter = categories.length >= 2;

  // "≈ US$" beside prices in another currency. Fetched only when one exists;
  // a failed fetch prints no line rather than a guessed one.
  const usdRates = needsUsdRates(visible) ? await loadUsdRates() : null;

  return (
    <section aria-labelledby="storefront-heading" data-profile-section="storefront">
      <LightSectionLabel id="storefront-heading">{heading}</LightSectionLabel>

      <div className="mt-5">
        {showFilter ? (
          <StorefrontFilter visible={visible} locale={locale} categories={categories} confirmsByHand={confirmsByHand} usdRates={usdRates} />
        ) : (
          <StorefrontBody visible={visible} locale={locale} confirmsByHand={confirmsByHand} usdRates={usdRates} />
        )}
      </div>
    </section>
  );
}
