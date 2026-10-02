/**
 * Alert band (Gridline `.gl-emg`): hazard-tape stripe, the headline, a safety
 * note and an action. Shown ONLY while the talent's emergencies-today flag is
 * on (`liveStatus.emergenciesToday`, G3b), marked `data-live-when="on"` so the expiry island hides it at midnight; otherwise nothing renders, so
 * no emergency is ever promised from a stale cache or an authored default.
 * Token colours only.
 */
import type { CSSProperties, ReactNode } from "react";

import type { LiveStatusRenderContext } from "@/lib/talent/live-status-render";

import { anchorIdAttrs } from "./anchor-id";
import type { BuilderAlertBandNode } from "./types";

export const ALERT_BAND_CSS = `
.sb-ab{container:sbab/inline-size;margin:12px 12px 0;border-radius:var(--site-radius-md,8px);overflow:hidden;border:1.5px solid var(--token-color-ink);background:var(--token-color-surface-raised,var(--token-color-background));color:var(--token-color-ink);box-sizing:border-box}
.sb-ab-tape{height:8px;background:repeating-linear-gradient(-45deg,var(--token-color-accent,var(--token-color-primary)) 0 12px,var(--token-color-ink) 12px 24px)}
.sb-ab-in{padding:14px}
.sb-ab-title{margin:0;font-size:21px;font-weight:850;line-height:1}
.sb-ab-body{margin:6px 0 10px;font-size:13.5px;color:var(--token-color-muted)}
.sb-ab-safe{display:grid;grid-template-columns:22px 1fr;gap:8px;font-size:12.5px;background:var(--token-color-background);border-radius:8px;padding:9px 10px;margin-bottom:12px}
.sb-ab-safe svg{width:18px;height:18px}
.sb-ab-cta{display:flex;align-items:center;justify-content:center;width:100%;min-height:44px;border-radius:6px;background:var(--token-color-ink);color:var(--token-color-background);font-weight:700;text-decoration:none;box-sizing:border-box}
@container sbab (min-width:900px){
  .sb-ab{margin:24px 40px 0;display:grid;grid-template-columns:10px 1fr}
  .sb-ab-tape{height:auto}
  .sb-ab-in{display:grid;grid-template-columns:1.1fr 1fr auto;gap:22px;align-items:center;padding:16px 22px}
  .sb-ab-title{font-size:22px}
  .sb-ab-body,.sb-ab-safe{margin:0}
  .sb-ab-cta{width:auto;padding:0 20px}
}
`;

const WARN_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
  </svg>
);

export function renderAlertBandBlock(args: {
  node: BuilderAlertBandNode;
  liveStatus?: LiveStatusRenderContext;
  styleAttr?: CSSProperties;
}): ReactNode {
  if (args.liveStatus?.emergenciesToday !== true) return null;
  const { node, styleAttr } = args;
  const p = node.props;
  const title = (p.title ?? "").trim();
  if (!title) return null;
  const body = (p.body ?? "").trim();
  const note = (p.safetyNote ?? "").trim();
  const label = (p.safetyLabel ?? "").trim();
  const ctaLabel = (p.ctaLabel ?? "").trim();
  const ctaHref = (p.ctaHref ?? "").trim();
  return (
    <section
      className="sb-ab"
      data-builder-kind="alert_band"
      data-builder-node-kind="alert_band"
      data-builder-node-id={node.id}
      data-live-when="on"
      style={styleAttr}
      {...anchorIdAttrs(node)}
    >
      <style>{ALERT_BAND_CSS}</style>
      <div className="sb-ab-tape" aria-hidden="true" />
      <div className="sb-ab-in">
        <div>
          <h2 className="sb-ab-title">{title}</h2>
          {body ? <p className="sb-ab-body">{body}</p> : null}
        </div>
        {note ? (
          <div className="sb-ab-safe">
            {WARN_ICON}
            <span>
              {label ? <b>{label} </b> : null}
              {note}
            </span>
          </div>
        ) : null}
        {ctaLabel && ctaHref ? (
          <a className="sb-ab-cta" href={ctaHref}>
            {ctaLabel}
          </a>
        ) : null}
      </div>
    </section>
  );
}
