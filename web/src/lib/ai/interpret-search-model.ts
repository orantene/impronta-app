import { formatInterpretCatalogForPrompt } from "@/lib/ai/interpret-search-catalog";
import type { InterpretCatalogTerm } from "@/lib/ai/interpret-search-catalog";
import { resolveAiChatAdapter } from "@/lib/ai/resolve-provider";
import type { RawModelIntent } from "@/lib/ai/validate-interpret-intent";
import { improntaLog } from "@/lib/server/structured-log";

export const INTERPRET_SEARCH_JSON_SCHEMA = {
  name: "interpret_directory_intent",
  strict: true,
  schema: {
    type: "object",
    properties: {
      normalized_summary: { type: "string" },
      taxonomy_term_ids: {
        type: "array",
        items: { type: "string" },
      },
      talent_roles: { type: "array", items: { type: "string" } },
      industries: { type: "array", items: { type: "string" } },
      event_types: { type: "array", items: { type: "string" } },
      skills: { type: "array", items: { type: "string" } },
      fit_labels: { type: "array", items: { type: "string" } },
      languages: { type: "array", items: { type: "string" } },
      location_slug: { type: "string" },
      free_text_fallback: { type: "string" },
      gender_preference: { type: "string" },
      /** 0 = not set; else cm within directory band */
      height_min_cm: { type: "integer" },
      height_max_cm: { type: "integer" },
      confidence: {
        type: "object",
        properties: {
          roles: { type: "number" },
          location: { type: "number" },
          industries: { type: "number" },
        },
        required: ["roles", "location", "industries"],
        additionalProperties: false,
      },
      needs_clarification: { type: "boolean" },
    },
    required: [
      "normalized_summary",
      "taxonomy_term_ids",
      "talent_roles",
      "industries",
      "event_types",
      "skills",
      "fit_labels",
      "languages",
      "location_slug",
      "free_text_fallback",
      "gender_preference",
      "height_min_cm",
      "height_max_cm",
      "confidence",
      "needs_clarification",
    ],
    additionalProperties: false,
  },
} as const;

function extractJsonPayload(content: string): string {
  const t = content.trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i.exec(t);
  if (fence) return fence[1]!.trim();
  return t;
}

function narrowChatFailureCode(c: string): InterpretSearchModelFailureCode {
  if (c === "no_key" || c === "empty_response" || c === "quota" || c === "api_error") {
    return c;
  }
  return "api_error";
}

function parseModelJson(content: string): RawModelIntent | null {
  try {
    const parsed = JSON.parse(extractJsonPayload(content)) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as RawModelIntent;
  } catch {
    return null;
  }
}

export type InterpretSearchModelFailureCode =
  | "no_key"
  | "empty_response"
  | "quota"
  | "api_error"
  | "invalid_json"
  | "model_exception";

export type InterpretSearchModelResult =
  | { ok: true; intent: RawModelIntent }
  | { ok: false; code: InterpretSearchModelFailureCode; message: string };

export async function runInterpretSearchModel(args: {
  userQuery: string;
  terms: InterpretCatalogTerm[];
  locationSlugs: string[];
  locale: "en" | "es";
}): Promise<InterpretSearchModelResult> {
  const { taxonomyBlock, locationBlock, truncated } = formatInterpretCatalogForPrompt({
    terms: args.terms,
    locationSlugs: args.locationSlugs,
    locale: args.locale,
  });

  const langNote =
    args.locale === "es"
      ? "The user may write in Spanish; match taxonomy UUIDs using Spanish labels in TAXONOMY when present (fourth column).\n"
      : "";

  const systemPrompt = `You map natural-language talent directory searches into structured intent for a modeling agency.

Rules:
- Output only JSON matching the schema. No markdown.
- taxonomy_term_ids: UUIDs from TAXONOMY lines only. Pick terms that match roles, types, industries, skills, fit labels, languages, etc. Use [] if none.
- location_slug: must be an exact city_slug from LOCATIONS, or "" if none.
- free_text_fallback: extra keywords for text search (names, brands, vibes). May be "" if redundant.
- normalized_summary: one short sentence summarizing the search for UI (max ~160 chars); use the user's language when obvious.
- talent_roles, industries, event_types, skills, fit_labels, languages: short phrases (labels), not UUIDs; may be empty.
- gender_preference: "" or a short phrase if clearly stated.
- height_min_cm / height_max_cm: use 0 when height is not clear from the query. If you infer one height in cm, set both to 0 and rely on free text unless you output a tight min/max band in cm (140–220).
- confidence: 0–1 estimates for roles, location, industries.
- needs_clarification: true if the query is too vague to apply filters safely.
- Prefer fewer, stronger taxonomy UUIDs over many weak ones when unsure.

${langNote}TAXONOMY lines: id|kind|english_name or id|kind|english_name|spanish_name
LOCATIONS: one city_slug per line.
${truncated ? "Lists may be truncated — only use ids/slugs that appear below.\n" : ""}

TAXONOMY:
${taxonomyBlock}

LOCATIONS:
${locationBlock}`;

  try {
    const adapter = await resolveAiChatAdapter();
    const result = await adapter.chatCompletion({
      systemPrompt,
      userMessage: args.userQuery,
      temperature: 0.1,
      jsonSchema: {
        name: INTERPRET_SEARCH_JSON_SCHEMA.name,
        strict: INTERPRET_SEARCH_JSON_SCHEMA.strict,
        schema: INTERPRET_SEARCH_JSON_SCHEMA.schema as unknown as Record<string, unknown>,
      },
    });

    if (!result.ok) {
      const code = narrowChatFailureCode(result.code);
      void improntaLog("interpret_search_chat_failed", {
        code,
        provider: adapter.id,
        message: result.message.slice(0, 240),
      });
      return { ok: false, code, message: result.message };
    }

    const intent = parseModelJson(result.text);
    if (!intent) {
      void improntaLog("interpret_search_invalid_json", {
        provider: adapter.id,
        textLen: result.text.length,
      });
      return {
        ok: false,
        code: "invalid_json",
        message: "Model returned text that could not be parsed as JSON.",
      };
    }

    return { ok: true, intent };
  } catch (e: unknown) {
    const msg =
      e instanceof Error && e.message.trim() ? e.message.trim() : "Unexpected model error.";
    void improntaLog("interpret_search_model_exception", { message: msg.slice(0, 240) });
    return { ok: false, code: "model_exception", message: msg };
  }
}
