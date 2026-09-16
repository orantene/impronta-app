import "server-only";

/**
 * Loads the taxonomy v2 `talent_type` terms once per process (they change by
 * migration, not at runtime) and scores them against the person's words.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

import { proposeBusinessType, proposeTalentType, type TalentTypeTerm, type TypeChipProposal } from "./type-chip";

let termsCache: { at: number; terms: TalentTypeTerm[] } | null = null;
const TERMS_TTL_MS = 10 * 60 * 1000;

export async function loadTalentTypeTerms(): Promise<TalentTypeTerm[]> {
  if (termsCache && Date.now() - termsCache.at < TERMS_TTL_MS) return termsCache.terms;
  const sb = createServiceRoleClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from("taxonomy_terms")
    .select("id, slug, name_i18n, aliases, search_synonyms")
    .eq("kind", "talent_type")
    .eq("is_active", true)
    .is("archived_at", null)
    .limit(1000);
  if (error || !data) {
    logServerError("onboarding.loadTalentTypeTerms", error);
    return termsCache?.terms ?? [];
  }
  const terms: TalentTypeTerm[] = data.map((row) => {
    const n = (row.name_i18n ?? {}) as { en?: string; es?: string };
    return {
      id: row.id as string,
      slug: row.slug as string,
      name: { en: n.en ?? (row.slug as string), es: n.es ?? n.en ?? (row.slug as string) },
      aliases: Array.isArray(row.aliases) ? (row.aliases as string[]) : [],
      synonyms: Array.isArray(row.search_synonyms) ? (row.search_synonyms as string[]) : [],
    };
  });
  termsCache = { at: Date.now(), terms };
  return terms;
}

export async function proposeTypeChip(input: {
  kind: "business" | "talent";
  query: string;
}): Promise<TypeChipProposal> {
  if (input.kind === "business") return proposeBusinessType(input.query);
  return proposeTalentType(input.query, await loadTalentTypeTerms());
}
