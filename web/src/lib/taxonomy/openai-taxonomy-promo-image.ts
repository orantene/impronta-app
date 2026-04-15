import "server-only";

import { resolveOpenAiApiKey } from "@/lib/ai/resolve-api-keys";

/**
 * Calls OpenAI Images API and returns PNG (or model-native) bytes for upload to storage.
 * Uses conservative prompts (abstract / typographic mood — no real-person likeness).
 */
export async function fetchOpenAiTaxonomyPromoImageBytes(labelEn: string): Promise<Buffer> {
  const key = (await resolveOpenAiApiKey())?.trim();
  if (!key) {
    throw new Error("OpenAI API key is not configured.");
  }

  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || "dall-e-3";
  const prompt = [
    "Create a single square abstract editorial illustration for a talent-agency category card.",
    "Stylized shapes, soft lighting, luxury fashion-magazine mood. No text, no logos, no watermarks.",
    "No recognizable real person, face, or celebrity. No nudity.",
    `Category theme (interpret abstractly): "${labelEn}".`,
  ].join(" ");

  const body: Record<string, unknown> = {
    model,
    prompt,
    n: 1,
  };

  if (model.startsWith("dall-e")) {
    body.size = "1024x1024";
  }

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(t.slice(0, 280) || `OpenAI images HTTP ${res.status}`);
  }

  const json = (await res.json()) as { data?: { url?: string; b64_json?: string }[] };
  const first = json.data?.[0];
  if (first?.b64_json) {
    return Buffer.from(first.b64_json, "base64");
  }
  if (first?.url) {
    const img = await fetch(first.url);
    if (!img.ok) throw new Error("Failed to download generated image from URL.");
    return Buffer.from(await img.arrayBuffer());
  }
  throw new Error("OpenAI returned no image in the response.");
}
