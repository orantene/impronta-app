/**
 * Statement footer — short editorial statement with optional credit / contact.
 * Shared closing band; Designs stamp via `statementFooterBlock`. No live data.
 */
import type { CSSProperties, ReactNode } from "react";

import { anchorIdAttrs } from "./anchor-id";
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

  return (
    <footer
      className="sb-statement-footer"
      data-builder-kind="statement_footer"
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
