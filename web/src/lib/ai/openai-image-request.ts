/**
 * openai-image-request.ts — ONE place that knows which OpenAI image model we
 * call and how to shape the request body for it.
 *
 * WHY. Three callers (the builder's per-node "Generate image", the platform
 * stock library, the taxonomy promo-image generator) each hard-coded
 * `"dall-e-3"` and each sent `size` only for dall-e models. On 2026-09-17 the
 * Images API answered `The model 'dall-e-3' does not exist` — the account's
 * image models are the gpt-image family (gpt-image-1, -1-mini, -1.5, -2) —
 * so every generate button in the product was broken the same way in three
 * places. The default now lives here, the env override stays, and the body
 * builder is pure so it can be tested without an API key.
 *
 * gpt-image models accept `size` (1024x1024 · 1536x1024 · 1024x1536 · auto)
 * and `quality` (low · medium · high · auto) and return `b64_json`. dall-e
 * models (kept for an explicit env override) accept `size: "1024x1024"` and
 * `quality: "standard" | "hd"` — the builder maps our tiers onto those.
 */

export const DEFAULT_OPENAI_IMAGE_MODEL = "gpt-image-1.5";

export type OpenAiImageSize = "1024x1024" | "1536x1024" | "1024x1536";
export type OpenAiImageQuality = "low" | "medium" | "high";

/** The model in force: `OPENAI_IMAGE_MODEL` if set, else the default. */
export function resolveOpenAiImageModel(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return env.OPENAI_IMAGE_MODEL?.trim() || DEFAULT_OPENAI_IMAGE_MODEL;
}

export function isDallEModel(model: string): boolean {
  return model.startsWith("dall-e");
}

export interface OpenAiImageRequestInput {
  prompt: string;
  model?: string;
  size?: OpenAiImageSize;
  quality?: OpenAiImageQuality;
}

/**
 * Pure: the JSON body for POST /v1/images/generations.
 * - gpt-image: `size` + `quality` forwarded as-is (defaults 1024x1024 / high).
 * - dall-e: `size` forced to 1024x1024 (the only size all dall-e models share),
 *   quality mapped high→"hd", otherwise "standard".
 */
export function buildOpenAiImageRequestBody(input: OpenAiImageRequestInput): Record<string, unknown> {
  const model = input.model?.trim() || DEFAULT_OPENAI_IMAGE_MODEL;
  const size: OpenAiImageSize = input.size ?? "1024x1024";
  const quality: OpenAiImageQuality = input.quality ?? "high";
  const body: Record<string, unknown> = { model, prompt: input.prompt, n: 1 };
  if (isDallEModel(model)) {
    body.size = "1024x1024";
    body.quality = quality === "high" ? "hd" : "standard";
  } else {
    body.size = size;
    body.quality = quality;
  }
  return body;
}

/** Read the first image out of an Images API response, whichever form it took. */
export async function readOpenAiImageResponse(json: unknown): Promise<Buffer> {
  const first = (json as { data?: { url?: string; b64_json?: string }[] } | null)?.data?.[0];
  if (first?.b64_json) return Buffer.from(first.b64_json, "base64");
  if (first?.url) {
    const img = await fetch(first.url);
    if (!img.ok) throw new Error("Failed to download generated image from URL.");
    return Buffer.from(await img.arrayBuffer());
  }
  throw new Error("OpenAI returned no image in the response.");
}

/** POST the request and return the bytes. Throws with the API's message on a non-2xx. */
export async function requestOpenAiImageBytes(
  apiKey: string,
  input: OpenAiImageRequestInput,
): Promise<Buffer> {
  const body = buildOpenAiImageRequestBody({ ...input, model: input.model ?? resolveOpenAiImageModel() });
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t.slice(0, 280) || `OpenAI images HTTP ${res.status}`);
  }
  return readOpenAiImageResponse(await res.json());
}
