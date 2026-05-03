/**
 * Canonical plain-text document for embeddings — see `docs/ai-search-document.md`.
 * Deterministic: same input object ⇒ same string.
 */

export type AiSearchDocumentTaxonomyTerm = {
  kind: string;
  slug?: string | null;
  name_en: string;
  name_es?: string | null;
};

export type AiSearchDocumentFieldLine = {
  key: string;
  label_en: string;
  value: string;
};

/** A v2-aware structured language record. */
export type AiSearchDocumentLanguage = {
  language_code: string;
  language_name: string;
  speaking_level: "basic" | "conversational" | "professional" | "fluent" | "native";
  is_native?: boolean;
  can_host?: boolean;
  can_sell?: boolean;
  can_translate?: boolean;
  can_teach?: boolean;
};

/** A v2-aware structured service-area record (city + service kind). */
export type AiSearchDocumentServiceArea = {
  service_kind: "home_base" | "travel_to" | "remote_only";
  city_name: string;
  country_code?: string | null;
  travel_radius_km?: number | null;
};

export type BuildAiSearchDocumentInput = {
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  primaryTalentTypeLabel: string | null;
  /**
   * v2: lineage path for the primary talent type, leaf-last. Example:
   * ["Models", "Promotional Models", "Promotional Model"]. Embedded as a
   * single ordered line so descendant searches catch parent matches.
   */
  primaryTalentTypeLineage?: string[];
  /** v2: bookable secondary roles (display labels). */
  secondaryRoles?: string[];
  locationLabel: string | null;
  /** v2: structured service-area rows. Preferred over `locationLabel` alone. */
  serviceAreas?: AiSearchDocumentServiceArea[];
  heightCm: number | null;
  /** Canonical `talent_profiles.gender` when the field definition marks gender as AI-visible. */
  gender?: string | null;
  shortBio: string | null;
  bioEn: string | null;
  bioEs?: string | null;
  taxonomyTerms?: AiSearchDocumentTaxonomyTerm[];
  /** v2: structured languages (preferred over the taxonomy 'language' kind). */
  structuredLanguages?: AiSearchDocumentLanguage[];
  /** v2: skill labels (relationship_type='skill'). */
  skills?: string[];
  /** v2: context labels (relationship_type='context'). */
  contexts?: string[];
  /** v2: credential and attribute labels. */
  credentialsAndAttributes?: string[];
  /**
   * v2: high-quality synonyms harvested from the talent's primary terms.
   * Builder caps at 8 entries to keep the embedding focused.
   */
  searchSynonyms?: string[];
  aiVisibleFields?: AiSearchDocumentFieldLine[];
};

function section(label: string, body: string | null | undefined): string[] {
  const t = body?.trim();
  if (!t) return [];
  return [`${label}: ${t}`];
}

function formatHeight(cm: number | null): string | null {
  if (cm == null || Number.isNaN(cm)) return null;
  return `${cm} cm`;
}

function formatLanguage(lang: AiSearchDocumentLanguage): string {
  const flags: string[] = [];
  if (lang.is_native) flags.push("native");
  if (lang.can_host) flags.push("host");
  if (lang.can_sell) flags.push("sell");
  if (lang.can_translate) flags.push("translate");
  if (lang.can_teach) flags.push("teach");
  const flagSuffix = flags.length > 0 ? ` [${flags.join(",")}]` : "";
  return `${lang.language_name} (${lang.speaking_level})${flagSuffix}`;
}

function formatServiceArea(area: AiSearchDocumentServiceArea): string {
  const country = area.country_code ? `, ${area.country_code.toUpperCase()}` : "";
  const radius = area.travel_radius_km ? ` (${area.travel_radius_km}km)` : "";
  return `${area.city_name}${country}${radius} [${area.service_kind}]`;
}

/**
 * Builds a stable, newline-separated document for embedding pipelines.
 *
 * v2 ordered structure (controlled — no synonym stuffing):
 *   1. Name
 *   2. Type + lineage (primary talent type)
 *   3. Also bookable as (secondary roles)
 *   4. Service areas (home_base + travel_to + remote_only) and Location label
 *   5. Languages (structured, with proficiency + service flags)
 *   6. Skills
 *   7. Contexts
 *   8. Credentials / attributes
 *   9. Bio + AI-visible fields
 *  10. Search synonyms (capped at 8, deduped)
 */
