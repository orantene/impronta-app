import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * Image-generation settings for the Visual Asset Engine (03 §1), all in the
 * `public.settings` KV like `ai_generation_model`, none in env:
 *
 *  - `ai_image_model`                 the OpenAI images model id (free text,
 *                                     shape-validated; the options list is a
 *                                     suggestion, not a whitelist, because the
 *                                     vendor renames models between releases)
 *  - `ai_image_price_per_1m_tokens`   { textIn, imageIn, output } USD, copied
 *                                     by the owner from the vendor pricing page
 *  - `ai_image_daily_cap`             images per UTC day across all tenants
 *  - `ai_image_regen_per_tenant`      builder regenerations per tenant, ever
 *  - `ai_image_qa_model`              vision model for automated QA text/logo/
 *                                     type checks; empty = those checks skipped
 *
 * Cost is never a constant: each call multiplies the reply's usage tokens by
 * the stored prices (measured 2026-09-16: gpt-image-2.5-flare 1536×1024 medium
 * = 433 tokens = $0.01074; evidence/cost-measurement).
 */

export const IMAGE_MODEL_OPTIONS = [
  { id: "gpt-image-2.5-flare", label: "gpt-image-2.5-flare", hint: "Measured default. 1536×1024 medium ≈ $0.011." },
  { id: "gpt-image-2.5-sunburst", label: "gpt-image-2.5-sunburst", hint: "Same price band; different look." },
  { id: "gpt-image-2", label: "gpt-image-2", hint: "Previous generation, same price band." },
  { id: "gpt-image-1-mini", label: "gpt-image-1-mini", hint: "Cheapest ($8/1M output); lower fidelity." },
] as const;

export const DEFAULT_IMAGE_MODEL = "gpt-image-2.5-flare";
export const DEFAULT_IMAGE_PRICES: ImageTokenPrices = { textIn: 5, imageIn: 8, output: 30 };
export const DEFAULT_IMAGE_DAILY_CAP = 400;
export const DEFAULT_IMAGE_REGEN_PER_TENANT = 20;
export const DEFAULT_IMAGE_QA_MODEL = "";

export type ImageTokenPrices = { textIn: number; imageIn: number; output: number };
export type ImageQuality = "low" | "medium" | "high";

export interface ImageEngineSettings {
  model: string;
  prices: ImageTokenPrices;
  dailyCap: number;
  regenPerTenant: number;
  /** Empty string = vision QA checks skipped (recorded as such). */
  qaModel: string;
}

const KEYS = {
  model: "ai_image_model",
  prices: "ai_image_price_per_1m_tokens",
  dailyCap: "ai_image_daily_cap",
  regen: "ai_image_regen_per_tenant",
  qaModel: "ai_image_qa_model",
} as const;

const MODEL_SHAPE = /^[a-z0-9][a-z0-9._-]{2,63}$/;

export function isImageModelId(value: unknown): value is string {
  return typeof value === "string" && MODEL_SHAPE.test(value);
}

function unwrap(raw: unknown): unknown {
  return raw && typeof raw === "object" && !Array.isArray(raw) && "value" in (raw as Record<string, unknown>)
    ? (raw as { value: unknown }).value
    : raw;
}

function pricesFrom(raw: unknown): ImageTokenPrices | null {
  const v = unwrap(raw);
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const n = (k: string) => (typeof o[k] === "number" && Number.isFinite(o[k]) && (o[k] as number) >= 0 ? (o[k] as number) : null);
  const textIn = n("textIn"), imageIn = n("imageIn"), output = n("output");
  return textIn !== null && imageIn !== null && output !== null ? { textIn, imageIn, output } : null;
}

function positiveInt(raw: unknown): number | null {
  const v = unwrap(raw);
  const num = typeof v === "string" ? Number(v) : v;
  return typeof num === "number" && Number.isInteger(num) && num >= 0 ? num : null;
}

