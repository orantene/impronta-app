import "server-only";

/**
 * TUL-1594: a talent-site slug that carries no id8 and that no page owns may be a service slug
 * kept in `offering_slugs` (current or old). Returns the slug of the page the site renders for
 * that offering (`serviceSlug`, the id8 form), or null: flag off, table missing, any read error,
 * no match, or the offering is not publicly listed. Never throws.
 */
import { resolveOldServiceSlug } from "@/lib/offerings/offering-index";
import { loadOfferingIndex } from "@/lib/offerings/offering-index.server";
import { servicePresentationResolverEnabled } from "@/lib/services/presentation/flag";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadPublicOfferingsForProfile } from "@/lib/talent/offerings-public";
import { serviceSlug } from "@/lib/talent-site/service-page";

export async function resolveTalentOldServiceRedirect(input: {
  talentProfileId: string;
  slug: string;
  locale: string;
  primaryLocale?: string;
  publicLocales?: readonly string[];
  bypassCache?: boolean;
}): Promise<string | null> {
  if (!servicePresentationResolverEnabled()) return null;
  try {
    const primary = input.primaryLocale ?? input.locale;
    const index = await loadOfferingIndex(createServiceRoleClient(), {
      owner: { kind: "talent", talentProfileId: input.talentProfileId },
      primaryLocale: primary,
    });
    if (!index) return null;
    const oldId = resolveOldServiceSlug({
      slug: input.slug,
      locale: input.locale,
      publicLocales: input.publicLocales ?? [input.locale],
      hostKind: "talent",
      index,
    });
    if (!oldId) return null;
    const offers = await loadPublicOfferingsForProfile(input.talentProfileId, primary, null, { bypassCache: input.bypassCache }).catch(() => []);
    const target = offers.find((o) => o.id === oldId);
    return target ? serviceSlug(target) : null;
  } catch {
    return null;
  }
}
