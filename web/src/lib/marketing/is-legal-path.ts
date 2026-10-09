/**
 * True for platform legal document paths (`/legal`, `/legal/terms`, …).
 * Used by the marketing shell to skip discovery/account IO so a cold open
 * from a talent-site footer never sits on a blank tab for tens of seconds
 * (TUL-516 H5).
 */
export function isMarketingLegalPath(pathnameWithoutLocale: string): boolean {
  const path = (pathnameWithoutLocale || "/").split("?")[0] || "/";
  return path === "/legal" || path.startsWith("/legal/");
}
