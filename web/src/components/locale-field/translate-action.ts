/**
 * The ONE seam between the locale-field UI and the AI translate action (PR 6,
 * `@/lib/server-actions/translate-talent-field`). The UI's field contexts are
 * the action's own field enum; `aiStateForCode` maps its error codes to the
 * badge states.
 */
export { translateTalentField } from "@/lib/server-actions/translate-talent-field";
export type {
  TranslateTalentFieldInput,
  TranslateTalentFieldResult,
  TranslateTalentFieldErrorCode,
} from "@/lib/server-actions/translate-talent-field";
export type { TalentTranslateField } from "@/lib/translation/talent-field-translate";

import type { TranslateTalentFieldErrorCode } from "@/lib/server-actions/translate-talent-field";

/** no_key / disabled → unavailable, quota / rate_limit → quota, invalid / error → error. */
export function aiStateForCode(code: TranslateTalentFieldErrorCode): "unavailable" | "quota" | "error" {
  if (code === "no_key" || code === "disabled") return "unavailable";
  if (code === "quota" || code === "rate_limit") return "quota";
  return "error";
}
