/**
 * Comp card — live-bound measure strip + optional full-details disclosure.
 * Shared widget; Designs stamp via `compCardBlock`. Hidden when empty.
 * Kept out of render.tsx to avoid growing the god file.
 */
import type { CSSProperties, ReactNode } from "react";

import { pickLocale } from "@/lib/i18n/pick-locale";

import { anchorIdAttrs } from "./anchor-id";
import { MAGAZINE_ROOT_VARS } from "./magazine-edition";
import {
  COMP_CARD_DEFAULT_PROPS,
  catalogSpecForKey,
  type CompCardLayout,
} from "./comp-card-defaults";
import type {
  TalentCompDetailGroup,
  TalentCompFieldRow,
  TalentCompMeasure,
} from "./comp-card-types";
import type { BuilderCompCardNode } from "./types";

/** ~1.6 KB token-only CSS (budget note: +1–2 KB headroom vs prior Folio PRs). */
export const COMP_CARD_CSS = `
.sb-comp{color:var(--token-color-ink);font:inherit;width:100%;min-width:0;box-sizing:border-box;padding:clamp(1.75rem,4vw,3rem) clamp(1.1rem,3vw,2rem)}
.sb-comp[data-comp-empty="1"]{display:none!important}
.sb-comp-inner{width:100%;max-width:68rem;margin:0 auto}
.sb-comp-header{margin-bottom:clamp(1rem,2.5vw,1.75rem)}
.sb-comp-eyebrow{margin:0 0 0.35rem;font-size:0.72rem;letter-spacing:0.16em;text-transform:uppercase;color:var(--token-color-muted)}
.sb-comp-title{margin:0;font-family:var(--token-typography-heading-font-family,var(--site-heading-font,Georgia,serif));font-size:clamp(1.45rem,3vw,2rem);font-weight:400;letter-spacing:-0.02em;line-height:1.15;color:var(--token-color-ink)}
.sb-comp-rail{margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(5.5rem,1fr));gap:clamp(0.85rem,2vw,1.5rem) clamp(0.65rem,1.5vw,1.25rem);border-top:1px solid var(--token-color-line);border-bottom:1px solid var(--token-color-line);padding-block:clamp(1.1rem,2.5vw,1.65rem)}
.sb-comp-cell{margin:0;min-width:0}
.sb-comp-cell dt{margin:0;font-size:0.68rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--token-color-muted);font-weight:500}
.sb-comp-cell dd{margin:0.35rem 0 0;font-family:var(--token-typography-heading-font-family,var(--site-heading-font,Georgia,serif));font-size:clamp(1.15rem,2.4vw,1.55rem);font-weight:400;line-height:1.1;letter-spacing:-0.02em;color:var(--token-color-ink);text-wrap:balance}
.sb-comp-cell dd small{margin-left:0.2em;font-size:0.55em;letter-spacing:0.08em;text-transform:uppercase;opacity:0.72;font-family:var(--token-typography-body-font-family,var(--site-body-font,system-ui,sans-serif))}
.sb-comp-cell[data-comp-text="1"] dd{font-size:clamp(0.95rem,1.8vw,1.2rem);letter-spacing:0}
.sb-comp-details{margin-top:clamp(1rem,2vw,1.5rem);border-top:1px solid var(--token-color-line)}
.sb-comp-details>summary{list-style:none;cursor:pointer;display:flex;align-items:baseline;justify-content:space-between;gap:1rem;padding:0.95rem 0;font-size:0.82rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--token-color-ink)}
.sb-comp-details>summary::-webkit-details-marker{display:none}
.sb-comp-details__count{color:var(--token-color-muted);letter-spacing:0.06em;text-transform:none;font-size:0.78rem}
.sb-comp-details__body{display:grid;gap:clamp(1.25rem,2.5vw,2rem);padding:0 0 clamp(1rem,2vw,1.5rem)}
.sb-comp-group{margin:0}
.sb-comp-group h3{margin:0 0 0.65rem;font-size:0.72rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--token-color-muted);font-weight:500}
.sb-comp-group dl{margin:0;padding:0;display:grid;gap:0.55rem 1.5rem;grid-template-columns:minmax(0,10rem) minmax(0,1fr)}
.sb-comp-group dl>div{display:contents}
.sb-comp-group dt{margin:0;font-size:0.85rem;color:var(--token-color-muted)}
.sb-comp-group dd{margin:0;font-size:0.95rem;color:var(--token-color-ink);text-wrap:pretty}
@media (max-width:540px){
  .sb-comp-rail{grid-template-columns:repeat(2,minmax(0,1fr))}
  .sb-comp-group dl{grid-template-columns:1fr}
}
`;

