import "server-only";

/**
 * stock-qa.server.ts — automated QA for generated stock (03 §4.2). Runs on
 * the bytes before they are filed; verdicts are stored on the row as
 * `qa_json` so a reviewer sees WHY a candidate was rejected and a later
 * checker version can re-run. Pass → `qa_passed`; any failure → `rejected`.
 *
 * Checks that need no model: aspect ratio against the slot, blank/flat frames,
 * near-duplicates by perceptual hash against the type's existing pool. The
 * vision checks (text/signage, logos, type mismatch, inappropriate content)
 * run only when a QA model is configured; otherwise they are recorded as
 * `skipped`, which is honest and leaves the human queue to catch them.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

import { resolveOpenAiApiKey } from "@/lib/ai/resolve-api-keys";
import type { StockRole } from "./platform-stock";

export const STOCK_QA_VERSION = "qa@v1";

export type QaVerdict = "pass" | "fail" | "skipped";

export interface StockQaResult {
  version: string;
  passed: boolean;
  /** Perceptual hash (dHash, 64 bits hex) for later duplicate checks. */
  phash: string;
  checks: Record<string, { verdict: QaVerdict; detail?: string }>;
}

const ASPECT: Readonly<Record<StockRole, { min: number; max: number }>> = {
  hero: { min: 1.3, max: 1.9 },
  wide: { min: 1.3, max: 3.4 },
  portrait: { min: 0.55, max: 0.85 },
  gallery: { min: 0.9, max: 1.12 },
  team: { min: 1.2, max: 1.9 },
  detail: { min: 0.9, max: 1.12 },
};

