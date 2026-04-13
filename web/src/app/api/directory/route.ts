import { NextResponse } from "next/server";
import { fetchDirectoryPage } from "@/lib/directory/fetch-directory-page";
import {
  DIRECTORY_PAGE_SIZE_DEFAULT,
  DIRECTORY_PAGE_SIZE_MAX,
  type DirectorySortValue,
} from "@/lib/directory/types";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import {
  parseDirectoryHeightRange,
  parseDirectoryLocation,
  parseDirectoryQuery,
  parseDirectorySort,
  parseTaxonomyParam,
} from "@/lib/directory/search-params";
import { getPublicSettings } from "@/lib/public-settings";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import { isDirectoryApiAudit } from "@/lib/directory/directory-api-audit";

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
  const locale = localeParam === "es" ? ("es" as const) : ("en" as const);
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
