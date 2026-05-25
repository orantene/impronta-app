export const POLAROIDS_FIELD_KEY = "media.polaroids";

const MODEL_LIKE_SLUG_PARTS = [
  "model",
  "runway",
  "fashion",
  "commercial",
  "promo",
  "promotional",
  "casting",
];

export function isModelLikeTalentTypeSlug(slug: string | null | undefined): boolean {
  if (!slug) return false;
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return false;
  return MODEL_LIKE_SLUG_PARTS.some((part) => normalized === part || normalized.includes(part));
}

export function shouldShowPolaroidsSection(input: {
  selectedTypeSlugs: readonly string[];
  newEngineActive: boolean;
  resolvedFieldKeys: readonly string[] | null;
}): boolean {
  const hasModelLikeType = input.selectedTypeSlugs.some(isModelLikeTalentTypeSlug);
  if (!hasModelLikeType) return false;

  if (!input.newEngineActive) return true;
  if (!input.resolvedFieldKeys) return false;

  return input.resolvedFieldKeys.includes(POLAROIDS_FIELD_KEY);
}