/** dHash: 9×8 grey, each bit = left pixel brighter than its right neighbour. */
export async function perceptualHash(bytes: Buffer): Promise<string> {
  const { data } = await sharp(bytes).greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  let bits = "";
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += data[y * 9 + x] > data[y * 9 + x + 1] ? "1" : "0";
  // 64 bits as 16 hex chars, nibble by nibble (no BigInt: the target predates ES2020).
  let hex = "";
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

export function hammingDistance(a: string, b: string): number {
  let n = 0;
  for (let i = 0; i < 16; i++) {
    let x = (parseInt(a[i] ?? "0", 16) ^ parseInt(b[i] ?? "0", 16)) & 0xf;
    while (x) {
      n += x & 1;
      x >>= 1;
    }
  }
  return n;
}

/** Two frames within this distance are the same picture for our purposes. */
export const DUPLICATE_DISTANCE = 6;

export interface StockQaInput {
  bytes: Buffer;
  role: StockRole;
  /** Hashes already in the pool for this type/family (from `qa_json.phash`). */
  existingHashes: ReadonlyArray<string>;
  /** Label the vision check asks about ("a nail salon"); null skips the type-match check. */
  typeLabel: string | null;
  /** Vision model id; null/empty = vision checks skipped. */
  visionModel?: string | null;
}

export async function runStockQa(input: StockQaInput): Promise<StockQaResult> {
  const checks: StockQaResult["checks"] = {};
  const meta = await sharp(input.bytes).metadata();
  const w = meta.width ?? 0, h = meta.height ?? 0;
  const ratio = h > 0 ? w / h : 0;
  const band = ASPECT[input.role];
  checks.aspect = ratio >= band.min && ratio <= band.max ? { verdict: "pass", detail: `${w}×${h}` } : { verdict: "fail", detail: `${w}×${h} (${ratio.toFixed(2)}) outside ${band.min}–${band.max} for ${input.role}` };

  const stats = await sharp(input.bytes).greyscale().stats();
  const stdev = stats.channels[0]?.stdev ?? 0;
  checks.not_blank = stdev >= 12 ? { verdict: "pass", detail: `stdev ${stdev.toFixed(1)}` } : { verdict: "fail", detail: `flat frame, stdev ${stdev.toFixed(1)}` };

  const phash = await perceptualHash(input.bytes);
  const nearest = input.existingHashes.reduce((best, hsh) => Math.min(best, hammingDistance(phash, hsh)), 64);
  checks.not_duplicate = nearest > DUPLICATE_DISTANCE ? { verdict: "pass", detail: `nearest ${nearest}` } : { verdict: "fail", detail: `near-duplicate of an existing frame (distance ${nearest})` };

  const vision = await visionChecks(input);
  Object.assign(checks, vision);

  const passed = Object.values(checks).every((c) => c.verdict !== "fail");
  return { version: STOCK_QA_VERSION, passed, phash, checks };
}

const VISION_KEYS = ["no_text", "no_logo", "appropriate", "type_match"] as const;

async function visionChecks(input: StockQaInput): Promise<StockQaResult["checks"]> {
  const skipped = Object.fromEntries(VISION_KEYS.map((k) => [k, { verdict: "skipped" as const, detail: "no QA model configured" }]));
  const model = input.visionModel?.trim();
  if (!model) return skipped;
  const key = (await resolveOpenAiApiKey())?.trim();
  if (!key) return skipped;
  try {
    const small = await sharp(input.bytes).resize({ width: 768, withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
    const question =
      `Answer with strict JSON {"text":bool,"logo":bool,"inappropriate":bool,"matches_type":bool|null}. ` +
      `text = any readable words, letters or signage visible. logo = any brand mark or recognisable brand. ` +
      `inappropriate = nudity, violence, minors, or anything unfit for a small-business website. ` +
      (input.typeLabel ? `matches_type = the scene plausibly belongs to ${input.typeLabel}.` : `matches_type = null.`);
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 60,
        messages: [{ role: "user", content: [{ type: "text", text: question }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${small.toString("base64")}`, detail: "low" } }] }],
      }),
    });
    if (!res.ok) return Object.fromEntries(VISION_KEYS.map((k) => [k, { verdict: "skipped" as const, detail: `vision HTTP ${res.status}` }]));
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content ?? "";
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return Object.fromEntries(VISION_KEYS.map((k) => [k, { verdict: "skipped" as const, detail: "unparseable vision reply" }]));
    const v = JSON.parse(m[0]) as { text?: boolean; logo?: boolean; inappropriate?: boolean; matches_type?: boolean | null };
    return {
      no_text: v.text ? { verdict: "fail", detail: "readable text or signage" } : { verdict: "pass" },
      no_logo: v.logo ? { verdict: "fail", detail: "brand mark" } : { verdict: "pass" },
      appropriate: v.inappropriate ? { verdict: "fail", detail: "flagged by vision" } : { verdict: "pass" },
      type_match: v.matches_type === null || v.matches_type === undefined ? { verdict: "skipped", detail: "no type label" } : v.matches_type ? { verdict: "pass" } : { verdict: "fail", detail: `does not read as ${input.typeLabel}` },
    };
  } catch (error) {
    return Object.fromEntries(VISION_KEYS.map((k) => [k, { verdict: "skipped" as const, detail: error instanceof Error ? error.message.slice(0, 80) : "vision error" }]));
  }
}

/** Hashes of the frames already filed for a type (or its family pack) so a new candidate can be checked for duplicates. */
export async function loadPoolHashes(admin: SupabaseClient, input: { family: string; businessType: string | null }): Promise<string[]> {
  let q = admin.from("platform_stock_images").select("qa_json").eq("family", input.family).in("approval", ["generated", "qa_passed", "approved"]).limit(500);
  q = input.businessType ? q.eq("business_type", input.businessType) : q.is("business_type", null);
  const { data, error } = await q;
  if (error || !data) return [];
  return (data as Array<{ qa_json: { phash?: unknown } | null }>).map((r) => r.qa_json?.phash).filter((h): h is string => typeof h === "string" && /^[0-9a-f]{16}$/.test(h));
}
