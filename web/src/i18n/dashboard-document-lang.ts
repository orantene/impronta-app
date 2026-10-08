import { getLocaleMetadata } from "./config";

/**
 * `<html lang>` value for a dashboard locale. Chrome offers "Translate from
 * English" whenever the document language disagrees with the body, so the shell
 * keeps the attribute equal to the language the dashboard actually rendered in.
 */
export function dashboardDocumentLang(locale: string | null | undefined): string | null {
  const code = locale?.trim();
  if (!code) return null;
  return getLocaleMetadata(code).hreflang;
}
