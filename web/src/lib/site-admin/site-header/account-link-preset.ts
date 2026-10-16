/**
 * TUL-695: "Mi cuenta" as a one-click link preset in the header navigation
 * editor. `/account` is served by every host this header renders on (the
 * marketing apex is the only host without it, see `accountHrefFor`).
 */
export const ACCOUNT_LINK_HREF = "/account";

export function accountLinkPreset(locale: "es" | "en"): { label: string; href: string } {
  return { label: locale === "es" ? "Mi cuenta" : "My account", href: ACCOUNT_LINK_HREF };
}

export function hasAccountLink(items: ReadonlyArray<{ href: string }>): boolean {
  return items.some((it) => {
    const path = it.href.split(/[?#]/)[0];
    return path === ACCOUNT_LINK_HREF;
  });
}
