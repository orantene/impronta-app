import "server-only";

import { randomUUID } from "node:crypto";

import { resolveOpenAiApiKey } from "@/lib/ai/resolve-api-keys";
import { imageCostFromUsage, resolveImageEngineSettings, type ImageEngineSettings, type ImageQuality, type ImageUsage } from "@/lib/ai/ai-image-model";
import { buildOpenAiImageRequestBody, isDallEModel } from "@/lib/ai/openai-image-request";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { DEFAULT_AI_TENANT_ID } from "@/lib/ai/ai-tenant-constants";
import { recordAiUsageEstimate } from "@/lib/ai/ai-usage-gate";
import { insertTenantImageAsset } from "@/lib/site-admin/media/assets";
import { resizeUploadForStorage } from "@/lib/server/media-resize";
import { MEDIA_PUBLIC_BUCKET } from "@/lib/site-admin/media/validation";
import { logServerError } from "@/lib/server/safe-error";
import { fileAssetInSystemFolder, LIFESTYLE_FOLDER } from "@/lib/media/system-folders";
import {
  estimateImageCostUsd,
  imageQuotaForPlan,
  quotaDecision,
} from "@/lib/ai/ai-image-quota";

// Re-export the pure quota/cost API so callers have one import surface.
export * from "@/lib/ai/ai-image-quota";

/**
 * AI IMAGE GENERATION for the page builder — the headline "magic" (a per-node
 * "Generate image" that replaces the curated stock photo with a bespoke one).
 *
 * The user's explicit worry was COST, so this module is built cost-first:
 *  - a per-tenant MONTHLY image quota by plan tier (hard ceiling — see
 *    IMAGE_QUOTA_BY_PLAN; even the top tier caps out below ~$10/mo of images),
 *  - the quota is checked BEFORE the paid call, and every generation is logged
 *    to the same ai_usage_monthly counter the spend cap reads, so image spend
 *    also counts against the tenant's monthly cap, and
 *  - a conservative prompt (no real-person likeness, text, logos, or nudity).
 *
 * The pure helpers (imageQuotaForPlan / quotaDecision / estimateImageCostUsd)
 * are unit-tested; the DB/OpenAI/storage paths are best-effort and fail closed
 * (an error never charges the tenant or corrupts the tree).
 *
 * The model is the `ai_image_model` admin setting (ai-image-model.ts); the
 * old `dall-e-3` default is gone from the vendor (verified 2026-09-16 against
 * /v1/models). Engine callers use `generateStockImage`, which returns the
 * measured cost; the legacy helpers below keep their shape.
 */

// ── Month key (matches ai-usage-gate) ───────────────────────────────────────

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ── Generation ──────────────────────────────────────────────────────────────

/**
 * Generate raw image bytes for a subject via OpenAI Images. Prompt is hardened
 * (no real-person likeness, text, logos, or nudity) — mirrors the shipped
 * taxonomy promo-image generator, but takes a caller subject.
 */
export async function generateImageBytesFromPrompt(subject: string): Promise<Buffer> {
  const safeSubject = subject.trim().slice(0, 400) || "an abstract editorial image";
  return requestOpenAiImage(
    [
      "Create a single high-end editorial photograph-style image for a talent-agency website.",
      "Soft natural light, luxury fashion-magazine mood, tasteful composition.",
      "No text, no logos, no watermarks. No recognizable real person, face, or celebrity. No nudity.",
      `Subject (interpret tastefully): "${safeSubject}".`,
    ].join(" "),
  );
}

/**
 * Lifestyle stock for a BUSINESS TYPE (Templates & Imagery, Layer 3). Same
 * hardening as above, without the talent-agency framing: the mood line comes
 * from the caller (the family), and the subject names the place and the
 * role (hero / portrait / detail…). Returns the exact prompt used so the
 * manifest can record it.
 */
export async function generateLifestyleStockBytes(input: {
  subject: string;
  mood: string;
  role: string;
}): Promise<{ bytes: Buffer; prompt: string }> {
  const safeSubject = input.subject.trim().slice(0, 400) || "a small local business at work";
  const prompt = [
    "Create a single realistic editorial photograph for a small business website.",
    `${input.mood.trim().slice(0, 200)} Natural light, honest and warm, no staging clichés.`,
    `Framing for a ${input.role} image slot.`,
    "No text, no logos, no watermarks, no brand names. No recognizable real person, face, or celebrity. No nudity.",
    `Subject: "${safeSubject}".`,
  ].join(" ");
  return { bytes: await requestOpenAiImage(prompt), prompt };
}

