import "server-only";

import { randomUUID } from "node:crypto";

import { resolveOpenAiApiKey } from "@/lib/ai/resolve-api-keys";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { DEFAULT_AI_TENANT_ID } from "@/lib/ai/ai-tenant-constants";
import { recordAiUsageEstimate } from "@/lib/ai/ai-usage-gate";
import { insertTenantImageAsset } from "@/lib/site-admin/media/assets";
import { resizeUploadForStorage } from "@/lib/server/media-resize";
import { MEDIA_PUBLIC_BUCKET } from "@/lib/site-admin/media/validation";
import { logServerError } from "@/lib/server/safe-error";
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
 *    IMAGE_QUOTA_BY_PLAN; even the top tier caps out below ~$10/mo of DALL·E),
 *  - the quota is checked BEFORE the paid call, and every generation is logged
 *    to the same ai_usage_monthly counter the spend cap reads, so image spend
 *    also counts against the tenant's monthly cap, and
 *  - a conservative prompt (no real-person likeness, text, logos, or nudity).
 *
 * The pure helpers (imageQuotaForPlan / quotaDecision / estimateImageCostUsd)
 * are unit-tested; the DB/OpenAI/storage paths are best-effort and fail closed
 * (an error never charges the tenant or corrupts the tree).
 *
 * LIVE-TEST BLOCKER: production has no OpenAI key configured yet
 * (ai-providers shows OpenAI "Not configured"). generateImageBytesFromPrompt
 * throws a clear error until one is set; the quota gate + cost accounting are
 * exercisable without it.
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
  const key = (await resolveOpenAiApiKey())?.trim();
  if (!key) throw new Error("OpenAI API key is not configured.");

  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || "dall-e-3";
  const safeSubject = subject.trim().slice(0, 400) || "an abstract editorial image";
  const prompt = [
    "Create a single high-end editorial photograph-style image for a talent-agency website.",
    "Soft natural light, luxury fashion-magazine mood, tasteful composition.",
    "No text, no logos, no watermarks. No recognizable real person, face, or celebrity. No nudity.",
    `Subject (interpret tastefully): "${safeSubject}".`,
  ].join(" ");

  const body: Record<string, unknown> = { model, prompt, n: 1 };
  if (model.startsWith("dall-e")) body.size = "1024x1024";

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t.slice(0, 280) || `OpenAI images HTTP ${res.status}`);
  }
  const json = (await res.json()) as { data?: { url?: string; b64_json?: string }[] };
  const first = json.data?.[0];
  if (first?.b64_json) return Buffer.from(first.b64_json, "base64");
  if (first?.url) {
    const img = await fetch(first.url);
    if (!img.ok) throw new Error("Failed to download generated image.");
    return Buffer.from(await img.arrayBuffer());
  }
  throw new Error("OpenAI returned no image.");
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
    const storagePath = `tenant/${input.tenantId}/library/${randomUUID()}.${resized.ext}`;
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
      metadata: { source: "ai-image-generate", kind: "image" },
    });
    if (!inserted.item?.publicUrl) {
      await supabase.storage.from(MEDIA_PUBLIC_BUCKET).remove([storagePath]);
      return null;
    }
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
      model: process.env.OPENAI_IMAGE_MODEL?.trim() || "dall-e-3",
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
