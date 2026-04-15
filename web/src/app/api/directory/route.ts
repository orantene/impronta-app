import { NextResponse } from "next/server";
import { fetchDirectoryPage } from "@/lib/directory/fetch-directory-page";
import {
  DIRECTORY_PAGE_SIZE_DEFAULT,
  DIRECTORY_PAGE_SIZE_MAX,
  type DirectorySortValue,
} from "@/lib/directory/types";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import {
  parseDirectoryFieldFacets,
  parseDirectoryHeightRange,
  parseDirectoryAgeRange,
  parseDirectoryLocation,
  parseDirectoryQuery,
  parseDirectorySort,
  parseTaxonomyParam,
} from "@/lib/directory/search-params";
import { getPublicSettings } from "@/lib/public-settings";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import { isDirectoryApiAudit } from "@/lib/directory/directory-api-audit";
import { logSearchQuery } from "@/lib/search-queries/log-search-query";
import { normalizeSearchQueryForEmbedding } from "@/lib/ai/normalize-search-query";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { fetchLanguageSettingsPublic } from "@/lib/language-settings/fetch-language-settings";

export async function GET(request: Request) {
  const audit = isDirectoryApiAudit();
  const wall = performance.now();
  const tSettings = performance.now();
  const publicSettings = await getPublicSettings();
  const publicSettingsMs = performance.now() - tSettings;
  if (!publicSettings.directoryPublic) {
    return NextResponse.json(
      { items: [], nextCursor: null, totalCount: 0, taxonomyTermIds: [] },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limitRaw = searchParams.get("limit");
  const localeParam =
    searchParams.get("locale") ?? searchParams.get("lang");
  const langSettings = await fetchLanguageSettingsPublic();
  const raw = localeParam?.trim().toLowerCase() ?? "";
  const locale =
    raw && langSettings.publicLocales.includes(raw)
      ? raw
      : langSettings.defaultLocale;
  const sort = parseDirectorySort(
    searchParams.get("sort") ?? undefined,
  ) as DirectorySortValue;
  const query = parseDirectoryQuery(searchParams.get("q") ?? undefined);
  const locationSlug = parseDirectoryLocation(
    searchParams.get("location") ?? undefined,
  );

  const limit = Math.min(
    Math.max(
      limitRaw ? parseInt(limitRaw, 10) || DIRECTORY_PAGE_SIZE_DEFAULT : DIRECTORY_PAGE_SIZE_DEFAULT,
      1,
    ),
    DIRECTORY_PAGE_SIZE_MAX,
  );

  const taxonomyTermIds = parseTaxonomyParam(
    searchParams.get("tax") ?? undefined,
  );
  const { heightMinCm, heightMaxCm } = parseDirectoryHeightRange({
    hmin: searchParams.get("hmin") ?? undefined,
    hmax: searchParams.get("hmax") ?? undefined,
  });
  const { ageMin, ageMax } = parseDirectoryAgeRange({
    amin: searchParams.get("amin") ?? undefined,
    amax: searchParams.get("amax") ?? undefined,
  });
  const fieldFacetFilters = parseDirectoryFieldFacets(searchParams.getAll("ff"));

  try {
    const supabase = createPublicSupabaseClient();
    if (!supabase) {
      return NextResponse.json(
        { items: [], nextCursor: null, totalCount: 0, taxonomyTermIds },
        { status: 503 },
      );
    }
    const tFetch = performance.now();
    const body = await fetchDirectoryPage(supabase, {
        limit,
        cursor: cursor || undefined,
        taxonomyTermIds,
        locale,
        sort,
        query,
        locationSlug,
        heightMinCm,
        heightMaxCm,
        ageMin,
        ageMax,
        fieldFacetFilters,
        skipTotalCount: Boolean(cursor),
      });
    const fetchDirectoryPageMs = performance.now() - tFetch;
    const handlerWallMs = performance.now() - wall;
    if (audit) {
      console.log(
        JSON.stringify({
          event: "api_directory_GET",
          searchParams: Object.fromEntries(searchParams.entries()),
          publicSettingsMs,
          fetchDirectoryPageMs,
          handlerWallMs,
        }),
      );
    }
    if (audit || handlerWallMs >= 1200) {
      void improntaLog("api_directory_timing", {
        publicSettingsMs: Math.round(publicSettingsMs),
        fetchDirectoryPageMs: Math.round(fetchDirectoryPageMs),
        handlerWallMs: Math.round(handlerWallMs),
        hasCursor: Boolean(cursor),
        itemCount: body.items?.length ?? 0,
      });
    }

    void getAiFeatureFlags().then((flags) =>
      logSearchQuery({
        query: query ? normalizeSearchQueryForEmbedding(query) : null,
        filters: {
          taxonomyTermIds,
          locationSlug,
          sort,
          heightMinCm,
          heightMaxCm,
          locale,
        },
        resultsCount: body.items?.length ?? 0,
        source: "directory",
        searchMode: "classic",
        aiEnabled: flags.ai_master_enabled && flags.ai_search_enabled,
        rerankEnabled: flags.ai_rerank_enabled,
        explanationEnabled: flags.ai_master_enabled && flags.ai_explanations_enabled,
        flagSnapshot: { ...flags },
      }),
    );

    return NextResponse.json(body);
  } catch (e) {
    logServerError("api/directory", e);
    return NextResponse.json(
      {
        error: CLIENT_ERROR.directoryLoad,
        items: [],
        nextCursor: null,
        totalCount: 0,
        taxonomyTermIds,
      },
      { status: 500 },
    );
  }
}
