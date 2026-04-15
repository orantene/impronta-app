import type { TranslationCenterBootstrap } from "@/lib/translation-center/types";

/** Admin dashboard pulse — derived only from Translation Center bootstrap. */
export type AdminTranslationHealth = {
  profilesMissingSpanish: number;
  profilesNeedsAttention: number;
  taxonomyMissingSpanish: number;
  locationsMissingSpanish: number;
  cmsMissingSpanish: number;
  messagesMissingEs: number;
  profileFieldsMissingEs: number;
};

export function mapBootstrapToAdminPulse(b: TranslationCenterBootstrap): AdminTranslationHealth {
  const pick = (id: string) => b.domains.find((d) => d.domainId === id)?.counts;
  const bio = pick("talent.profile.bio");
  const tax = pick("taxonomy.term.name");
  const loc = pick("location.city.display_name");
  const cms = pick("cms.page.title");
  const msg = pick("messages.ui");
  const fv = pick("talent.field_value.text");
  return {
    profilesMissingSpanish: bio?.missing ?? 0,
    profilesNeedsAttention: bio?.needs_attention ?? 0,
    taxonomyMissingSpanish: tax?.missing ?? 0,
    locationsMissingSpanish: loc?.missing ?? 0,
    cmsMissingSpanish: cms?.missing ?? 0,
    messagesMissingEs: msg?.missing ?? 0,
    profileFieldsMissingEs: fv?.missing ?? 0,
  };
}