/** Best-effort read; any failure returns the measured defaults so generation never breaks on a setting. */
export async function resolveImageEngineSettings(): Promise<ImageEngineSettings> {
  const out: ImageEngineSettings = { model: DEFAULT_IMAGE_MODEL, prices: DEFAULT_IMAGE_PRICES, dailyCap: DEFAULT_IMAGE_DAILY_CAP, regenPerTenant: DEFAULT_IMAGE_REGEN_PER_TENANT, qaModel: DEFAULT_IMAGE_QA_MODEL };
  try {
    const supabase = createServiceRoleClient();
    if (!supabase) return out;
    const { data, error } = await supabase.from("settings").select("key, value").in("key", Object.values(KEYS));
    if (error || !data) return out;
    for (const row of data as Array<{ key: string; value: unknown }>) {
      if (row.key === KEYS.model) {
        const m = unwrap(row.value);
        const model = typeof m === "string" ? m : m && typeof m === "object" && "model" in m ? (m as { model?: unknown }).model : null;
        if (isImageModelId(model)) out.model = model;
      } else if (row.key === KEYS.prices) {
        const p = pricesFrom(row.value);
        if (p) out.prices = p;
      } else if (row.key === KEYS.dailyCap) {
        const n = positiveInt(row.value);
        if (n !== null) out.dailyCap = n;
      } else if (row.key === KEYS.regen) {
        const n = positiveInt(row.value);
        if (n !== null) out.regenPerTenant = n;
      } else if (row.key === KEYS.qaModel) {
        const m = unwrap(row.value);
        if (m === "" || isImageModelId(m)) out.qaModel = m as string;
      }
    }
    return out;
  } catch {
    return out;
  }
}

export type SetResult = { ok: true } | { ok: false; error: string };

async function upsert(key: string, value: unknown): Promise<SetResult> {
  const supabase = createServiceRoleClient();
  if (!supabase) return { ok: false, error: "Database is unavailable." };
  const { error } = await supabase.from("settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  return error ? { ok: false, error: "Couldn't save. Please try again." } : { ok: true };
}

/** Super-admin only; the CALLER enforces the gate. */
export async function setImageEngineSettings(patch: Partial<ImageEngineSettings>): Promise<SetResult> {
  if (patch.model !== undefined) {
    if (!isImageModelId(patch.model)) return { ok: false, error: "Model id: lowercase letters, digits, dots, dashes." };
    const r = await upsert(KEYS.model, patch.model);
    if (!r.ok) return r;
  }
  if (patch.prices !== undefined) {
    if (!pricesFrom(patch.prices)) return { ok: false, error: "Prices must be three non-negative numbers (USD per 1M tokens)." };
    const r = await upsert(KEYS.prices, patch.prices);
    if (!r.ok) return r;
  }
  if (patch.dailyCap !== undefined) {
    if (positiveInt(patch.dailyCap) === null) return { ok: false, error: "Daily cap must be a whole number." };
    const r = await upsert(KEYS.dailyCap, patch.dailyCap);
    if (!r.ok) return r;
  }
  if (patch.qaModel !== undefined) {
    if (patch.qaModel !== "" && !isImageModelId(patch.qaModel)) return { ok: false, error: "QA model id: lowercase letters, digits, dots, dashes, or empty to skip." };
    const r = await upsert(KEYS.qaModel, patch.qaModel);
    if (!r.ok) return r;
  }
  if (patch.regenPerTenant !== undefined) {
    if (positiveInt(patch.regenPerTenant) === null) return { ok: false, error: "Per-tenant cap must be a whole number." };
    const r = await upsert(KEYS.regen, patch.regenPerTenant);
    if (!r.ok) return r;
  }
  return { ok: true };
}

/** USD for one reply, from its usage block and the stored per-1M prices. Pure. */
export function imageCostFromUsage(usage: ImageUsage | null | undefined, prices: ImageTokenPrices): number {
  if (!usage) return 0;
  const textIn = usage.input_tokens_details?.text_tokens ?? usage.input_tokens ?? 0;
  const imageIn = usage.input_tokens_details?.image_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  return Math.round(((textIn * prices.textIn + imageIn * prices.imageIn + output * prices.output) / 1e6) * 1e5) / 1e5;
}

export interface ImageUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_tokens_details?: { text_tokens?: number; image_tokens?: number };
  output_tokens_details?: { image_tokens?: number; text_tokens?: number };
}
