"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import { AIErrorBoundary } from "@/components/ai/ai-error-boundary";
import { AISuggestionChips } from "@/components/ai/ai-suggestion-chips";
import { commitDirectoryListingUrl } from "@/lib/directory/directory-url-navigation";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";
import type { RefineSuggestion } from "@/lib/ai/refine-suggestions";
import { useDirectoryMatchFitOptional } from "@/components/directory/directory-match-fit-context";

const REFINE_SUGGEST_DEBOUNCE_MS = 420;

function DirectoryRefineSuggestionsInner({
  locale,
  query,
  locationSlug,
  selectedTaxonomyIds,
  heightMinCm,
  heightMaxCm,
  ui,
}: {
  locale: string;
  query: string;
  locationSlug: string;
  selectedTaxonomyIds: string[];
  heightMinCm?: number | null;
  heightMaxCm?: number | null;
  ui: DirectoryUiCopy;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [chips, setChips] = useState<RefineSuggestion[]>([]);
  const inflightRef = useRef(new Map<string, Promise<RefineSuggestion[]>>());
  const matchFit = useDirectoryMatchFitOptional();
  const selectedTaxKey = useMemo(
    () => [...selectedTaxonomyIds].sort().join(","),
    [selectedTaxonomyIds],
  );
  const fitKey = useMemo(
    () => (matchFit?.fitSlugs ?? []).slice().sort().join(","),
    [matchFit?.fitSlugs],
  );
  const requestKey = useMemo(
    () =>
      `${locale}|${query.trim()}|${locationSlug.trim()}|${selectedTaxKey}|${fitKey}|${heightMinCm ?? ""}|${heightMaxCm ?? ""}`,
    [locale, query, locationSlug, selectedTaxKey, fitKey, heightMinCm, heightMaxCm],
  );

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      const payload = {
        q: query || null,
        taxonomyTermIds:
          selectedTaxonomyIds.length > 0 ? selectedTaxonomyIds : undefined,
        locale,
        locationSlug: locationSlug.trim() || null,
        matchFitSlugs:
          matchFit?.fitSlugs && matchFit.fitSlugs.length > 0
            ? matchFit.fitSlugs
            : undefined,
        heightMinCm: heightMinCm ?? null,
        heightMaxCm: heightMaxCm ?? null,
      };
      const dedupeKey = JSON.stringify(payload);
      let run = inflightRef.current.get(dedupeKey);
      if (!run) {
        run = (async () => {
          try {
            const res = await fetch("/api/ai/refine-suggestions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            if (!res.ok) return [] as RefineSuggestion[];
            const body = (await res.json()) as { suggestions?: RefineSuggestion[] };
            return body.suggestions ?? [];
          } catch {
            return [];
          }
        })();
        inflightRef.current.set(dedupeKey, run);
        void run.finally(() => {
          inflightRef.current.delete(dedupeKey);
        });
      }
      void run.then((next) => {
        if (!cancelled) setChips(next);
      });
    }, REFINE_SUGGEST_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [requestKey, query, locale, locationSlug, selectedTaxonomyIds, matchFit?.fitSlugs, heightMinCm, heightMaxCm]);

  const onSelect = useCallback(
    (id: string) => {
      const m = /^tax:([0-9a-f-]{36})$/i.exec(id);
      if (!m) return;
      const termId = m[1]!.toLowerCase();
      const next = new Set(
        selectedTaxonomyIds.map((x) => x.toLowerCase()),
      );
      next.add(termId);
      startTransition(() => {
        commitDirectoryListingUrl(router, pathname, searchParams.toString(), (params) => {
          params.set("tax", [...next].sort().join(","));
        });
      });
    },
    [router, pathname, searchParams, selectedTaxonomyIds, startTransition],
  );

  if (!chips.length) return null;

  return (
    <div className="mb-3">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-[var(--impronta-muted)]">
        {ui.refine.suggestionsTitle}
      </p>
      <AISuggestionChips chips={chips} onSelect={onSelect} />
    </div>
  );
}

export function DirectoryRefineSuggestions(props: {
  locale: string;
  query: string;
  locationSlug?: string;
  selectedTaxonomyIds: string[];
  heightMinCm?: number | null;
  heightMaxCm?: number | null;
  ui: DirectoryUiCopy;
}) {
  return (
    <AIErrorBoundary>
      <DirectoryRefineSuggestionsInner
        {...props}
        locationSlug={props.locationSlug ?? ""}
        heightMinCm={props.heightMinCm ?? null}
        heightMaxCm={props.heightMaxCm ?? null}
      />
    </AIErrorBoundary>
  );
}
