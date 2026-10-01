import type { ReactNode } from "react";

import type { SocketLink, SocketModel } from "@/lib/talent-site/footer-socket";

/**
 * Global Tulala footer socket: the shared bottom strip (server component).
 *
 * Styled ONLY from theme tokens (background, surface-raised, ink, line) plus a
 * muted ink derived with `color-mix`: `color.ink-muted` is not a real token,
 * and some designs set `color.muted` equal to the text colour. Text is always
 * ink or ink mixed into the strip surface, never on a design's dark band.
 * Phone: stacked. Desktop: one row.
 */

const STRIP_CSS = `
.tulala-socket{--ts-bg:var(--token-color-surface-raised,var(--token-color-background,Canvas));--ts-ink:var(--token-color-ink,CanvasText);--ts-line:var(--token-color-line,currentColor);--ts-muted:color-mix(in srgb,var(--ts-ink) 82%,var(--ts-bg));box-sizing:border-box;width:100%;background:var(--ts-bg);color:var(--ts-ink);border-top:1px solid var(--ts-line);font-family:var(--site-body-font,inherit);font-size:13px;line-height:1.4;padding:18px 18px 22px}
.tulala-socket[data-clear-dock="true"]{padding-bottom:132px}
.tulala-socket *{box-sizing:border-box}
.tulala-socket__inner{display:grid;gap:10px;max-width:1200px;margin:0 auto}
.tulala-socket nav{display:flex;flex-wrap:wrap;align-items:center;gap:0 4px}
.tulala-socket__label{font-size:10.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--ts-muted);margin-right:6px}
.tulala-socket a{color:var(--ts-ink);text-underline-offset:3px;display:inline-flex;align-items:center;min-height:32px;padding:0 6px}
.tulala-socket a[aria-current="true"]{font-weight:600;text-decoration:none}
.tulala-socket__credit{color:var(--ts-muted);font-size:12.5px;display:inline-flex;align-items:center;gap:4px;min-height:32px}
.tulala-socket__credit a{color:var(--ts-muted);padding:0 2px}
.tulala-socket__hint{margin:0;font-size:12px;color:var(--ts-muted)}
@media (min-width:768px){
.tulala-socket{padding:14px 48px 18px}
.tulala-socket[data-clear-dock="true"]{padding-bottom:132px}
.tulala-socket__inner{grid-auto-flow:column;justify-content:space-between;align-items:center;gap:8px 28px}
.tulala-socket__credit{margin-left:auto;text-align:right}
}
`;

function LinkGroup({ label, links }: { label: string; links: SocketLink[] }): ReactNode {
  return (
    <nav aria-label={label}>
      <span className="tulala-socket__label">{label}</span>
      {links.map((l) => (
        <a
          key={l.key}
          href={l.href}
          data-socket-link={l.key}
          {...(l.external ? { target: "_blank", rel: "noopener" } : {})}
        >
          {l.label}
        </a>
      ))}
    </nav>
  );
}

export function TalentSiteSocket({
  model,
  hint,
  clearDock = true,
}: {
  model: SocketModel;
  /** Builder canvas only: the "locked" hint under the strip. */
  hint?: string;
  /** Leave room for the fixed messages dock (published site only). */
  clearDock?: boolean;
}): ReactNode {
  return (
    <div
      className="tulala-socket"
      data-tulala-socket=""
      data-parity-key="socket"
      data-clear-dock={clearDock ? "true" : "false"}
      {...(hint ? { "data-socket-locked": "" } : {})}
    >
      <style dangerouslySetInnerHTML={{ __html: STRIP_CSS }} />
      <div className="tulala-socket__inner">
        {model.siteLinks.length > 0 ? (
          <LinkGroup label={model.siteGroupLabel} links={model.siteLinks} />
        ) : null}
        <LinkGroup label={model.tulalaGroupLabel} links={model.tulalaLinks} />
        {model.languages.length >= 2 ? (
          <nav aria-label={model.langGroupLabel} data-socket-languages="">
            <span className="tulala-socket__label">{model.langGroupLabel}</span>
            {model.languages.map((l) => (
              <a
                key={l.locale}
                href={l.href}
                hrefLang={l.locale}
                lang={l.locale}
                aria-current={l.current ? "true" : undefined}
              >
                {l.label}
              </a>
            ))}
          </nav>
        ) : null}
        {model.credit ? (
          <span className="tulala-socket__credit" data-socket-credit="">
            {model.credit.prefix}
            <a href={model.credit.href} target="_blank" rel="noopener">
              {model.credit.label}
            </a>
          </span>
        ) : null}
      </div>
      {hint ? <p className="tulala-socket__hint">{hint}</p> : null}
    </div>
  );
}
