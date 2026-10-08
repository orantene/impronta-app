import { createTranslator } from "@/i18n/messages";

/**
 * Guide copy that comes from the English help registry (`DRAWER_HELP`) resolved
 * through the `dashboard.adminHelp.*` catalog, the same keys the (i) help drawer
 * already uses. Without this the Guide tab showed English titles, summaries and
 * topic chips on a Spanish dashboard. Missing keys fall back to the English
 * registry copy, never to a raw dot-path.
 */
const NS = "dashboard.adminHelp";

function tOr(locale: string, key: string, fallback: string): string {
  const resolved = createTranslator(locale)(key);
  return resolved === key ? fallback : resolved;
}

export function guideTitle(nodeId: string, fallback: string, locale: string): string {
  return tOr(locale, `${NS}.drawerLabels.${nodeId}`, fallback);
}

export function guidePurpose(nodeId: string, fallback: string, locale: string): string {
  return tOr(locale, `${NS}.topics.${nodeId}.purpose`, fallback);
}

export function guideStep(nodeId: string, index: number, fallback: string, locale: string): string {
  return tOr(locale, `${NS}.topics.${nodeId}.b${index}`, fallback);
}

/** Same slug rule as the (i) help drawer: "Public site & domains" -> "publicSiteDomains". */
export function guideCategory(category: string, locale: string): string {
  const slug = category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map((word, i) => (i === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join("");
  return tOr(locale, `${NS}.categories.${slug}`, category);
}
