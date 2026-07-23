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
import { StorefrontBody } from "./StorefrontBody";
import { StorefrontFilter } from "./StorefrontFilter";
import { LightSectionLabel } from "../_light/section-label";

export function TalentStorefront({
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

  // Distinct non-empty categories, in first-seen order. The filter island mounts
  // only when 2+ are present (a single category needs no filter).
  const categories: string[] = [];
  for (const o of visible) {
    const c = o.category?.trim();
    if (c && !categories.includes(c)) categories.push(c);
  }
  const showFilter = categories.length >= 2;

  return (
    <section aria-labelledby="storefront-heading" data-profile-section="storefront">
      <LightSectionLabel id="storefront-heading">{heading}</LightSectionLabel>

      <div className="mt-5">
        {showFilter ? (
          <StorefrontFilter visible={visible} locale={locale} categories={categories} />
        ) : (
          <StorefrontBody visible={visible} locale={locale} />
        )}
      </div>
    </section>
  );
}
