"use client";

import { AppliedFilterChips } from "@/components/directory/directory-filters-sidebar";
import type { TaxonomyFilterOption } from "@/lib/directory/taxonomy-filters";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";

type Props = {
  aiSummary: string;
  showSummary: boolean;
  /** Structured interpretation (taxonomy labels · height · location); not raw ai_sum. */
  interpretedStructuredLine?: string | null;
  taxonomyOptions: TaxonomyFilterOption[];
  selectedIds: string[];
  query: string;
  locationSlug: string;
  heightMinCm: number | null;
  heightMaxCm: number | null;
  ui: DirectoryUiCopy;
};

/**
 * Understanding strip: optional NL summary line + removable filter chips (above results).
 */
export function DirectoryUnderstandingStrip({
  aiSummary,
  showSummary,
  interpretedStructuredLine,
  taxonomyOptions,
  selectedIds,
  query,
  locationSlug,
  heightMinCm,
  heightMaxCm,
  ui,
}: Props) {
  const structured = interpretedStructuredLine?.trim() ?? "";
  const hasChips =
    selectedIds.length > 0 ||
    query.trim().length > 0 ||
    locationSlug.trim().length > 0 ||
    heightMinCm != null ||
    heightMaxCm != null;

  if (!showSummary && !hasChips && !structured) return null;

  return (
    <div className="mb-4 space-y-2">
      {structured ? (
        <p className="text-sm leading-snug text-[var(--impronta-muted)]">
          <span className="font-medium text-[var(--impronta-foreground)]">
            {ui.intent.interpretedAsPrefix}
          </span>{" "}
          {structured}
        </p>
      ) : null}
      {showSummary && aiSummary.trim() ? (
        <p className="text-sm leading-snug text-[var(--impronta-muted)]">
          <span className="font-medium text-[var(--impronta-foreground)]">
            {ui.intent.showingForPrefix}
          </span>{" "}
          {aiSummary.trim()}
        </p>
      ) : null}
      {hasChips ? (
        <AppliedFilterChips
          options={taxonomyOptions}
          selectedIds={selectedIds}
          query={query}
          locationSlug={locationSlug}
          heightMinCm={heightMinCm}
          heightMaxCm={heightMaxCm}
          chips={ui.chips}
        />
      ) : null}
    </div>
  );
}
