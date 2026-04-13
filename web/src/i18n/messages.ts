import type { Locale } from "@/i18n/config";

import en from "../../messages/en.json";
import es from "../../messages/es.json";

const catalogs: Record<Locale, Record<string, unknown>> = {
  en: en as Record<string, unknown>,
  es: es as Record<string, unknown>,
};

export function getMessages(locale: Locale): Record<string, unknown> {
  return catalogs[locale] ?? catalogs.en;
}

/** Dot-path lookup; returns key if missing (TYPE A should keep keys in sync). */
export function createTranslator(locale: Locale) {
  const messages = getMessages(locale);
  return function t(key: string): string {
    const parts = key.split(".");
    let cur: unknown = messages;
    for (const p of parts) {
      if (cur && typeof cur === "object" && p in (cur as object)) {
        cur = (cur as Record<string, unknown>)[p];
      } else {
        return key;
      }
    }
    return typeof cur === "string" ? cur : key;
  };
}

/** String arrays in catalogs (e.g. hero typewriter examples). */
export function getMessageStringArray(locale: Locale, key: string): string[] {
  const parts = key.split(".");
  let cur: unknown = getMessages(locale);
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as object)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return [];
    }
  }
  if (!Array.isArray(cur)) return [];
  return cur.filter((x): x is string => typeof x === "string");
}
