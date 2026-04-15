import { NextResponse } from "next/server";

import { insertAiSearchLog } from "@/lib/ai/ai-search-logs";
import { loadInterpretSearchCatalog } from "@/lib/ai/interpret-search-catalog";
import { runInterpretSearchModel } from "@/lib/ai/interpret-search-model";
import {
  validateAndMergeInterpretIntent,
  type RawModelIntent,
} from "@/lib/ai/validate-interpret-intent";
import { assertAiInvocationAllowed, recordAiUsageEstimate } from "@/lib/ai/ai-usage-gate";
import { getPublicSettings } from "@/lib/public-settings";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { logServerError } from "@/lib/server/safe-error";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

const MAX_QUERY_LEN = 800;

export async function POST(request: Request) {
  const publicSettings = await getPublicSettings();
  if (!publicSettings.directoryPublic) {
    return NextResponse.json({ error: "directory_unavailable" }, { status: 403 });
  }

  const flags = await getAiFeatureFlags();
  if (!flags.ai_master_enabled || !flags.ai_search_enabled) {
    return NextResponse.json({ error: "ai_search_disabled" }, { status: 403 });
  }

  const supabase = createPublicSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const q =
    typeof body === "object" &&
    body !== null &&
    typeof (body as { query?: unknown }).query === "string"
      ? (body as { query: string }).query.trim()
      : "";

  const localeRaw =
    typeof body === "object" &&
    body !== null &&
    typeof (body as { locale?: unknown }).locale === "string"
      ? (body as { locale: string }).locale
      : "en";
  const locale = localeRaw === "es" ? ("es" as const) : ("en" as const);

  if (!q) {
    return NextResponse.json({ error: "query_required" }, { status: 400 });
  }
  if (q.length > MAX_QUERY_LEN) {
    return NextResponse.json({ error: "query_too_long" }, { status: 400 });
  }

  const gate = await assertAiInvocationAllowed();
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.code, message: gate.message },
      { status: 429 },
    );
  }

  try {
    const { terms, locationSlugs } = await loadInterpretSearchCatalog(supabase);
    const locationSet = new Set(locationSlugs);

    const modelRun = await runInterpretSearchModel({
      userQuery: q,
      terms,
      locationSlugs,
      locale,
    });
    const raw: RawModelIntent | null = modelRun.ok ? modelRun.intent : null;
    const usedModel = modelRun.ok;
    const interpretFailureCode = modelRun.ok ? null : modelRun.code;

    const fallbackRaw: RawModelIntent = {
      normalized_summary: q,
      taxonomy_term_ids: [],
      talent_roles: [],
      industries: [],
      event_types: [],
      skills: [],
      fit_labels: [],
      languages: [],
      location_slug: "",
      free_text_fallback: q,
      gender_preference: "",
      height_min_cm: 0,
      height_max_cm: 0,
      confidence: { roles: 0, location: 0, industries: 0 },
      needs_clarification: false,
    };

    const mapped = validateAndMergeInterpretIntent(
      raw ?? fallbackRaw,
      terms,
      locationSet,
      q,
      locale,
    );

    void insertAiSearchLog({
      rawQuery: q,
      normalizedSummary: mapped.normalizedSummary,
      taxonomyTermIds: mapped.taxonomyTermIds,
      locationSlug: mapped.locationSlug,
      heightMinCm: mapped.heightMinCm,
      heightMaxCm: mapped.heightMaxCm,
      locale,
      usedInterpreter: usedModel,
    });

    if (usedModel) {
      void recordAiUsageEstimate();
    }

    return NextResponse.json({
      taxonomyTermIds: mapped.taxonomyTermIds,
      locationSlug: mapped.locationSlug,
      query: mapped.query,
      normalizedSummary: mapped.normalizedSummary,
      heightMinCm: mapped.heightMinCm,
      heightMaxCm: mapped.heightMaxCm,
      ageMin: mapped.ageMin,
      ageMax: mapped.ageMax,
      parsedIntent: mapped.parsedIntent,
      usedInterpreter: usedModel,
      ...(interpretFailureCode != null
        ? { interpretFailureCode }
        : {}),
    });
  } catch (e) {
    logServerError("api/ai/interpret-search", e);
    return NextResponse.json({ error: "interpret_failed" }, { status: 500 });
  }
}
