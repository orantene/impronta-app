import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * The Claude model the AI page-builder GENERATOR uses. Chosen by a super_admin
 * on /platform/admin/ai-providers and persisted in the `public.settings` KV
 * (key below) — no migration, no env var. `generate-nodes-action` reads it per
 * call and passes it to the Anthropic adapter (which drops the sampling params
 * these models reject).
 *
 * Only Claude models are offered: the generator is prompt-enforced-JSON +
 * validate, which the strongest Claude tiers do best. Opus is the quality
 * default; Sonnet is the cheaper option for high-volume tenants.
 */
export const GENERATION_MODEL_OPTIONS = [
  {
    id: "claude-opus-4-8",
    label: "Opus 4.8",
    hint: "Highest structural + copy quality. Best default.",
  },
  {
    id: "claude-sonnet-5",
    label: "Sonnet 5",
    hint: "Noticeably cheaper per page, still strong. For high volume.",
  },
] as const;

export type GenerationModelId = (typeof GENERATION_MODEL_OPTIONS)[number]["id"];

export const DEFAULT_GENERATION_MODEL: GenerationModelId = "claude-opus-4-8";

const SETTINGS_KEY = "ai_generation_model";

const VALID_MODELS: ReadonlySet<string> = new Set(
  GENERATION_MODEL_OPTIONS.map((o) => o.id),
);

export function isGenerationModelId(value: unknown): value is GenerationModelId {
  return typeof value === "string" && VALID_MODELS.has(value);
}

/**
 * The active generation model. Best-effort: any failure (no service role, no
 * row, unknown value) falls back to Opus, so a misconfigured setting can never
 * break generation.
 */
export async function resolveGenerationModel(): Promise<GenerationModelId> {
  try {
    const supabase = createServiceRoleClient();
    if (!supabase) return DEFAULT_GENERATION_MODEL;
    const { data } = await supabase
      .from("settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();
    const raw = data?.value;
    // Stored as a bare JSON string, or {"model": "..."} — accept both.
    const model =
      typeof raw === "string"
        ? raw
        : raw && typeof raw === "object" && "model" in raw
          ? (raw as { model?: unknown }).model
          : null;
    return isGenerationModelId(model) ? model : DEFAULT_GENERATION_MODEL;
  } catch {
    return DEFAULT_GENERATION_MODEL;
  }
}

export type SetGenerationModelResult = { ok: true } | { ok: false; error: string };

/** Persist the generation model (super_admin only — the CALLER enforces the gate). */
export async function setGenerationModel(
  model: string,
): Promise<SetGenerationModelResult> {
  if (!isGenerationModelId(model)) return { ok: false, error: "Unknown model." };
  const supabase = createServiceRoleClient();
  if (!supabase) return { ok: false, error: "Database is unavailable." };
  const { error } = await supabase
    .from("settings")
    .upsert(
      { key: SETTINGS_KEY, value: model, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) return { ok: false, error: "Couldn't save. Please try again." };
  return { ok: true };
}
