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
 * the talent site renderer): the Demo pill and the talent site's own
 * language switch ("ES / EN"). Each code links to THIS page in that language
 * (`hrefs`, built in the talent's URL grammar); a `?locale=` link is the
 * fallback, which the talent host redirects to the prefixed URL.
 */
export function HeaderDemoPill({ show, locale }: { show: boolean | undefined; locale?: string }) {
  if (!show) return null;
  const es = (locale ?? "").toLowerCase().startsWith("es");
  const label = es ? "Demo" : "Demo";
  return (
    <span className="site-header__demo" title={label}>
      {label}
    </span>
  );
}

/** Group label for the language switch, in the page's language. */
const LANGUAGE_LABEL = { en: "Language", es: "Idioma" } as const;

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
  const label = locale.toLowerCase().startsWith("es") ? LANGUAGE_LABEL.es : LANGUAGE_LABEL.en;
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
