"use client";

import { X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useTransition } from "react";

import { commitDirectoryListingUrl } from "@/lib/directory/directory-url-navigation";
import { serializeDirectoryFieldFacetParams } from "@/lib/directory/search-params";
import type { DirectoryFieldFacetSelection } from "@/lib/directory/types";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";
import { humanizeEnumLabel } from "@/lib/directory/humanize-enum-label";

/**
 * Active-filter chip row rendered above the directory grid.
 *
 * A removable chip for every active filter (taxonomy term, search query,
 * location, height range, age range, field facet value) plus a "Clear all".
 * Each removal commits a shallow URL update via `commitDirectoryListingUrl`
 * so the reactive grid refetches in place.
 *
 * The "Clear all" button carries `aria-label="Clear all active filters"` to
 * disambiguate it from the sidebar's "Clear all sidebar filters" button
 * (Task 3 — accessibility).
 */
type Chip = {
  /** Stable key. */
  id: string;
  /** Human label shown in the chip. */
  label: string;
  /** Mutates the params to drop this one filter. */
  remove: (params: URLSearchParams) => void;
};

export function DirectoryActiveFilterChips({
  taxonomyTermIds,
  query,
  locationSlug,
  heightMinCm,
  heightMaxCm,
  ageMin,
  ageMax,
  fieldFacets,
  labelById,
  fieldLabelByKey,
  ui,
}: {
  taxonomyTermIds: string[];
  query: string;
  locationSlug: string;
  heightMinCm: number | null;
  heightMaxCm: number | null;
  ageMin: number | null;
  ageMax: number | null;
  fieldFacets: DirectoryFieldFacetSelection[];
  /** term id / facet-value id → display label. */
  labelById: Record<string, string>;
  /** field-facet `fieldKey` → field display label. */
  fieldLabelByKey: Record<string, string>;
  ui: DirectoryUiCopy;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const chips = useMemo<Chip[]>(() => {
    const list: Chip[] = [];

    // — Search query —
    if (query.trim()) {
      list.push({
        id: `q`,
        label: `"${query.trim()}"`,
        remove: (p) => {
          p.delete("q");
          p.delete("ai_sum");
        },
      });
    }

    // — Taxonomy terms (talent type, etc.) —
    for (const termId of taxonomyTermIds) {
      list.push({
        id: `tax:${termId}`,
        label: humanizeEnumLabel(labelById[termId] ?? termId),
        remove: (p) => {
          const next = taxonomyTermIds.filter((t) => t !== termId);
          if (next.length) p.set("tax", [...next].sort().join(","));
          else p.delete("tax");
        },
      });
    }

    // — Location —
    if (locationSlug.trim()) {
      list.push({
        id: `location`,
        label: humanizeSlug(locationSlug),
        remove: (p) => p.delete("location"),
      });
    }

    // — Height range —
    if (heightMinCm != null || heightMaxCm != null) {
      list.push({
        id: `height`,
        label: rangeLabel(heightMinCm, heightMaxCm, "cm"),
        remove: (p) => {
          p.delete("hmin");
          p.delete("hmax");
        },
      });
    }

    // — Age range —
    if (ageMin != null || ageMax != null) {
      list.push({
        id: `age`,
        label: rangeLabel(ageMin, ageMax, "yrs"),
        remove: (p) => {
          p.delete("amin");
          p.delete("amax");
        },
      });
    }

    // — Field facets — one chip per (fieldKey, value) —
    for (const facet of fieldFacets) {
      for (const value of facet.values) {
        const fieldLabel = humanizeEnumLabel(
          fieldLabelByKey[facet.fieldKey] ?? facet.fieldKey,
        );
        const valueLabel = humanizeEnumLabel(labelById[value] ?? value);
        list.push({
          id: `ff:${facet.fieldKey}:${value}`,
          label: `${fieldLabel}: ${valueLabel}`,
          remove: (p) => {
            const nextFacets: DirectoryFieldFacetSelection[] = fieldFacets
              .map((f) =>
                f.fieldKey === facet.fieldKey
                  ? {
                      fieldKey: f.fieldKey,
                      values: f.values.filter((v) => v !== value),
                    }
                  : f,
              )
              .filter((f) => f.values.length > 0);
            p.delete("ff");
            for (const seg of serializeDirectoryFieldFacetParams(nextFacets)) {
              p.append("ff", seg);
            }
          },
        });
      }
    }

    return list;
  }, [
    query,
    taxonomyTermIds,
    locationSlug,
    heightMinCm,
    heightMaxCm,
    ageMin,
    ageMax,
    fieldFacets,
    labelById,
    fieldLabelByKey,
  ]);

  if (chips.length === 0) return null;

  const commit = (mutate: (p: URLSearchParams) => void) => {
    startTransition(() => {
      commitDirectoryListingUrl(
        router,
        pathname,
        searchParams.toString(),
        mutate,
      );
    });
  };

  const clearAll = () => {
    commit((p) => {
      for (const key of [
        "q",
        "ai_sum",
        "tax",
        "location",
        "hmin",
        "hmax",
        "amin",
        "amax",
        "ff",
      ]) {
        p.delete(key);
      }
    });
  };

  return (
    <div
      data-directory-active-chips
      className={
        "mt-4 flex flex-wrap items-center gap-2" +
        (pending ? " pointer-events-none opacity-60" : "")
      }
    >
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={() => commit(chip.remove)}
          className="group inline-flex max-w-[14rem] items-center gap-1.5 rounded-full border border-border bg-muted/40 py-1 pl-3 pr-2 text-[12px] text-muted-foreground outline-none transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label={`Remove filter: ${chip.label}`}
        >
          <span className="truncate">{chip.label}</span>
          <X className="size-3.5 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-foreground/80" />
        </button>
      ))}
      {chips.length > 1 ? (
        <button
          type="button"
          onClick={clearAll}
          aria-label="Clear all active filters"
          className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-medium text-muted-foreground underline-offset-4 outline-none transition-colors hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-foreground/30"
        >
          {ui.filters.clearAll}
        </button>
      ) : null}
    </div>
  );
}

function humanizeSlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function rangeLabel(
  min: number | null,
  max: number | null,
  unit: string,
): string {
  if (min != null && max != null) return `${min}–${max} ${unit}`;
  if (min != null) return `≥ ${min} ${unit}`;
  if (max != null) return `≤ ${max} ${unit}`;
  return unit;
}
