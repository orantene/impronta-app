import type { Locale } from "@/i18n/config";
import { detectLocaleHint, type LocaleHint } from "@/lib/translation-center/save/locale-hint";

export type LocaleConsistencyResult =
  | { ok: true }
  | {
      ok: false;
      code: "locale_mismatch";
      editedLocale: Locale;
      detected: LocaleHint;
      message: string;
    };

/**
 * Blocks silent wrong-locale saves when detection disagrees with editor intent.
 */
export function assertLocaleConsistency(
  text: string | null | undefined,
  editedLocale: Locale,
): LocaleConsistencyResult {
  const raw = (text ?? "").trim();
  if (raw.length < 12) return { ok: true };

  const detected = detectLocaleHint(raw);
  if (detected === "unknown" || detected === "mixed") return { ok: true };

  if (editedLocale === "en" && detected === "es") {
    return {
      ok: false,
      code: "locale_mismatch",
      editedLocale,
      detected,
      message:
        "This text looks like Spanish. Save it to the Spanish field instead, or confirm to keep it in English.",
    };
  }
  if (editedLocale === "es" && detected === "en") {
    return {
      ok: false,
      code: "locale_mismatch",
      editedLocale,
      detected,
      message:
        "This text looks like English. Save it to the English field instead, or confirm to keep it in Spanish.",
    };
  }
  return { ok: true };
}
