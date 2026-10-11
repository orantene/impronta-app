import { languageToggleGroupLabel } from "@/i18n/language-toggle-label";
import type { HeaderItem } from "./schema";

/** How an item behaves on each breakpoint when the owner has not chosen (phone: brand stays, rest folds into the menu). */
export function headerItemMobileDefault(item: HeaderItem): "show" | "menu" {
  return item.type === "wordmark" || item.type === "logo" || item.type === "section_switcher" ? "show" : "menu";
}

/** `data-header-item` + per-breakpoint attrs. The section switcher is phone-only unless the owner says otherwise. */
export function headerItemAttrs(item: HeaderItem): Record<string, string> {
  const bp = item.responsive ?? {};
  const wide = item.type === "section_switcher" ? "hide" : "show";
  return {
    "data-header-item": item.type,
    "data-bp-desktop": bp.desktop ?? wide,
    "data-bp-tablet": bp.tablet ?? bp.desktop ?? wide,
    "data-bp-mobile": bp.mobile ?? headerItemMobileDefault(item),
  };
}

/**
 * Render-time site chrome for the freeform header (`siteChrome`, injected by
 * the talent site renderer): the talent site's own language switch
 * ("ES / EN"). Each code links to THIS page in that language (`hrefs`, built
 * in the talent's URL grammar); a `?locale=` link is the fallback, which the
 * talent host redirects to the prefixed URL. The demo marker is not header
 * chrome (TUL-560): it is the fixed corner badge, `MaxSiteDemoBadge`.
 */
export function HeaderSiteLocales({
  locales,
  hrefs,
  locale,
  attrs,
}: {
  locales: readonly string[];
  hrefs?: Readonly<Record<string, string>>;
  locale: string;
  attrs: Record<string, string | undefined>;
}) {
  if (locales.length < 2) return null;
  const label = languageToggleGroupLabel(locale);
  return (
    <div {...attrs} role="group" aria-label={label} className="site-header__ritem site-header__lang">
      {locales.map((code, i) => (
        <span key={code} className="site-header__lang-item">
          {i > 0 ? (
            <span className="site-header__lang-sep" aria-hidden>
              {" / "}
            </span>
          ) : null}
          <a
            className="site-header__lang-code"
            href={hrefs?.[code] ?? `?locale=${code}`}
            hrefLang={code}
            lang={code}
            data-active={code === locale ? "" : undefined}
            aria-current={code === locale ? "true" : undefined}
          >
            {code.toUpperCase()}
          </a>
        </span>
      ))}
    </div>
  );
}