/** Magazine: inverted ink measure strip, large serif values over small caps labels. */
export const COMP_CARD_MAGAZINE_CSS = `
.sb-comp[data-edition="magazine"]{${MAGAZINE_ROOT_VARS};margin:52px 16px 0;width:auto;padding:18px;background:var(--sb-mag-ink);color:var(--sb-mag-bg)}
.sb-comp[data-edition="magazine"] .sb-comp-inner{max-width:none;display:grid;gap:14px}
.sb-comp[data-edition="magazine"] .sb-comp-header{margin:0}
.sb-comp[data-edition="magazine"] .sb-comp-eyebrow,.sb-comp[data-edition="magazine"] .sb-comp-title{margin:0;font:600 11px/1.2 var(--sb-mag-label);letter-spacing:.24em;text-transform:uppercase;color:inherit;opacity:.7}
.sb-comp[data-edition="magazine"] .sb-comp-rail{grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;border:0;padding:0}
.sb-comp[data-edition="magazine"] .sb-comp-cell{display:flex;flex-direction:column-reverse;justify-content:flex-end;border-top:1px solid color-mix(in srgb,var(--sb-mag-bg) 35%,transparent);padding-top:8px}
.sb-comp[data-edition="magazine"] .sb-comp-cell dt{font:600 9.5px/1.2 var(--sb-mag-label);letter-spacing:.16em;text-transform:uppercase;color:inherit;opacity:.7;margin-top:4px}
.sb-comp[data-edition="magazine"] .sb-comp-cell dd{margin:0;font:400 30px/1 var(--sb-mag-serif);letter-spacing:0;color:inherit}
.sb-comp[data-edition="magazine"] .sb-comp-cell dd small{font-family:var(--sb-mag-label);opacity:.7}
.sb-comp[data-edition="magazine"] .sb-comp-details{display:none!important}
.sb-comp[data-edition="magazine"] .sb-comp-cell dd small{font-family:var(--sb-mag-label);font-size:0.35em;opacity:.7;margin-left:0.15em}
.sb-comp[data-edition="magazine"] .sb-comp-cell dd{margin:0;font:400 30px/1 var(--sb-mag-serif);letter-spacing:0;color:inherit;display:flex;align-items:baseline;gap:0.15em;flex-wrap:wrap}
@media (min-width:900px){
  .sb-comp[data-edition="magazine"]{margin:90px 40px 0;padding:32px}
  .sb-comp[data-edition="magazine"] .sb-comp-inner{grid-template-columns:260px minmax(0,1fr);align-items:end}
  .sb-comp[data-edition="magazine"] .sb-comp-cell dd{font-size:54px}
}
@media (max-width:540px){.sb-comp[data-edition="magazine"] .sb-comp-rail{grid-template-columns:repeat(4,minmax(0,1fr))}}
`;

/** Split "169 cm" into value + unit so the unit can be set small. */
export function splitCompUnit(value: string): { v: string; u: string | null } {
  const m = value.trim().match(/^(\d+(?:[.,]\d+)?)\s*([a-zA-Z]{1,4})$/);
  return m ? { v: m[1]!, u: m[2]! } : { v: value, u: null };
}

export function resolveCompCardDisplay(args: {
  node: BuilderCompCardNode;
  rows: ReadonlyArray<TalentCompFieldRow>;
  locale?: string;
}): {
  strip: TalentCompMeasure[];
  details: TalentCompDetailGroup[];
  showStrip: boolean;
  empty: boolean;
} {
  const { node, rows } = args;
  const locale = args.locale ?? "en";
  const es = locale.toLowerCase().startsWith("es");
  const minMeasures = Math.max(
    0,
    Math.trunc(node.props.minMeasures ?? COMP_CARD_DEFAULT_PROPS.minMeasures ?? 4),
  );
  const layout = (node.props.layout ??
    COMP_CARD_DEFAULT_PROPS.layout ??
    "strip_with_details") as CompCardLayout;
  const wantDetails =
    layout === "strip_with_details" && node.props.showFullDetails !== false;

  const byKey = new Map(rows.map((r) => [r.fieldKey, r] as const));
  const measureSpecs =
    node.props.measures ?? COMP_CARD_DEFAULT_PROPS.measures ?? [];

  const strip: TalentCompMeasure[] = [];
  const taken = new Set<string>();
  /** Inspector-disabled keys stay off the whole card, not only the strip. */
  const suppressed = new Set<string>();
  for (const spec of measureSpecs) {
    if (spec.enabled === false) {
      suppressed.add(spec.fieldKey);
      continue;
    }
    const row = byKey.get(spec.fieldKey);
    if (!row) continue;
    const catalog = catalogSpecForKey(spec.fieldKey);
    const labelOverride = es
      ? (spec.labelEs ?? "").trim()
      : (spec.labelEn ?? "").trim();
    const label =
      labelOverride ||
      (catalog
        ? pickLocale(locale, { en: catalog.labelEn, es: catalog.labelEs })
        : row.label);
    const { v, u } = splitCompUnit(row.value);
    strip.push({
      fieldKey: row.fieldKey,
      label,
      value: v,
      unit: u ?? spec.unit ?? catalog?.unit ?? row.unit ?? null,
    });
    taken.add(row.fieldKey);
  }

  const showStrip = strip.length >= minMeasures && strip.length > 0;
  const detailRows = wantDetails
    ? rows.filter((r) => {
        if (suppressed.has(r.fieldKey)) return false;
        return showStrip ? !taken.has(r.fieldKey) : true;
      })
    : [];

  const order: string[] = [];
  const byGroup = new Map<string, TalentCompDetailGroup["rows"]>();
  for (const row of detailRows) {
    if (!byGroup.has(row.group)) {
      byGroup.set(row.group, []);
      order.push(row.group);
    }
    byGroup.get(row.group)!.push({
      fieldKey: row.fieldKey,
      label: row.label,
      value: row.value,
    });
  }
  const details = order.map((group) => ({
    group,
    rows: byGroup.get(group)!,
  }));

  const empty = strip.length === 0 && details.length === 0;
  return { strip, details, showStrip, empty };
}