export type ImageProviderErrorCode = "not_configured" | "moderation_blocked" | "rate_limit_exceeded" | "insufficient_quota" | "provider_error";

/** A provider refusal the pipeline treats as a STATE (03 §4), not a crash. */
export class ImageProviderError extends Error {
  readonly code: ImageProviderErrorCode;
  readonly status: number | null;
  constructor(code: ImageProviderErrorCode, message: string, status: number | null = null) {
    super(message);
    this.name = "ImageProviderError";
    this.code = code;
    this.status = status;
  }
}

export interface GeneratedStockImage {
  bytes: Buffer;
  model: string;
  size: string;
  quality: ImageQuality;
  usage: ImageUsage | null;
  /** From usage × the stored per-1M prices; 0 when the reply carried no usage. */
  costUsd: number;
  latencyMs: number;
}

/**
 * One image from the OpenAI images API with the engine's stored model and the
 * COST MEASURED from the reply's usage (03 §1). The prompt is the caller's
 * (the layered resolver); nothing is appended here. Errors are typed so a job
 * runner can file `moderation_blocked` / `rate_limit_exceeded` as states.
 */
export async function generateStockImage(input: {
  prompt: string;
  size: "1536x1024" | "1024x1024" | "1024x1536";
  quality?: ImageQuality;
  settings?: ImageEngineSettings;
}): Promise<GeneratedStockImage> {
  const key = (await resolveOpenAiApiKey())?.trim();
  if (!key) throw new ImageProviderError("not_configured", "OpenAI API key is not configured.");
  const settings = input.settings ?? (await resolveImageEngineSettings());
  const quality = input.quality ?? "medium";
  const started = Date.now();
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    // Body shape per model family lives in openai-image-request.ts (#2029):
    // dall-e takes hd/standard and a square, gpt-image takes size + quality.
    body: JSON.stringify({
      ...buildOpenAiImageRequestBody({ prompt: input.prompt, model: settings.model, size: input.size, quality }),
      ...(isDallEModel(settings.model) ? {} : { output_format: "jpeg", output_compression: 85 }),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    let code: ImageProviderErrorCode = "provider_error";
    let message = text.slice(0, 280) || `OpenAI images HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(text) as { error?: { code?: string; message?: string; type?: string } };
      const vendor = parsed.error?.code ?? parsed.error?.type ?? "";
      message = parsed.error?.message?.slice(0, 280) ?? message;
      if (vendor === "moderation_blocked" || vendor === "content_policy_violation") code = "moderation_blocked";
      else if (vendor === "rate_limit_exceeded" || res.status === 429 && !/quota/i.test(vendor)) code = "rate_limit_exceeded";
      if (vendor === "insufficient_quota" || /credit_balance_exhausted/i.test(vendor)) code = "insufficient_quota";
    } catch {
      if (res.status === 429) code = "rate_limit_exceeded";
    }
    throw new ImageProviderError(code, message, res.status);
  }
  const json = (await res.json()) as { data?: { url?: string; b64_json?: string }[]; usage?: ImageUsage };
  const first = json.data?.[0];
  let bytes: Buffer | null = null;
  if (first?.b64_json) bytes = Buffer.from(first.b64_json, "base64");
  else if (first?.url) {
    const img = await fetch(first.url);
    if (!img.ok) throw new ImageProviderError("provider_error", "Failed to download generated image.");
    bytes = Buffer.from(await img.arrayBuffer());
  }
  if (!bytes) throw new ImageProviderError("provider_error", "OpenAI returned no image.");
  return { bytes, model: settings.model, size: input.size, quality, usage: json.usage ?? null, costUsd: imageCostFromUsage(json.usage, settings.prices), latencyMs: Date.now() - started };
}

/** Legacy single-image path (builder node image, taxonomy promo). Uses the stored model; square, medium. */
async function requestOpenAiImage(prompt: string): Promise<Buffer> {
  const out = await generateStockImage({ prompt, size: "1024x1024", quality: "medium" });
  return out.bytes;
}

// ── Quota check (DB) ────────────────────────────────────────────────────────

export type ImageQuotaStatus = {
  allowed: boolean;
  used: number;
  cap: number;
  remaining: number;
  plan: string;
};

async function resolveTenantPlan(tenantId: string): Promise<string> {
  try {
    const supabase = createServiceRoleClient();
    if (!supabase) return "free";
    const { data } = await supabase
      .from("agencies")
      .select("plan_tier")
      .eq("id", tenantId)
      .maybeSingle();
    const plan = (data as { plan_tier?: string | null } | null)?.plan_tier;
    return typeof plan === "string" && plan ? plan : "free";
  } catch {
    return "free";
  }
}

async function countImageGenerationsThisMonth(tenantId: string): Promise<number> {
  try {
    const supabase = createServiceRoleClient();
    if (!supabase) return 0;
    const since = `${currentMonthKey()}-01T00:00:00.000Z`;
    const { data } = await supabase
      .from("cms_ai_usage_log")
      .select("context_jsonb, created_at")
      .eq("tenant_id", tenantId)
      .eq("action", "generate_section")
      .gte("created_at", since)
      .limit(5000);
    if (!Array.isArray(data)) return 0;
    return data.filter(
      (r) => (r.context_jsonb as { feature?: string } | null)?.feature === "builder_image",
    ).length;
  } catch {
    return 0;
  }
}

/** Whether the tenant may generate another image this month (plan cap - used). */
export async function checkImageQuota(
  tenantId: string = DEFAULT_AI_TENANT_ID,
): Promise<ImageQuotaStatus> {
  const plan = await resolveTenantPlan(tenantId);
  const cap = imageQuotaForPlan(plan);
  const used = await countImageGenerationsThisMonth(tenantId);
  const { allowed, remaining } = quotaDecision(used, cap);
  return { allowed, used, cap, remaining, plan };
}

// ── Upload + record ─────────────────────────────────────────────────────────

/**
 * Resize + store generated bytes into the tenant media library and return the
 * public URL (reuses the exact helpers the /api/admin/media/upload route uses).
 * Returns null on any failure (caller surfaces a friendly error).
 */
export async function uploadGeneratedImageBytes(input: {
  tenantId: string;
  userId: string;
  bytes: Buffer;
  alt?: string | null;
}): Promise<{ url: string; id: string } | null> {
  try {
    const supabase = createServiceRoleClient();
    if (!supabase) return null;
    const resized = await resizeUploadForStorage(input.bytes, "gallery");
    // `/lifestyle/` rather than the old `/library/`: the prefix says what the
    // file IS, the way branding uploads already say it. Existing files keep
    // their paths — storage paths are stored per row, nothing to migrate.
    const storagePath = `tenant/${input.tenantId}/lifestyle/${randomUUID()}.${resized.ext}`;
    const upload = await supabase.storage
      .from(MEDIA_PUBLIC_BUCKET)
      .upload(storagePath, resized.buffer, {
        contentType: resized.mimeType,
        cacheControl: "3600",
        upsert: false,
      });
    if (upload.error) {
      logServerError("ai-image/upload", upload.error);
      return null;
    }
    const inserted = await insertTenantImageAsset({
      supabase,
      tenantId: input.tenantId,
      createdByUserId: input.userId,
      storagePath,
      mime: resized.mimeType,
      byteSize: resized.buffer.length,
      alt: input.alt ?? null,
      metadata: { source: "ai-image-generate", kind: "image", category: "lifestyle" },
    });
    if (!inserted.item?.publicUrl) {
      await supabase.storage.from(MEDIA_PUBLIC_BUCKET).remove([storagePath]);
      return null;
    }
    // File it into the tenant's Lifestyle folder so generated imagery is a
    // findable SET in the media library instead of loose rows among talent
    // photography. Failure here is deliberately non-fatal: the image exists
    // and is usable; only its filing is missing, and the backfill can repair
    // that later. Same posture as branding uploads.
    await fileAssetInSystemFolder(supabase, {
      tenantId: input.tenantId,
      assetId: inserted.item.id,
      spec: LIFESTYLE_FOLDER,
      addedBy: input.userId,
    });

    return { url: inserted.item.publicUrl, id: inserted.item.id };
  } catch (err) {
    logServerError("ai-image/upload", err);
    return null;
  }
}

/** Log a generation to cms_ai_usage_log + roll the cost into ai_usage_monthly (spend cap). */
export async function recordImageGenerationUsage(input: {
  tenantId: string;
  userId: string;
  ok: boolean;
}): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    if (!supabase) return;
    const costUsd = input.ok ? estimateImageCostUsd() : 0;
    await supabase.from("cms_ai_usage_log").insert({
      tenant_id: input.tenantId,
      action: "generate_section", // reuse the allowed action value; feature marks images
      provider: "openai",
      model: (await resolveImageEngineSettings()).model,
      ok: input.ok,
      actor_profile_id: input.userId,
      context_jsonb: { feature: "builder_image", cost_usd: costUsd },
    });
    if (input.ok && costUsd > 0) {
      await recordAiUsageEstimate(input.tenantId, Math.max(1, Math.round(costUsd * 100)));
    }
  } catch (err) {
    logServerError("ai-image/record-usage", err);
  }
}
