/**
 * TUL-15: the service name shown under a portfolio photo that has no caption of its own
 * ("Extensiones clásicas" on Jorgelina's English page, whose service HAS an English title).
 * The loader used to read only the plain `title` (the primary language) and ignore `title_i18n`.
 * Walks the visitor's language, then the page's primary language, then the plain title (which is the
 * primary-language text). It never falls through to English for a Spanish visitor.
 *
 * Pure (no IO).
 */
import { offeringText } from "@/lib/talent/offerings-types";

function key(locale: string | null | undefined): string {
  return (locale ?? "").trim().toLowerCase().slice(0, 2);
}

export function resolveLinkedOfferingTitle(
  row: { title: string; title_i18n?: unknown },
  locale: string | null | undefined,
  primaryLocale: string | null | undefined,
): string {
  const visitor = key(locale);
  const primary = key(primaryLocale);
  if (!visitor) return row.title;
  const chain = primary ? [primary] : [];
  return (
    offeringText(
      { title: row.title, description: null, title_i18n: row.title_i18n as never, description_i18n: null },
      "title",
      visitor,
      chain,
    ) ?? row.title
  );
}
