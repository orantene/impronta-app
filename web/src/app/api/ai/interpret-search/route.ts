import { NextResponse } from "next/server";

import { insertAiSearchLog } from "@/lib/ai/ai-search-logs";
import { loadInterpretSearchCatalog } from "@/lib/ai/interpret-search-catalog";
import { runInterpretSearchModel } from "@/lib/ai/interpret-search-model";
import {
  validateAndMergeInterpretIntent,
  type RawModelIntent,
} from "@/lib/ai/validate-interpret-intent";
import { assertAiInvocationAllowed, recordAiUsageEstimate } from "@/lib/ai/ai-usage-gate";
import { pruneInterpretTermsToTenantRoster } from "@/lib/ai/prune-interpret-terms";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getPublicSettings } from "@/lib/public-settings";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { logServerError } from "@/lib/server/safe-error";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { getPublicHostContext, getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { resolveAnyTenantPublicPath } from "@/lib/saas/surface-allow-list";

const MAX_QUERY_LEN = 800;

async function resolvePathTenantIdFromReferer(
  request: Request,
): Promise<string | null> {
  const referer = request.headers.get("referer");
  if (!referer) return null;
  try {
    const url = new URL(referer);
    const resolved = resolveAnyTenantPublicPath(url.pathname);
    if (!resolved) return null;
    const scope = await getTenantPortalScopeBySlug(resolved.tenantSlug);
    return scope?.tenantId ?? null;
  } catch {
    return null;
  }
}

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

  const hostContext = await getPublicHostContext();
  // Tenant for roster-aware pruning + logging. The host context only carries a
  // tenant on real agency hosts; path-based tenancy (`/w/<slug>` on the apex /
  // localhost) reaches this API with no tenant header — resolve it from the
  // Referer path exactly like `/api/directory` does.
  const tenantId =
    hostContext.kind === "agency"
      ? hostContext.tenantId
      : await resolvePathTenantIdFromReferer(request);

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

    // Tenant-roster pruning: keep only interpreted terms an active roster
    // profile actually carries (unused terms climb to a populated ancestor,
    // else drop). Without this, one platform-catalog term nobody is tagged
    // with ANDs the whole directory result to zero. Service role: roster +
    // taxonomy assignment tables aren't on the public RLS allowlist.
    const svc = createServiceRoleClient();
    const prunedTermIds = svc
      ? await pruneInterpretTermsToTenantRoster(svc, tenantId, mapped.taxonomyTermIds)
      : mapped.taxonomyTermIds;
    // If pruning emptied the ENTIRE structured intent (no terms, no location,
    // no ranges), fall back to the raw text so hybrid keyword search still has
    // something to chew on instead of silently listing everyone.
    const prunedQuery =
      mapped.query ||
      (prunedTermIds.length === 0 &&
      !mapped.locationSlug &&
      mapped.heightMinCm == null &&
      mapped.heightMaxCm == null &&
      mapped.ageMin == null &&
      mapped.ageMax == null
        ? q
        : mapped.query);

    insertAiSearchLog({
      tenantId,
      rawQuery: q,
      normalizedSummary: mapped.normalizedSummary,
      taxonomyTermIds: prunedTermIds,
      locationSlug: mapped.locationSlug,
      heightMinCm: mapped.heightMinCm,
      heightMaxCm: mapped.heightMaxCm,
      locale,
      usedInterpreter: usedModel,
    }).catch((err) => logServerError("api/ai/interpret-search/insertAiSearchLog", err));

    if (usedModel) {
      recordAiUsageEstimate().catch((err) =>
        logServerError("api/ai/interpret-search/recordAiUsageEstimate", err),
      );
    }

    return NextResponse.json({
      taxonomyTermIds: prunedTermIds,
      locationSlug: mapped.locationSlug,
      query: prunedQuery,
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
