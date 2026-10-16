import { withLocaleHref } from "@/i18n/pathnames";

/**
 * TUL-614: the Terms / Privacy links in the signup checkbox follow the page
 * language (`/es/legal/terms`), on the site origin the checkbox always used.
 */
export function ageTermsLinks(siteUrl: string, locale: string): { terms: string; privacy: string } {
  const origin = siteUrl.replace(/\/+$/, "");
  return {
    terms: `${origin}${withLocaleHref("/legal/terms", locale)}`,
    privacy: `${origin}${withLocaleHref("/legal/privacy", locale)}`,
  };
}
