import { NextResponse } from "next/server";
import { z } from "zod";
import { getPublicSettings } from "@/lib/public-settings";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { getCachedTaxonomyFilterOptions } from "@/lib/directory/taxonomy-filters";
import { buildDirectoryRefineSuggestions } from "@/lib/ai/refine-suggestions";
import { canonicalDirectoryQueryForAiSearch } from "@/lib/ai/normalize-search-query";
import { MAX_REFINE_SUGGESTIONS_RETURN } from "@/lib/ai/search-performance-limits";
import {
  buildRefineSuggestionsCacheKey,
  getCachedRefineSuggestions,
  setCachedRefineSuggestions,
} from "@/lib/ai/refine-response-cache";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

const bodySchema = z.object({
  q: z.string().optional().nullable(),
  taxonomyTermIds: z.array(z.string().uuid()).optional(),
  locale: z.enum(["en", "es"]).optional(),
  locationSlug: z.string().optional().nullable(),
  /** Top visible result fit-label slugs — boosts refine when `ai_refine_v2`. */
  matchFitSlugs: z.array(z.string().max(120)).max(48).optional(),
  heightMinCm: z.number().optional().nullable(),
  heightMaxCm: z.number().optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const publicSettings = await getPublicSettings();
    if (!publicSettings.directoryPublic) {
      return NextResponse.json(
        { error: "Directory disabled", suggestions: [] },
        { status: 403 },
      );
    }

    const flags = await getAiFeatureFlags();
    if (!flags.ai_refine_enabled) {
      return NextResponse.json({ suggestions: [] });
    }

    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const locale = parsed.data.locale ?? "en";
    const taxonomyOptions = await getCachedTaxonomyFilterOptions(locale);
    const qCanon = canonicalDirectoryQueryForAiSearch(parsed.data.q ?? "");
    const selectedIds = parsed.data.taxonomyTermIds ?? [];
    const selectedIdSet = new Set(selectedIds.map((id) => id.toLowerCase()));
    const selectedFilterKinds = [
      ...new Set(
        taxonomyOptions
          .filter((o) => selectedIdSet.has(o.id.toLowerCase()))
          .map((o) => o.kind.toLowerCase()),
      ),
    ];
    const cacheKey = buildRefineSuggestionsCacheKey({
      qCanon,
      taxonomyTermIds: selectedIds,
      locale,
      locationSlug: parsed.data.locationSlug?.trim() || undefined,
      refineV2: flags.ai_refine_v2,
      heightMinCm: parsed.data.heightMinCm ?? null,
      heightMaxCm: parsed.data.heightMaxCm ?? null,
      matchFitSlugs: parsed.data.matchFitSlugs,
      selectedFilterKinds,
    });
    const hit = getCachedRefineSuggestions(cacheKey);
    if (hit) {
      return NextResponse.json({ suggestions: hit });
    }

    const suggestions = buildDirectoryRefineSuggestions({
      query: qCanon,
      selectedTaxonomyIds: selectedIds,
      taxonomyOptions,
      locationSlug: parsed.data.locationSlug?.trim() || undefined,
      refineV2: flags.ai_refine_v2,
      max: MAX_REFINE_SUGGESTIONS_RETURN,
      matchFitSlugs: parsed.data.matchFitSlugs,
      heightMinCm: parsed.data.heightMinCm ?? null,
      heightMaxCm: parsed.data.heightMaxCm ?? null,
      selectedFilterKinds,
    });

    setCachedRefineSuggestions(cacheKey, suggestions);
    return NextResponse.json({ suggestions });
  } catch (e) {
    logServerError("api/ai/refine-suggestions", e);
    return NextResponse.json(
      { error: CLIENT_ERROR.directoryLoad, suggestions: [] },
      { status: 500 },
    );
  }
}
