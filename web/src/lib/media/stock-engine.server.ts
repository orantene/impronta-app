import "server-only";

/**
 * stock-engine.server.ts — one generated stock asset, end to end (03 §4.1–4.2):
 * layered prompt → provider call with measured cost → automated QA → filed as
 * `qa_passed` or `rejected` (never `approved`; that is a human's word) → usage
 * row with the measured USD. Provider refusals come back as STATES so the job
 * runner and the admin action can file them instead of crashing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveImageEngineSettings, type ImageEngineSettings, type ImageQuality } from "@/lib/ai/ai-image-model";
import { ImageProviderError, generateStockImage } from "@/lib/ai/ai-image-generation";
import { recordAiUsageEstimate } from "@/lib/ai/ai-usage-gate";
import { logServerError } from "@/lib/server/safe-error";
import { resolveStockPrompt, type DirectionId, type StockPromptFacts } from "@/lib/site-admin/builder-core/site-templates/stock-prompts";
import type { ImageSlotKey } from "@/lib/site-admin/builder-core/site-templates/types";
import { businessTypeById, type BusinessFamilyId } from "@/lib/words/business-types";

import { resolveStockTenantId } from "./platform-stock";
import { storeStockImage } from "./platform-stock-admin.server";
import { loadPoolHashes, runStockQa } from "./stock-qa.server";

export interface GenerateStockAssetInput {
  family: BusinessFamilyId;
  /** null = a family-level seed asset. */
  typeId: string | null;
  slot: ImageSlotKey;
  direction: DirectionId;
  facts?: StockPromptFacts;
  quality?: ImageQuality;
  /** Set for a per-site generation; the asset is that tenant's until approved into the pool. */
  originTenantId?: string | null;
  siteComposeId?: string | null;
  createdBy: string | null;
  settings?: ImageEngineSettings;
}

export type GenerateStockAssetResult =
  | { ok: true; id: string; assetId: string; approval: "qa_passed" | "rejected"; costUsd: number; latencyMs: number; qa: Record<string, unknown> }
  | { ok: false; code: "not_configured" | "moderation_blocked" | "rate_limit_exceeded" | "insufficient_quota" | "provider_error" | "store_failed" | "daily_cap"; error: string; costUsd: number };

const REWORD = " Everyone is fully clothed; a calm, ordinary, family-friendly working scene.";

const DIRECTION_ALT: Readonly<Record<DirectionId, { es: string; en: string }>> = {
  editorial: { es: "el espacio", en: "the space" },
  service: { es: "el trabajo en curso", en: "the work in progress" },
  result: { es: "el resultado terminado", en: "the finished result" },
  lifestyle: { es: "un momento de cliente", en: "a client's moment" },
  minimal: { es: "herramientas y materiales", en: "tools and materials" },
};

