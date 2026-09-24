import { needsUsdRates } from "@/lib/pricing/usd-equivalent";
import { loadUsdRates } from "@/lib/pricing/usd-rates";
import type { UsdRates } from "@/lib/pricing/usd-equivalent";
import { loadPublicOfferingsForProfile } from "@/lib/talent/offerings-public";
import type { TalentOffering } from "@/lib/talent/offerings-types";

export type ProfileOfferJsonLd = {
  "@context": "https://schema.org";
  "@type": "ItemList";
  itemListElement: Array<Record<string, unknown>>;
};

export async function loadProfileStorefrontPayload(
  talentProfileId: string,
  locale: string,
  agencyTenantId: string | null,
): Promise<{
  storefrontOfferings: TalentOffering[];
  usdRates: UsdRates | null;
  offerJsonLd: ProfileOfferJsonLd | null;
}> {
  const storefrontOfferings = await loadPublicOfferingsForProfile(
    talentProfileId,
    locale,
    agencyTenantId,
  );
  const usdRates = needsUsdRates(storefrontOfferings) ? await loadUsdRates() : null;
  const offerJsonLd: ProfileOfferJsonLd | null =
    storefrontOfferings.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          itemListElement: storefrontOfferings
            .filter((o) => o.amountCents != null && o.priceDisplay === "exact")
            .slice(0, 20)
            .map((o, i) => ({
              "@type": "Offer",
              position: i + 1,
              name: o.title,
              ...(o.description ? { description: o.description } : {}),
              price: (o.amountCents! / 100).toFixed(2),
              priceCurrency: o.currency,
              availability: "https://schema.org/InStock",
            })),
        }
      : null;
  return { storefrontOfferings, usdRates, offerJsonLd };
}
