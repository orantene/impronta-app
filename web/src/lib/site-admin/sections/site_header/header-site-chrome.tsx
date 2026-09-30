/**
 * Render-time site chrome for the freeform header (`siteChrome`, injected by
 * the talent site renderer): the Demo pill and the talent site's own
 * language switch ("ES / EN"). Each code links to THIS page in that language
 * (`hrefs`, built in the talent's URL grammar); a `?locale=` link is the
 * fallback, which the talent host redirects to the prefixed URL.
 */
export function HeaderDemoPill({ show }: { show: boolean | undefined }) {
  return show ? (
    <span className="site-header__demo" title="Demo">
      Demo
    </span>
  ) : null;
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
