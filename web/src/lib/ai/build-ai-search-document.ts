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

export type BuildAiSearchDocumentInput = {
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  primaryTalentTypeLabel: string | null;
  locationLabel: string | null;
  heightCm: number | null;
  /** Canonical `talent_profiles.gender` when the field definition marks gender as AI-visible. */
  gender?: string | null;
  shortBio: string | null;
  bioEn: string | null;
  bioEs?: string | null;
  taxonomyTerms?: AiSearchDocumentTaxonomyTerm[];
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

/**
 * Builds a stable, newline-separated document for embedding pipelines.
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

  if (input.locationLabel?.trim()) {
    lines.push(...section("Location", input.locationLabel.trim()));
  }

  const height = formatHeight(input.heightCm);
  if (height) lines.push(...section("Height", height));

  if (input.gender?.trim()) {
    lines.push(...section("Gender", input.gender.trim()));
  }

  const terms = input.taxonomyTerms ?? [];
  const byKind = new Map<string, string[]>();
  for (const t of terms) {
    if (t.kind === "talent_type") continue;
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

  return lines.join("\n");
}
