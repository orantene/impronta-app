/**
 * Locale-aware trade label for the talent self-profile bridge.
 *
 * `TalentSelfProfile.primaryTypeLabel` stays English so trade-matching helpers
 * (`resolveTradeProfile`, model-industry sets) keep a stable key. Display
 * surfaces pick Spanish from `primaryTypeLabelEs` when the dashboard locale is ES.
 */

export type SelfProfileTradeLabels = {
  primaryTypeLabel: string | null | undefined;
  primaryTypeLabelEs?: string | null | undefined;
};

/** Pick the trade string for a dashboard locale. EN label is the fallback. */
export function selfProfileTradeLabel(
  profile: SelfProfileTradeLabels | null | undefined,
  locale: string,
): string | null {
  const en = profile?.primaryTypeLabel?.trim() || null;
  if (!en) return null;
  if (locale.toLowerCase().startsWith("es")) {
    const es = profile?.primaryTypeLabelEs?.trim();
    if (es) return es;
  }
  return en;
}

/** Read primary_role EN + ES labels from a taxonomy embed. */
export function primaryRoleLabelsFromTaxonomy(
  taxonomy:
    | {
        relationship_type: string | null;
        taxonomy_terms: { name_i18n: Record<string, string | null> | null } | null;
      }[]
    | null
    | undefined,
): { en: string | null; es: string | null } {
  const map =
    taxonomy?.find((t) => t.relationship_type === "primary_role")?.taxonomy_terms
      ?.name_i18n ?? null;
  const en = map?.en?.trim() || null;
  const es = map?.es?.trim() || null;
  return { en, es };
}
