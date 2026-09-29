/**
 * The ONE seam between the locale-field UI and the AI translate action (PR 6).
 *
 * PR 6 ships `translateTalentField` in `@/lib/server-actions/translate-talent-field`.
 * Until that branch lands, this module answers every call with `disabled`, which
 * the badge renders as "AI translation is not available on this plan." When PR 6
 * merges, replace the stub below with:
 *
 *   export { translateTalentField } from "@/lib/server-actions/translate-talent-field";
 *
 * and delete the local types (import them from the action instead).
 */

export type TalentTranslateField =
  | "offering_title"
  | "offering_description"
  | "variant_label"
  | "addon_label"
  | "faq_question"
  | "faq_answer"
  | "page_title"
  | "seo_title"
  | "seo_description"
  | "bio"
  | "tagline"
  | "builder_text";

export type TranslateTalentFieldInput = {
  field: TalentTranslateField;
  from: string;
  to: string;
  text: string;
};

export type TranslateTalentFieldResult =
  | { ok: true; text: string; cached: boolean }
  | {
      ok: false;
      code: "no_key" | "disabled" | "quota" | "rate_limit" | "invalid" | "error";
      message: string;
    };

// STUB (PR 6 not merged yet): always unavailable. Swap per the header comment.
export async function translateTalentField(
  input: TranslateTalentFieldInput,
): Promise<TranslateTalentFieldResult> {
  void input;
  return { ok: false, code: "disabled", message: "AI translation is not available yet." };
}
