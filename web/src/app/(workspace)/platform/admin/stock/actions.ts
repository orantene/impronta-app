"use server";

/**
 * Platform HQ · Lifestyle stock — server actions. Super-admin only. The
 * write logic lives in lib/media/platform-stock-admin.server.ts; these
 * actions parse the form, gate, and revalidate the section.
 */

import { resolveOpenAiImageModel } from "@/lib/ai/openai-image-request";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isPlatformAdmin } from "@/lib/access/platform-role";
import { generateLifestyleStockBytes } from "@/lib/ai/ai-image-generation";
import { estimateImageCostUsd } from "@/lib/ai/ai-image-quota";
import { resolveStockTenantId } from "@/lib/media/platform-stock";
import { setStockRetired, storeStockImage, updateStockManifest, STOCK_MAX_BYTES } from "@/lib/media/platform-stock-admin.server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { BUSINESS_FAMILIES, BUSINESS_TYPES } from "@/lib/words/business-types";

const PATH = "/platform/admin/stock";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

async function gate(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not signed in." };
  if (!isPlatformAdmin(session.profile)) return { ok: false, error: "Super admin access required." };
  return { ok: true, userId: session.user.id };
}

const TYPE_IDS = new Set(BUSINESS_TYPES.map((t) => t.id));

const manifestSchema = z.object({
  family: z.enum(BUSINESS_FAMILIES),
  businessType: z
    .string()
    .trim()
    .transform((v) => (v && TYPE_IDS.has(v) ? v : null)),
  role: z.enum(["hero", "wide", "portrait", "gallery", "team", "detail"]),
  source: z.enum(["generated", "licensed"]),
  licence: z.string().trim().min(1).max(200),
  prompt: z.string().trim().max(2000).optional().transform((v) => v || null),
  supplier: z.string().trim().max(200).optional().transform((v) => v || null),
  paletteHint: z.string().trim().max(60).optional().transform((v) => v || null),
  altEs: z.string().trim().min(3).max(240),
  altEn: z.string().trim().min(3).max(240),
});

function readManifest(fd: FormData) {
  return manifestSchema.safeParse({
    family: fd.get("family"),
    businessType: fd.get("businessType") ?? "",
    role: fd.get("role"),
    source: fd.get("source"),
    licence: fd.get("licence"),
    prompt: fd.get("prompt") ?? undefined,
    supplier: fd.get("supplier") ?? undefined,
    paletteHint: fd.get("paletteHint") ?? undefined,
    altEs: fd.get("altEs"),
    altEn: fd.get("altEn"),
  });
}

/** Upload one licensed (or externally generated) file. */
export async function actionUploadStockImage(fd: FormData): Promise<Result<{ id: string; bytes: number }>> {
  const g = await gate();
  if (!g.ok) return g;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };
  const parsed = readManifest(fd);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose an image file." };
  if (!file.type.startsWith("image/")) return { ok: false, error: "Images only." };
  if (file.size > 25 * 1024 * 1024) return { ok: false, error: "That file is over 25 MB." };
  const bytes = Buffer.from(await file.arrayBuffer());
  const stored = await storeStockImage(admin, { bytes, manifest: parsed.data, createdBy: g.userId });
  if (!stored.ok) return stored;
  revalidatePath(PATH);
  return { ok: true, data: { id: stored.id, bytes: stored.bytes } };
}

/**
 * Generate one image with the configured provider. Refuses honestly when no
 * key is configured (D-TPL-7). Usage is logged with the cost so the per-site
 * accounting can include library generation.
 */
export async function actionGenerateStockImage(fd: FormData): Promise<Result<{ id: string; bytes: number; costUsd: number }>> {
  const g = await gate();
  if (!g.ok) return g;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };
  const parsed = readManifest(fd);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const subject = String(fd.get("subject") ?? "").trim();
  const mood = String(fd.get("mood") ?? "").trim();
  if (subject.length < 8) return { ok: false, error: "Describe the subject (at least 8 characters)." };

  let generated: { bytes: Buffer; prompt: string };
  try {
    generated = await generateLifestyleStockBytes({ subject, mood, role: parsed.data.role });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed.";
    await logUsage(admin, g.userId, false, parsed.data.family, parsed.data.role);
    return { ok: false, error: /not configured/i.test(message) ? "Image provider not configured. Add the OpenAI key under AI providers, or upload a licensed photo instead." : message };
  }
  const stored = await storeStockImage(admin, {
    bytes: generated.bytes,
    manifest: { ...parsed.data, source: "generated", prompt: generated.prompt, licence: parsed.data.licence || "generated-platform" },
    createdBy: g.userId,
  });
  await logUsage(admin, g.userId, stored.ok, parsed.data.family, parsed.data.role);
  if (!stored.ok) return stored;
  revalidatePath(PATH);
  return { ok: true, data: { id: stored.id, bytes: stored.bytes, costUsd: estimateImageCostUsd() } };
}

/** Library generation is logged against the stock tenant (the log's tenant_id is NOT NULL). */
async function logUsage(admin: NonNullable<ReturnType<typeof createServiceRoleClient>>, userId: string, ok: boolean, family: string, role: string) {
  try {
    const tenantId = await resolveStockTenantId(admin);
    if (!tenantId) return;
    await admin.from("cms_ai_usage_log").insert({
      tenant_id: tenantId,
      action: "generate_section",
      provider: "openai",
      model: resolveOpenAiImageModel(),
      ok,
      actor_profile_id: userId,
      context_jsonb: { feature: "platform_stock_image", cost_usd: ok ? estimateImageCostUsd() : 0, family, role },
    } as never);
  } catch (error) {
    logServerError("platform-stock.usage", error);
  }
}

export async function actionRetireStockImage(id: string, retired: boolean): Promise<Result> {
  const g = await gate();
  if (!g.ok) return g;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };
  const res = await setStockRetired(admin, id, retired);
  if (!res.ok) return res;
  revalidatePath(PATH);
  return { ok: true, data: null };
}

export async function actionUpdateStockManifest(fd: FormData): Promise<Result> {
  const g = await gate();
  if (!g.ok) return g;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };
  const id = String(fd.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing id." };
  const res = await updateStockManifest(admin, id, {
    businessType: fd.has("businessType") ? (String(fd.get("businessType")).trim() || null) : undefined,
    licence: fd.has("licence") ? String(fd.get("licence")).trim() : undefined,
    supplier: fd.has("supplier") ? String(fd.get("supplier")).trim() || null : undefined,
    paletteHint: fd.has("paletteHint") ? String(fd.get("paletteHint")).trim() || null : undefined,
    altEs: fd.has("altEs") ? String(fd.get("altEs")).trim() : undefined,
    altEn: fd.has("altEn") ? String(fd.get("altEn")).trim() : undefined,
  });
  if (!res.ok) return res;
  revalidatePath(PATH);
  return { ok: true, data: null };
}

export async function stockLimits(): Promise<{ maxBytes: number }> {
  return { maxBytes: STOCK_MAX_BYTES };
}