export function buildAiSearchDocument(input: BuildAiSearchDocumentInput): string {
  const lines: string[] = [];

  const name =
    input.displayName?.trim() ||
    [input.firstName, input.lastName].filter(Boolean).join(" ").trim() ||
    null;
  lines.push(...section("Name", name));

  if (input.primaryTalentTypeLabel?.trim()) {
    lines.push(...section("Type", input.primaryTalentTypeLabel.trim()));
  }

  const lineage = (input.primaryTalentTypeLineage ?? [])
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s));
  if (lineage.length > 0) {
    lines.push(`Type lineage: ${lineage.join(" > ")}`);
  }

  const secondary = (input.secondaryRoles ?? [])
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s));
  if (secondary.length > 0) {
    lines.push(`Also bookable as: ${secondary.join(", ")}`);
  }

  const serviceAreas = input.serviceAreas ?? [];
  if (serviceAreas.length > 0) {
    const homeBase = serviceAreas.filter((a) => a.service_kind === "home_base");
    const travelTo = serviceAreas.filter((a) => a.service_kind === "travel_to");
    const remoteOnly = serviceAreas.filter((a) => a.service_kind === "remote_only");
    if (homeBase.length > 0) {
      lines.push(`Home base: ${homeBase.map(formatServiceArea).join(", ")}`);
    }
    if (travelTo.length > 0) {
      lines.push(`Travels to: ${travelTo.map(formatServiceArea).join(", ")}`);
    }
    if (remoteOnly.length > 0) {
      lines.push(`Remote: ${remoteOnly.map(formatServiceArea).join(", ")}`);
    }
  } else if (input.locationLabel?.trim()) {
    lines.push(...section("Location", input.locationLabel.trim()));
  }

  const height = formatHeight(input.heightCm);
  if (height) lines.push(...section("Height", height));

  if (input.gender?.trim()) {
    lines.push(...section("Gender", input.gender.trim()));
  }

  const structuredLanguages = input.structuredLanguages ?? [];
  if (structuredLanguages.length > 0) {
    lines.push(`Languages: ${structuredLanguages.map(formatLanguage).join("; ")}`);
  }

  const skills = (input.skills ?? []).map((s) => s?.trim()).filter((s): s is string => Boolean(s));
  if (skills.length > 0) {
    lines.push(`Skills: ${skills.join(", ")}`);
  }

  const contexts = (input.contexts ?? []).map((s) => s?.trim()).filter((s): s is string => Boolean(s));
  if (contexts.length > 0) {
    lines.push(`Best for: ${contexts.join(", ")}`);
  }

  const credAttrs = (input.credentialsAndAttributes ?? [])
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s));
  if (credAttrs.length > 0) {
    lines.push(`Credentials/Attributes: ${credAttrs.join(", ")}`);
  }

  // Legacy taxonomyTerms fallback. When v2 fields are populated, talent_type
  // and language entries are skipped (they're already represented above).
  const v2HasLanguages = structuredLanguages.length > 0;
  const v2HasSkills = skills.length > 0;
  const v2HasContexts = contexts.length > 0;
  const terms = input.taxonomyTerms ?? [];
  const byKind = new Map<string, string[]>();
  for (const t of terms) {
    if (t.kind === "talent_type") continue;
    if (v2HasLanguages && t.kind === "language") continue;
    if (v2HasSkills && t.kind === "skill") continue;
    if (v2HasContexts && (t.kind === "event_type" || t.kind === "industry")) continue;
    const label = (t.name_en ?? t.slug ?? "").trim();
    if (!label) continue;
    const list = byKind.get(t.kind) ?? [];
    list.push(label);
    byKind.set(t.kind, list);
  }
  for (const [kind, vals] of [...byKind.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    lines.push(`${kind}: ${vals.join(", ")}`);
  }

  lines.push(...section("Bio", input.shortBio));
  lines.push(...section("Bio EN", input.bioEn));
  if (input.bioEs?.trim()) {
    lines.push(...section("Bio ES", input.bioEs));
  }

  for (const f of input.aiVisibleFields ?? []) {
    const v = f.value.trim();
    if (!v) continue;
    lines.push(`${f.label_en} (${f.key}): ${v}`);
  }

  // Capped search synonyms (deduped) — only high-quality, structured signals.
  const synonyms = Array.from(
    new Set(
      (input.searchSynonyms ?? [])
        .map((s) => s?.trim())
        .filter((s): s is string => Boolean(s)),
    ),
  ).slice(0, 8);
  if (synonyms.length > 0) {
    lines.push(`Synonyms: ${synonyms.join(", ")}`);
  }

  return lines.join("\n");
}
