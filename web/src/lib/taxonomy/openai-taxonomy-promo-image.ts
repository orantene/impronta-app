import "server-only";

import { resolveOpenAiApiKey } from "@/lib/ai/resolve-api-keys";
import { requestOpenAiImageBytes } from "@/lib/ai/openai-image-request";

/**
 * Calls OpenAI Images API and returns PNG (or model-native) bytes for upload to storage.
 * Uses conservative prompts (abstract / typographic mood — no real-person likeness).
 */
export async function fetchOpenAiTaxonomyPromoImageBytes(labelEn: string): Promise<Buffer> {
  const key = (await resolveOpenAiApiKey())?.trim();
  if (!key) {
    throw new Error("OpenAI API key is not configured.");
  }

  const prompt = [
    "Create a single square abstract editorial illustration for a talent-agency category card.",
    "Stylized shapes, soft lighting, luxury fashion-magazine mood. No text, no logos, no watermarks.",
    "No recognizable real person, face, or celebrity. No nudity.",
    `Category theme (interpret abstractly): "${labelEn}".`,
  ].join(" ");

  // Model default + body shape live in openai-image-request.ts.
  return requestOpenAiImageBytes(key, { prompt, size: "1024x1024", quality: "medium" });
}
