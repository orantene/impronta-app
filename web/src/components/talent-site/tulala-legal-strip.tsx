import type { ReactNode } from "react";
import Link from "next/link";

import { resolveMarketingOrigin } from "@/lib/brand/marketing-origin";
import { buildLegalStripModel, type LegalStripModel } from "@/lib/talent-site/legal-strip";
import type { SocketLanguage } from "@/lib/talent-site/footer-socket";

/**
 * TUL-889: the slim, non-removable Tulala legal strip (server component).
 *
 * Painted ONLY from the surrounding theme tokens (surface-raised, ink, line)
 * with a muted ink mixed via `color-mix`: no hex literals. 12.5px text, every
 * link 44px tall through padding, wraps to two lines at 390px.
 */
const STRIP_CSS = `
.tulala-legal{--tl-bg:var(--token-color-surface-raised,var(--token-color-background,Canvas));--tl-ink:var(--token-color-ink,CanvasText);--tl-line:var(--token-color-line,currentColor);--tl-muted:color-mix(in srgb,var(--tl-ink) 72%,var(--tl-bg));box-sizing:border-box;width:100%;background:var(--tl-bg);color:var(--tl-muted);border-top:1px solid var(--tl-line);font-family:var(--site-body-font,inherit);font-size:12.5px;line-height:1.3;padding:2px 12px}
.tulala-legal[data-clear-dock="true"]{padding-bottom:calc(2px + var(--floating-chrome-bottom,0px))}
body:has(.tulala-legal[data-clear-dock="true"]){padding-bottom:0}
.tulala-legal__row{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:0 2px;max-width:1200px;margin:0 auto}
.tulala-legal a{color:var(--tl-muted);text-decoration:none;display:inline-flex;align-items:center;min-height:44px;padding:0 8px}
.tulala-legal a:hover,.tulala-legal a:focus-visible{color:var(--tl-ink);text-decoration:underline;text-underline-offset:3px}
.tulala-legal a[aria-current="true"]{color:var(--tl-ink);font-weight:600}
.tulala-legal__credit{font-weight:600}
.tulala-legal__hint{margin:0 0 8px;text-align:center;font-size:12px}
body:has([data-guest-chat-launcher]) .tulala-legal__row{padding-right:64px}
`;

export function TulalaLegalStripView({
  model,
  clearDock = true,
  hint,
}: {
  model: LegalStripModel;
  clearDock?: boolean;
  hint?: string;
}): ReactNode {
  return (
    <div
      className="tulala-legal"
      data-tulala-legal-strip=""
      data-parity-key="socket"
      data-site-locale={model.locale}
      data-clear-dock={clearDock ? "true" : "false"}
      {...(hint ? { "data-socket-locked": "" } : {})}
    >
      <style dangerouslySetInnerHTML={{ __html: STRIP_CSS }} />
      <nav className="tulala-legal__row" aria-label={model.ariaLabel}>
        <Link className="tulala-legal__credit" href={model.credit.href} rel="noopener" data-legal-link="credit">
          {model.credit.label}
        </Link>
        {model.links.map((l) => (
          <Link key={l.key} href={l.href} rel="noopener" data-legal-link={l.key}>
            {l.label}
          </Link>
        ))}
        {model.languages.map((l) => (
          <Link
            key={l.locale}
            href={l.href}
            hrefLang={l.locale}
            lang={l.locale}
            aria-label={`${model.langLabel}: ${l.label}`}
            aria-current={l.current ? "true" : undefined}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      {hint ? <p className="tulala-legal__hint">{hint}</p> : null}
    </div>
  );
}

/** Server entry: resolves the env-correct marketing origin itself. */
export function TulalaLegalStrip({
  locale,
  profileCode,
  siteHost,
  languages,
  clearDock,
  hint,
  marketingOrigin,
}: {
  locale: string;
  profileCode?: string | null;
  siteHost?: string | null;
  languages?: readonly SocketLanguage[];
  clearDock?: boolean;
  hint?: string;
  /** Tests only; servers resolve `resolveMarketingOrigin()`. */
  marketingOrigin?: string;
}): ReactNode {
  const model = buildLegalStripModel({
    locale,
    marketingOrigin: marketingOrigin ?? resolveMarketingOrigin(),
    profileCode,
    siteHost,
    languages,
  });
  return <TulalaLegalStripView model={model} clearDock={clearDock} hint={hint} />;
}
