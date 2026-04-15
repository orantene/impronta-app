import type { Locale } from "@/i18n/config";

function isEmpty(s: string | null | undefined): boolean {
  return !s || !String(s).trim();
}

/**
 * Product rule: request locale first, then symmetric fallback (EN ↔ ES).
 */
export function pickLocalizedString(
  locale: Locale,
  enValue: string | null | undefined,
  esValue: string | null | undefined,
): string {
  const en = (enValue ?? "").trim();
  const es = (esValue ?? "").trim();
  if (locale === "es") {
    if (!isEmpty(es)) return es;
    return en;
  }
  if (!isEmpty(en)) return en;
  return es;
}
