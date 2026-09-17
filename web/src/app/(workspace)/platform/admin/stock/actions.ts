"use server";

/**
 * Platform HQ · Lifestyle stock — server actions. Super-admin only. The
 * write logic lives in lib/media/platform-stock-admin.server.ts; these
 * actions parse the form, gate, and revalidate the section.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isPlatformAdmin } from "@/lib/access/platform-role";
import { setImageEngineSettings } from "@/lib/ai/ai-image-model";
import { setStockRetired, storeStockImage, updateStockManifest, STOCK_MAX_BYTES } from "@/lib/media/platform-stock-admin.server";
import { generateStockAsset } from "@/lib/media/stock-engine.server";
import { retireStockAssetForTenants } from "@/lib/media/stock-retire.server";
import { DIRECTION_IDS } from "@/lib/site-admin/builder-core/site-templates/stock-prompts";
import { IMAGE_SLOT_KEYS } from "@/lib/site-admin/builder-core/site-templates/types";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { BUSINESS_FAMILIES, BUSINESS_TYPES, type BusinessFamilyId } from "@/lib/words/business-types";

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
 * Generate one image through the ENGINE (03 §3–4): layered prompt for the
 * type × slot × direction, measured cost, automated QA; the result lands as
 * `qa_passed` or `rejected`, never approved. Refuses honestly when no key is
 * configured (D-TPL-7).
 */
const generateSchema = z.object({
  family: z.enum(BUSINESS_FAMILIES),
  businessType: z
    .string()
    .trim()
    .transform((v) => (v && TYPE_IDS.has(v) ? v : null)),
  slot: z.enum(IMAGE_SLOT_KEYS),
  direction: z.enum(DIRECTION_IDS),
  quality: z.enum(["low", "medium", "high"]).default("medium"),
});

export async function actionGenerateStockImage(fd: FormData): Promise<Result<{ id: string; approval: "qa_passed" | "rejected"; costUsd: number; qa: Record<string, unknown> }>> {
  const g = await gate();
  if (!g.ok) return g;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };
  const parsed = generateSchema.safeParse({ family: fd.get("family"), businessType: fd.get("businessType") ?? "", slot: fd.get("slot"), direction: fd.get("direction"), quality: fd.get("quality") ?? "medium" });
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const r = await generateStockAsset(admin, { family: parsed.data.family, typeId: parsed.data.businessType, slot: parsed.data.slot, direction: parsed.data.direction, quality: parsed.data.quality, createdBy: g.userId });
  if (!r.ok) return { ok: false, error: r.code === "not_configured" ? "Image provider not configured. Add the OpenAI key under AI providers, or upload a licensed photo instead." : `${r.code}: ${r.error}` };
  revalidatePath(PATH);
  return { ok: true, data: { id: r.id, approval: r.approval, costUsd: r.costUsd, qa: r.qa } };
}

/** Seed one type's heroes: one per visual direction, medium (03 §2b). Sequential, so a click never trips the rate limit. */
export async function actionSeedHeroesForType(family: string, businessType: string | null): Promise<Result<{ generated: number; passed: number; costUsd: number; errors: string[] }>> {
  const g = await gate();
  if (!g.ok) return g;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };
  if (!(BUSINESS_FAMILIES as readonly string[]).includes(family)) return { ok: false, error: "Unknown family." };
  const typeId = businessType && TYPE_IDS.has(businessType) ? businessType : null;
  const out = { generated: 0, passed: 0, costUsd: 0, errors: [] as string[] };
  for (const direction of DIRECTION_IDS) {
    const r = await generateStockAsset(admin, { family: family as BusinessFamilyId, typeId, slot: "hero", direction, quality: "medium", createdBy: g.userId });
    out.costUsd += r.costUsd;
    if (r.ok) {
      out.generated += 1;
      if (r.approval === "qa_passed") out.passed += 1;
    } else {
      out.errors.push(`${direction}: ${r.code}`);
      if (r.code === "not_configured" || r.code === "daily_cap" || r.code === "insufficient_quota") break;
    }
  }
  revalidatePath(PATH);
  return { ok: true, data: out };
}

/** Human review (03 §4.3): approve serves the pool (tenant images join it, tags kept); reject keeps the row for the audit. */
export async function actionReviewStockImage(id: string, decision: "approve" | "reject", note: string): Promise<Result> {
  const g = await gate();
  if (!g.ok) return g;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Bad id." };
  const { error } = await admin
    .from("platform_stock_images")
    .update({ approval: decision === "approve" ? "approved" : "rejected", review_note: note.trim().slice(0, 300) || null, reviewed_by: g.userId, reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .in("approval", ["generated", "qa_passed", "approved", "rejected"]);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  revalidatePath(`${PATH}/review`);
  return { ok: true, data: null };
}

export async function actionSaveImageEngineSettings(fd: FormData): Promise<Result> {
  const g = await gate();
  if (!g.ok) return g;
  const num = (k: string) => Number(String(fd.get(k) ?? "").trim());
  const res = await setImageEngineSettings({
    model: String(fd.get("model") ?? "").trim(),
    qaModel: String(fd.get("qaModel") ?? "").trim(),
    prices: { textIn: num("priceTextIn"), imageIn: num("priceImageIn"), output: num("priceOutput") },
    dailyCap: num("dailyCap"),
    regenPerTenant: num("regenPerTenant"),
  });
  if (!res.ok) return res;
  revalidatePath(PATH);
  return { ok: true, data: null };
}

export async function actionRetireStockImage(id: string, retired: boolean): Promise<Result> {
  const g = await gate();
  if (!g.ok) return g;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };
  const res = await setStockRetired(admin, id, retired);
  if (!res.ok) return res;
  // A retired pool asset is swapped PER TENANT (03 §5): every assignment that
  // holds it moves to the next pool image and the pages follow.
  if (retired) await retireStockAssetForTenants(admin, id);
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
