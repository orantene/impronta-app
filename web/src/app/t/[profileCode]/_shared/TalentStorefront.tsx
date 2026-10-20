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
import { categoryLabelFor } from "@/lib/site-admin/builder-node/catalog-category-label";
import { StorefrontFilter } from "./StorefrontFilter";
import { orderCategoryNames } from "@/lib/site-admin/builder-node/services-catalog-title";
import { LightSectionLabel } from "../_light/section-label";
import { needsUsdRates, showsUsdEquivalent } from "@/lib/pricing/usd-equivalent";
import { loadUsdRates } from "@/lib/pricing/usd-rates";
import { servicePageHrefs } from "@/lib/talent-site/service-page";
import { isSellable } from "@/lib/offerings/sellable";
import { loadHubOwnerBookHrefs } from "@/lib/talent/hub-owner-book.server";

export async function TalentStorefront({
  offerings,
  locale,
  heading,
  siteUrl,
}: {
  offerings: TalentOffering[];
  locale: string;
  heading: string;
  /** The talent's published site address; each service links to its page there (TUL-795). */
  siteUrl?: string | null;
}) {
  // Defensive re-filter (loader already applies the public policy).
  const visible = offerings.filter((o) => isSellable(o, "guest_request"));
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
  const categoryLabels: Record<string, string> = {};
  for (const c of categories) {
    const label = categoryLabelFor(visible, c);
    if (label) categoryLabels[c] = label;
  }

  // "≈ US$" beside prices in another currency. Fetched only when one exists;
  // a failed fetch prints no line rather than a guessed one.
  const usdRates = showsUsdEquivalent(locale) && needsUsdRates(visible) ? await loadUsdRates() : null;

  // Only an absolute site address (custom domain or subdomain) hosts service
  // pages at its root; the in-platform fallback path does not.
  const serviceHrefs = siteUrl && /^https?:\/\//i.test(siteUrl) ? servicePageHrefs(visible, siteUrl) : undefined;
  // TUL-1272 money guard: on a hub host, another workspace's row books on that workspace's page.
  const ownerBookHrefs = await loadHubOwnerBookHrefs(visible);

  return (
    <section aria-labelledby="storefront-heading" data-profile-section="storefront">
      <LightSectionLabel id="storefront-heading">{heading}</LightSectionLabel>

      <div className="mt-5">
        {showFilter ? (
          <StorefrontFilter visible={visible} locale={locale} categories={categories} categoryLabels={categoryLabels} confirmsByHand={confirmsByHand} usdRates={usdRates} serviceHrefs={serviceHrefs} ownerBookHrefs={ownerBookHrefs} />
        ) : (
          <StorefrontBody visible={visible} locale={locale} confirmsByHand={confirmsByHand} usdRates={usdRates} serviceHrefs={serviceHrefs} ownerBookHrefs={ownerBookHrefs} />
        )}
      </div>
    </section>
  );
}