export async function generateStockAsset(admin: SupabaseClient, input: GenerateStockAssetInput): Promise<GenerateStockAssetResult> {
  const settings = input.settings ?? (await resolveImageEngineSettings());
  const cap = await dailyImageCeiling(admin, settings);
  if (!cap.allowed) return { ok: false, code: "daily_cap", error: `Daily image ceiling reached (${cap.used}/${cap.cap}).`, costUsd: 0 };

  const resolved = resolveStockPrompt({ family: input.family, typeId: input.typeId, slot: input.slot, direction: input.direction, facts: input.facts });
  const type = input.typeId ? businessTypeById(input.typeId) : undefined;
  let costUsd = 0;
  let generated: Awaited<ReturnType<typeof generateStockImage>>;
  try {
    try {
      generated = await generateStockImage({ prompt: resolved.prompt, size: resolved.size, quality: input.quality ?? "medium", settings });
    } catch (first) {
      // One reword retry on a moderation refusal (03 §4.1); anything else is a state as-is.
      if (!(first instanceof ImageProviderError) || first.code !== "moderation_blocked") throw first;
      generated = await generateStockImage({ prompt: resolved.prompt + REWORD, size: resolved.size, quality: input.quality ?? "medium", settings });
    }
  } catch (error) {
    const code = error instanceof ImageProviderError ? error.code : "provider_error";
    const message = error instanceof Error ? error.message : "Generation failed.";
    await logUsage(admin, { input, ok: false, costUsd: 0, model: settings.model, latencyMs: null });
    return { ok: false, code, error: message, costUsd: 0 };
  }
  costUsd = generated.costUsd;

  const qa = await runStockQa({
    bytes: generated.bytes,
    role: resolved.role,
    existingHashes: await loadPoolHashes(admin, { family: input.family, businessType: input.typeId }),
    typeLabel: type ? type.label.en.toLowerCase() : null,
    visionModel: settings.qaModel,
  });
  const approval = qa.passed ? "qa_passed" : "rejected";
  const subjectEs = type?.label.es ?? "Negocio local";
  const subjectEn = type?.label.en ?? "Local business";
  const stored = await storeStockImage(admin, {
    bytes: generated.bytes,
    createdBy: input.createdBy,
    manifest: {
      family: input.family,
      businessType: input.typeId,
      role: resolved.role,
      source: "generated",
      licence: "generated-platform",
      prompt: resolved.prompt,
      altEs: `${subjectEs}: ${DIRECTION_ALT[input.direction].es}`,
      altEn: `${subjectEn}: ${DIRECTION_ALT[input.direction].en}`,
      slot: input.slot,
      approval,
      provenance: "generated",
      direction: input.direction,
      qaJson: { ...qa, checks: qa.checks },
      layerVersions: resolved.layerVersions,
      tags: resolved.tags,
      originTenantId: input.originTenantId ?? null,
      model: generated.model,
      modelSize: generated.size,
      modelQuality: generated.quality,
      promptVersion: Object.values(resolved.layerVersions).join("+"),
      measuredCostUsd: costUsd,
    },
  });
  await logUsage(admin, { input, ok: stored.ok, costUsd, model: generated.model, latencyMs: generated.latencyMs });
  if (!stored.ok) return { ok: false, code: "store_failed", error: stored.error, costUsd };
  return { ok: true, id: stored.id, assetId: stored.assetId, approval, costUsd, latencyMs: generated.latencyMs, qa: qa.checks };
}

/** Images generated today (UTC) across everything, against the admin ceiling. */
export async function dailyImageCeiling(admin: SupabaseClient, settings: ImageEngineSettings): Promise<{ allowed: boolean; used: number; cap: number }> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { count, error } = await admin
    .from("platform_stock_images")
    .select("id", { count: "exact", head: true })
    .eq("source", "generated")
    .gte("generated_at", start.toISOString());
  if (error) {
    logServerError("stock-engine.daily-cap", error);
    return { allowed: false, used: 0, cap: settings.dailyCap };
  }
  const used = count ?? 0;
  return { allowed: used < settings.dailyCap, used, cap: settings.dailyCap };
}

/** Usage row against the stock tenant (pool) or the originating tenant (per-site), with the MEASURED cost. */
async function logUsage(admin: SupabaseClient, args: { input: GenerateStockAssetInput; ok: boolean; costUsd: number; model: string; latencyMs: number | null }): Promise<void> {
  try {
    const tenantId = args.input.originTenantId ?? (await resolveStockTenantId(admin));
    if (!tenantId) return;
    const { error } = await admin.from("cms_ai_usage_log").insert({
      tenant_id: tenantId,
      action: "generate_section",
      provider: "openai",
      model: args.model,
      ok: args.ok,
      latency_ms: args.latencyMs,
      actor_profile_id: args.input.createdBy,
      context_jsonb: {
        feature: args.input.originTenantId ? "tenant_image" : "platform_stock_image",
        cost_usd: args.costUsd,
        family: args.input.family,
        business_type: args.input.typeId,
        slot: args.input.slot,
        direction: args.input.direction,
        ...(args.input.siteComposeId ? { site_compose_id: args.input.siteComposeId } : {}),
      },
    } as never);
    if (error) logServerError("stock-engine.usage", error);
    if (args.ok && args.costUsd > 0) await recordAiUsageEstimate(tenantId, Math.max(1, Math.round(args.costUsd * 100)));
  } catch (error) {
    logServerError("stock-engine.usage", error);
  }
}
