import en from "../../messages/en.json";
import es from "../../messages/es.json";

const catalogs: Record<string, Record<string, unknown>> = {
  en: en as Record<string, unknown>,
  es: es as Record<string, unknown>,
};

export function getMessages(locale: string): Record<string, unknown> {
  return catalogs[locale] ?? catalogs.en;
}

/** Dot-path lookup; returns key if missing (TYPE A should keep keys in sync). */
export function createTranslator(locale: string) {
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
export function getMessageStringArray(locale: string, key: string): string[] {
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
