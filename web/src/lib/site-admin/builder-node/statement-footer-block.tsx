/**
 * Statement footer — short editorial statement with optional credit / contact.
 * Shared closing band; Designs stamp via `statementFooterBlock`. No live data.
 */
import type { CSSProperties, ReactNode } from "react";

import { anchorIdAttrs } from "./anchor-id";
import { MAGAZINE_BUTTON_CSS, MAGAZINE_ROOT_VARS } from "./magazine-edition";
import {
  STATEMENT_FOOTER_DEFAULT_PROPS,
  type StatementFooterAlign,
} from "./statement-footer-defaults";
import type { BuilderStatementFooterNode } from "./types";

export const STATEMENT_FOOTER_CSS = `
.sb-statement-footer{width:100%;min-width:0;box-sizing:border-box;color:var(--token-color-ink);font:inherit}
.sb-statement-footer[data-sf-band="1"]{padding:clamp(2.5rem,6vw,4.5rem) clamp(1.1rem,4vw,3rem)}
.sb-statement-footer-inner{width:100%;max-width:40rem;margin:0 auto;display:flex;flex-direction:column;gap:clamp(0.85rem,2vw,1.35rem)}
.sb-statement-footer[data-sf-align="center"] .sb-statement-footer-inner{align-items:center;text-align:center}
.sb-statement-footer[data-sf-align="start"] .sb-statement-footer-inner{align-items:flex-start;text-align:start}
.sb-statement-footer-rule{width:min(4.5rem,30%);height:1px;background:var(--token-color-line);border:0;margin:0}
.sb-statement-footer-statement{margin:0;font-family:var(--token-typography-heading-font-family,var(--site-heading-font,Georgia,serif));font-size:clamp(1.35rem,3.2vw,2rem);font-weight:400;letter-spacing:-0.02em;line-height:1.25;text-wrap:balance;color:var(--token-color-ink);max-width:28ch}
.sb-statement-footer-meta{display:flex;flex-direction:column;gap:0.3rem;max-width:36rem}
.sb-statement-footer-credit{margin:0;font-size:0.78rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--token-color-muted)}
.sb-statement-footer-contact{margin:0;font-size:0.95rem;letter-spacing:0.01em;line-height:1.45;color:var(--token-color-ink);font-family:var(--token-typography-body-font-family,var(--site-body-font,system-ui,sans-serif));opacity:0.88}
`;

/** Magazine closing page: ink rule, giant serif line (last word italic), CTA. */
export const STATEMENT_FOOTER_MAGAZINE_CSS = `
.sb-statement-footer[data-edition="magazine"]{${MAGAZINE_ROOT_VARS};margin-top:52px;padding:30px 16px 120px;border-top:1px solid var(--sb-mag-ink);color:var(--sb-mag-ink)}
.sb-statement-footer[data-edition="magazine"] h2{margin:0;font:400 64px/.9 var(--sb-mag-serif);letter-spacing:-.01em;color:var(--sb-mag-ink);text-wrap:balance}
.sb-statement-footer[data-edition="magazine"] h2 em{font-style:italic}
.sb-statement-footer[data-edition="magazine"] .sb-mag-copy{margin:12px 0 16px;color:var(--sb-mag-mute);font:400 15px/1.5 var(--sb-mag-sans)}
.sb-statement-footer[data-edition="magazine"] .sb-mag-fine{margin-top:24px;display:flex;justify-content:space-between;gap:12px;font:600 10px/1.2 var(--sb-mag-label);letter-spacing:.16em;text-transform:uppercase;color:var(--sb-mag-mute)}
${MAGAZINE_BUTTON_CSS}
@media (min-width:900px){
  .sb-statement-footer[data-edition="magazine"]{margin:90px 40px 0;padding:40px 0 120px}
  .sb-statement-footer[data-edition="magazine"] h2{font-size:140px}
}
`;

/** Split "Next issue." so its last word renders italic, like a cover line. */
function splitLastWord(text: string): [string, string, string] {
  const m = text.match(/^(.*\s)(\S+?)([.!?]*)$/);
  return m ? [m[1]!, m[2]!, m[3]!] : ["", text, ""];
}

/** Fine-print host from a max-site URL or plain credit line. */
function formatMagazineCredit(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  try {
    const host = t.includes("://") ? new URL(t).hostname : t.replace(/^https?:\/\//, "").split("/")[0]!;
    return host.replace(/^www\./, "");
  } catch {
    return t;
  }
}

export function renderStatementFooterBlock(args: {
  node: BuilderStatementFooterNode;
  styleAttr?: CSSProperties;
}): ReactNode {
  const { node, styleAttr } = args;
  const p = node.props;
  const statement = (p.statement ?? STATEMENT_FOOTER_DEFAULT_PROPS.statement ?? "").trim();
  const creditLine = (p.creditLine ?? "").trim();
  const contactLine = (p.contactLine ?? "").trim();
  const align = (p.align ??
    STATEMENT_FOOTER_DEFAULT_PROPS.align ??
    "center") as StatementFooterAlign;
  const showRule = p.showRule !== false;

  if (!statement && !creditLine && !contactLine) return null;

  if (p.edition === "magazine") {
    const [head, last, tail] = splitLastWord(statement);
    const ctaLabel = (p.ctaLabel ?? "").trim();
    const ctaHref = (p.ctaHref ?? "").trim();
    return (
      <footer
        className="sb-statement-footer"
        data-builder-kind="statement_footer"
        data-builder-node-kind="statement_footer"
        data-builder-node-id={node.id}
        data-edition="magazine"
        aria-label={statement || "Statement"}
        style={styleAttr}
        {...anchorIdAttrs(node)}
      >
        <style>{STATEMENT_FOOTER_MAGAZINE_CSS}</style>
        {statement ? (
          <h2>
            {head}
            <em>{last}</em>
            {tail}
          </h2>
        ) : null}
        {contactLine ? <p className="sb-mag-copy">{contactLine}</p> : null}
        {ctaLabel && ctaHref ? (
          <a className="sb-mag-btn" href={ctaHref}>
            {ctaLabel}
          </a>
        ) : null}
        <div className="sb-mag-fine">
          <span>{formatMagazineCredit(creditLine)}</span>
        </div>
      </footer>
    );
  }

  return (
    <footer
      className="sb-statement-footer"
      data-builder-kind="statement_footer"
      data-builder-node-kind="statement_footer"
      data-builder-node-id={node.id}
      data-sf-align={align}
      data-sf-band="1"
      aria-label={statement || "Statement"}
      style={styleAttr}
      {...anchorIdAttrs(node)}
    >
      <style>{STATEMENT_FOOTER_CSS}</style>
      <div className="sb-statement-footer-inner">
        {showRule ? <hr className="sb-statement-footer-rule" aria-hidden /> : null}
        {statement ? <p className="sb-statement-footer-statement">{statement}</p> : null}
        {creditLine || contactLine ? (
          <div className="sb-statement-footer-meta">
            {creditLine ? <p className="sb-statement-footer-credit">{creditLine}</p> : null}
            {contactLine ? <p className="sb-statement-footer-contact">{contactLine}</p> : null}
          </div>
        ) : null}
      </div>
    </footer>
  );
}