export function renderCompCardBlock(args: {
  node: BuilderCompCardNode;
  rows: ReadonlyArray<TalentCompFieldRow>;
  locale?: string;
  styleAttr?: CSSProperties;
}): ReactNode {
  const { node, rows, styleAttr } = args;
  const locale = args.locale ?? "en";
  const p = node.props;
  const { strip, details, showStrip, empty } = resolveCompCardDisplay({
    node,
    rows,
    locale,
  });

  const detailCount = details.reduce((n, g) => n + g.rows.length, 0);
  const summary = pickLocale(locale, {
    en: (p.detailsSummaryEn ?? "").trim() || "Full comp card",
    es: (p.detailsSummaryEs ?? "").trim() || "Ficha completa",
  });
  const countLabel = pickLocale(locale, {
    en: `${detailCount} more details`,
    es: `${detailCount} datos más`,
  });
  const title = (p.title ?? "").trim();
  const eyebrow = (p.eyebrow ?? "").trim();

  return (
    <section
      className="sb-comp"
      data-builder-kind="comp_card"
      data-comp-empty={empty ? "1" : "0"}
      data-comp-strip={showStrip ? "1" : "0"}
      data-edition={p.edition === "magazine" ? "magazine" : undefined}
      style={styleAttr}
      hidden={empty || undefined}
      aria-hidden={empty || undefined}
      aria-label={title || "Comp card"}
      {...anchorIdAttrs(node)}
    >
      <style>{COMP_CARD_CSS}</style>
      {p.edition === "magazine" ? <style>{COMP_CARD_MAGAZINE_CSS}</style> : null}
      <div className="sb-comp-inner">
        {eyebrow || title ? (
          <header className="sb-comp-header">
            {eyebrow ? <p className="sb-comp-eyebrow">{eyebrow}</p> : null}
            {title ? <h2 className="sb-comp-title">{title}</h2> : null}
          </header>
        ) : null}
        {showStrip ? (
          <dl className="sb-comp-rail">
            {strip.map((m) => {
              let value = m.value;
              let unit = m.unit;
              // Magazine strip: avoid "MX 28.5 MX" when the stored value already
              // carries the unit prefix.
              if (p.edition === "magazine" && unit) {
                const re = new RegExp(`^${unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i");
                if (re.test(value)) {
                  value = value.replace(re, "").trim();
                }
              }
              if (p.edition === "magazine" && !unit && /^([A-Z]{1,3})\s+([\d.]+)$/.test(value)) {
                const m2 = value.match(/^([A-Z]{1,3})\s+([\d.]+)$/);
                if (m2) {
                  value = m2[2]!;
                  unit = m2[1]!;
                }
              }
              return (
              <div
                key={m.fieldKey}
                className="sb-comp-cell"
                data-comp-text={/^\d/.test(value) ? "0" : "1"}
              >
                <dt>{m.label}</dt>
                <dd>
                  {value}
                  {unit ? <small>{unit}</small> : null}
                </dd>
              </div>
              );
            })}
          </dl>
        ) : null}
        {detailCount > 0 ? (
          <details className="sb-comp-details">
            <summary>
              <span>{summary}</span>
              <span className="sb-comp-details__count">{countLabel}</span>
            </summary>
            <div className="sb-comp-details__body">
              {details.map((g) => (
                <section key={g.group} className="sb-comp-group">
                  <h3>{g.group}</h3>
                  <dl>
                    {g.rows.map((r) => (
                      <div key={r.fieldKey}>
                        <dt>{r.label}</dt>
                        <dd>{r.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </section>
  );
}
