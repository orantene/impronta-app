import { NextResponse } from "next/server";
import { z } from "zod";
import {
  DIRECTORY_PAGE_SIZE_MAX,
} from "@/lib/directory/types";
import { getPublicSettings } from "@/lib/public-settings";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { runAiDirectorySearch } from "@/lib/ai/run-ai-directory-search";

const bodySchema = z.object({
  q: z.string().optional().nullable(),
  taxonomyTermIds: z.array(z.string().uuid()).optional(),
  locationSlug: z.string().optional().nullable(),
  sort: z.string().optional().nullable(),
  locale: z.enum(["en", "es"]).optional(),
  limit: z.number().int().min(1).max(DIRECTORY_PAGE_SIZE_MAX).optional(),
  heightMinCm: z.number().optional().nullable(),
  heightMaxCm: z.number().optional().nullable(),
  ageMin: z.number().int().optional().nullable(),
  ageMax: z.number().int().optional().nullable(),
  cursor: z.string().optional().nullable(),
  fieldFacets: z
    .array(
      z.object({
        fieldKey: z.string().min(1),
        values: z.array(z.string()),
      }),
    )
    .optional(),
  /** Public directory client sends `directory` for `search_queries.source`. */
  analyticsSource: z.enum(["directory", "ai_search"]).optional(),
});

/**
 * `vector_active` is true only when hybrid is enabled, the query is embeddable, prerequisites
 * (service role + OpenAI) succeed, the ANN RPC succeeds, and at least one neighbor row is returned.
 * When vector reorder runs on the first page, `next_cursor` is **null** (no classic pagination for that slice).
 */
export async function POST(request: Request) {
  try {
    const publicSettings = await getPublicSettings();
    if (!publicSettings.directoryPublic) {
      return NextResponse.json(
        { error: "Directory disabled", results: [], search_mode: "classic" },
        { status: 403 },
      );
    }

    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const {
      q: rawQ,
      taxonomyTermIds: taxIds,
      locationSlug: locRaw,
      sort: sortRaw,
      locale: localeBody,
      limit: limitBody,
      heightMinCm: hMin,
      heightMaxCm: hMax,
      cursor,
      fieldFacets,
      analyticsSource: analyticsSrc,
    } = parsed.data;

    const fieldFacetFilters = (fieldFacets ?? [])
      .map((f) => ({
        fieldKey: f.fieldKey.trim(),
        values: [...new Set(f.values.map((v) => v.trim()).filter(Boolean))],
      }))
      .filter((f) => f.fieldKey && f.values.length > 0);

    const out = await runAiDirectorySearch({
      rawQ: rawQ,
      taxonomyTermIds: taxIds ?? [],
      locationSlug: locRaw,
      sortRaw: sortRaw,
      locale: localeBody ?? "en",
      limit: limitBody,
      heightMinCm: hMin,
      heightMaxCm: hMax,
      ageMin: parsed.data.ageMin,
      ageMax: parsed.data.ageMax,
      fieldFacetFilters,
      cursor: cursor ?? null,
      includeTotalCount: false,
      logAnalytics: true,
      analyticsSource: analyticsSrc ?? "ai_search",
    });

    return NextResponse.json({
      search_mode: out.search_mode,
      results: out.results,
      next_cursor: out.next_cursor,
      taxonomy_term_ids: out.taxonomy_term_ids,
      vector_active: out.vector_active,
      note: out.note,
    });
  } catch (e) {
    logServerError("api/ai/search", e);
    return NextResponse.json(
      { error: CLIENT_ERROR.directoryLoad, results: [], search_mode: "classic" },
      { status: 500 },
    );
  }
}
