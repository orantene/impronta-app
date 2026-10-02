import { needsUsdRates } from "@/lib/pricing/usd-equivalent";
import { loadUsdRates } from "@/lib/pricing/usd-rates";
import type { UsdRates } from "@/lib/pricing/usd-equivalent";
import { loadPublicOfferingsForProfile } from "@/lib/talent/offerings-public";
import type { TalentOffering } from "@/lib/talent/offerings-types";

export async function loadProfileStorefrontPayload(
  talentProfileId: string,
  locale: string,
  agencyTenantId: string | null,
): Promise<{
  storefrontOfferings: TalentOffering[];
  usdRates: UsdRates | null;
}> {
  const storefrontOfferings = await loadPublicOfferingsForProfile(
    talentProfileId,
    locale,
    agencyTenantId,
  );
  const usdRates = needsUsdRates(storefrontOfferings) ? await loadUsdRates() : null;
  return { storefrontOfferings, usdRates };
}
