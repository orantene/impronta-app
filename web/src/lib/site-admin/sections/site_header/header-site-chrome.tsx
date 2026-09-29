/**
 * Render-time site chrome for the freeform header (`siteChrome`, injected by
 * the talent site renderer): the Demo pill and the talent site's own
 * language switch ("ES / EN", each code a `?locale=` link).
 */
export function HeaderDemoPill({ show }: { show: boolean | undefined }) {
  return show ? (
    <span className="site-header__demo" title="Demo">
      Demo
    </span>
  ) : null;
}

export function HeaderSiteLocales({
  locales,
  locale,
  attrs,
}: {
  locales: readonly string[];
  locale: string;
  attrs: Record<string, string | undefined>;
}) {
  return (
    <div {...attrs} className="site-header__ritem site-header__lang">
      {locales.map((code, i) => (
        <span key={code} className="site-header__lang-item">
          {i > 0 ? (
            <span className="site-header__lang-sep" aria-hidden>
              {" / "}
            </span>
          ) : null}
          <a
            className="site-header__lang-code"
            href={`?locale=${code}`}
            hrefLang={code}
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
