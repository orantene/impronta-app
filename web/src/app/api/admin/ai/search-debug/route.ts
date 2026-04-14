import { NextResponse } from "next/server";
import { z } from "zod";
import { DIRECTORY_PAGE_SIZE_MAX } from "@/lib/directory/types";
import { getPublicSettings } from "@/lib/public-settings";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { runAiDirectorySearch } from "@/lib/ai/run-ai-directory-search";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { loadAccessProfile } from "@/lib/access-profile";
import { isStaffRole } from "@/lib/auth-flow";

const bodySchema = z.object({
  q: z.string().optional().nullable(),
  taxonomyTermIds: z.array(z.string().uuid()).optional(),
  locationSlug: z.string().optional().nullable(),
  sort: z.string().optional().nullable(),
  locale: z.enum(["en", "es"]).optional(),
  limit: z.number().int().min(1).max(DIRECTORY_PAGE_SIZE_MAX).optional(),
  heightMinCm: z.number().optional().nullable(),
  heightMaxCm: z.number().optional().nullable(),
  cursor: z.string().optional().nullable(),
});

/**
 * Staff-only: replay directory AI search with `debug` diagnostics (Chunk 1 / Chunk 7).
 * Does not write `search_queries` by default.
 */
export async function POST(request: Request) {
  try {
    const supabase = await getCachedServerSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Unavailable" }, { status: 503 });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await loadAccessProfile(supabase, user.id);
    if (!isStaffRole(profile?.app_role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const publicSettings = await getPublicSettings();
    if (!publicSettings.directoryPublic) {
      return NextResponse.json(
        { error: "Directory disabled" },
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
    } = parsed.data;

    const out = await runAiDirectorySearch({
      rawQ: rawQ,
      taxonomyTermIds: taxIds ?? [],
      locationSlug: locRaw,
      sortRaw: sortRaw,
      locale: localeBody ?? "en",
      limit: limitBody,
      heightMinCm: hMin,
      heightMaxCm: hMax,
      cursor: cursor ?? null,
      includeTotalCount: false,
      logAnalytics: false,
      analyticsSource: "admin_search_debug",
      includeDebug: true,
    });

    return NextResponse.json({
      search_mode: out.search_mode,
      results: out.results,
      next_cursor: out.next_cursor,
      taxonomy_term_ids: out.taxonomy_term_ids,
      vector_active: out.vector_active,
      note: out.note,
      debug: out.debug,
    });
  } catch (e) {
    logServerError("api/admin/ai/search-debug", e);
    return NextResponse.json(
      { error: CLIENT_ERROR.directoryLoad },
      { status: 500 },
    );
  }
}
