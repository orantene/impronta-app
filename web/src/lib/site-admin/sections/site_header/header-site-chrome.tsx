import { languageToggleGroupLabel } from "@/i18n/language-toggle-label";
import type { HeaderItem } from "./schema";
import { SiteDemoBadge } from "@/lib/talent-site/site-demo-badge";

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
 * Demo marker for talent sites (TUL-516 P1). Renders the fixed corner badge
 * (out of flow). Public max-site shells mount the same badge once from
 * `MaxSiteDemoPill`; this path covers builder canvas / previews that only
 * paint the header landmark.
 */
export function HeaderDemoPill({
  show,
  locale = "en",
}: {
  show: boolean | undefined;
  locale?: string;
}) {
  return show ? <SiteDemoBadge locale={locale} /> : null;
}

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
