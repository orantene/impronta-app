/**
 * Visit block — live-bound service-area / language / hours facts.
 * Layouts: facts (list alone) · split (optional map beside facts).
 * Hidden when there are no real facts (never invents visit details).
 * Kept out of render.tsx to avoid growing the god file.
 */
import type { CSSProperties, ReactNode } from "react";

import type { TalentLocationPublic } from "@/lib/talent/location-settings";

import { renderLocationBlock } from "./location-block";
import { VISIT_DEFAULT_PROPS, type VisitLayout } from "./visit-defaults";
import type { TalentVisitFact, TalentVisitFactIcon } from "./visit-types";
import type { BuilderVisitNode } from "./types";

export const VISIT_CSS = `
.sb-visit{color:var(--token-color-ink);font:inherit;width:100%;min-width:0;box-sizing:border-box}
.sb-visit[data-visit-empty="1"]{display:none!important}
.sb-visit[data-visit-band="1"]{padding:clamp(2.5rem,5vw,4.5rem) clamp(1.1rem,3vw,2rem);background:var(--token-color-surface-raised,var(--token-color-background));border-radius:0}
.sb-visit-inner{width:100%;max-width:68rem;margin:0 auto}
.sb-visit-header{margin-bottom:clamp(1.5rem,3vw,2.75rem)}
.sb-visit-eyebrow{margin:0 0 0.4rem;font-size:0.72rem;letter-spacing:0.16em;text-transform:uppercase;color:var(--token-color-accent,var(--token-color-primary))}
.sb-visit-title{margin:0;font-family:var(--token-typography-heading-font-family,var(--site-heading-font,Georgia,serif));font-size:clamp(1.85rem,4vw,2.75rem);font-weight:400;letter-spacing:-0.02em;line-height:1.1;color:var(--token-color-ink)}
.sb-visit-title em{font-style:italic;font-weight:400;color:var(--token-color-ink)}
.sb-visit-grid{display:grid;gap:1.25rem;align-items:stretch}
.sb-visit[data-visit-layout="split"][data-visit-has-map="1"] .sb-visit-grid{grid-template-columns:1fr}
.sb-visit-map{position:relative;min-height:14rem;border-radius:var(--site-radius-lg,1rem);overflow:hidden;border:1px solid var(--token-color-line);background:color-mix(in oklab,var(--token-color-muted) 18%,var(--token-color-surface-raised,var(--token-color-background)))}
.sb-visit-map img{display:block;width:100%;height:100%;object-fit:cover;position:absolute;inset:0}
.sb-visit-map-chip{position:absolute;left:0.85rem;bottom:0.85rem;display:inline-flex;align-items:center;gap:0.4rem;padding:0.4rem 0.7rem;border-radius:999px;background:color-mix(in oklab,var(--token-color-background) 88%,transparent);color:var(--token-color-ink);font-size:0.75rem;font-weight:500;border:1px solid color-mix(in oklab,var(--token-color-ink) 12%,transparent)}
.sb-visit-facts{list-style:none;margin:0;padding:0;display:grid;gap:0.15rem}
.sb-visit-fact{display:grid;grid-template-columns:2.25rem 1fr;gap:0.85rem;align-items:start;padding:0.95rem 0;border-bottom:1px solid var(--token-color-line)}
.sb-visit-fact:last-child{border-bottom:0}
.sb-visit-fact-icon{display:inline-flex;height:2.25rem;width:2.25rem;align-items:center;justify-content:center;border-radius:999px;background:color-mix(in oklab,var(--token-color-accent,var(--token-color-primary)) 16%,var(--token-color-surface-raised,var(--token-color-background)));color:var(--token-color-primary,var(--token-color-ink));font-size:0.85rem;line-height:1}
.sb-visit-fact-label{margin:0;font-size:0.7rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--token-color-muted);font-weight:500}
.sb-visit-fact-value{margin:0.2rem 0 0;font-size:1.02rem;line-height:1.4;color:var(--token-color-ink);font-weight:500}
.sb-visit-fact-note{margin:3px 0 0;font-size:12.5px;line-height:1.4;color:var(--token-color-muted)}
@media (min-width:900px){
  .sb-visit[data-visit-layout="split"][data-visit-has-map="1"] .sb-visit-grid{grid-template-columns:minmax(0,1.05fr) minmax(0,0.95fr);gap:2rem}
  .sb-visit-map{min-height:18rem}
}
`;

function FactGlyph({ kind }: { kind: TalentVisitFactIcon }): ReactNode {
  // Simple typographic marks; no emoji, no hex.
  if (kind === "place") return "◉";
  if (kind === "travel") return "↗";
  if (kind === "languages") return "A";
  if (kind === "hours") return "◷";
  if (kind === "changes") return "↺";
  return "○";
}

function titleNodes(title: string, accent: string): ReactNode {
  const t = title.trim() || VISIT_DEFAULT_PROPS.title || "Your visit";
  const a = accent.trim();
  if (!a) return t;
  // "Your visit" + accent "visit" → Your {i}visit{/i}
  const idx = t.toLowerCase().lastIndexOf(a.toLowerCase());
  if (idx < 0) {
    return (
      <>
        {t} <em>{a}</em>
      </>
    );
  }
  return (
    <>
      {t.slice(0, idx)}
      <em>{t.slice(idx, idx + a.length)}</em>
      {t.slice(idx + a.length)}
    </>
  );
}

/**
 * Authored facts join the live ones: a fact with the same label as a live
 * fact replaces it in place (e.g. a fuller "Where"), the rest go before the
 * change window, which reads as the closing fact.
 */
export function mergeVisitFacts(
  live: ReadonlyArray<TalentVisitFact>,
  extra: ReadonlyArray<TalentVisitFact>,
): TalentVisitFact[] {
  const key = (s: string) => s.trim().toLowerCase();
  const byLabel = new Map(extra.map((f) => [key(f.label), f]));
  const merged = live.map((f) => {
    const own = byLabel.get(key(f.label));
    return own ? { ...own, icon: f.icon } : f;
  });
  const used = new Set(live.map((f) => key(f.label)));
  const rest = extra.filter((f) => !used.has(key(f.label)));
  const at = merged.findIndex((f) => f.icon === "changes");
  return at < 0 ? [...merged, ...rest] : [...merged.slice(0, at), ...rest, ...merged.slice(at)];
}

export function renderVisitBlock(args: {
  node: BuilderVisitNode;
  facts: ReadonlyArray<TalentVisitFact>;
  styleAttr?: CSSProperties;
  /** Public-safe location for the "location" layout (see location-block.tsx). */
  location?: TalentLocationPublic | null;
  locale?: string;
  /** Booking policy page of this host (the location layout's "Pagos, cambios..." link). */
  policyHref?: string;
}): ReactNode {
  const { node, facts, styleAttr } = args;
  const p = node.props;
  const layout = (p.layout ?? VISIT_DEFAULT_PROPS.layout ?? "facts") as VisitLayout;
  if (layout === "location") {
    return renderLocationBlock({ node, location: args.location, facts, locale: args.locale, styleAttr, policyHref: args.policyHref });
  }
  const band = p.band !== false;
  const showMap = p.showMap !== false;
  const mapUrl = (p.mapImageUrl ?? "").trim();
  const mapCaption = (p.mapCaption ?? "").trim();
  const hasMap = layout === "split" && showMap && Boolean(mapUrl);
  const extra = (p.extraFacts ?? [])
    .filter((f) => f.label.trim() && f.value.trim())
    .map((f): TalentVisitFact => ({ label: f.label, value: f.value, note: f.note, icon: "note" }));
  const allFacts = mergeVisitFacts(facts, extra);
  const empty = allFacts.length === 0;

  return (
    <section
      className="sb-visit"
      data-builder-kind="visit"
      data-builder-node-kind="visit"
      data-visit-layout={layout}
      data-visit-band={band ? "1" : "0"}
      data-visit-has-map={hasMap ? "1" : "0"}
      data-visit-empty={empty ? "1" : "0"}
      style={styleAttr}
      hidden={empty || undefined}
      aria-hidden={empty || undefined}
    >
      <style>{VISIT_CSS}</style>
      <div className="sb-visit-inner">
        <header className="sb-visit-header">
          {(p.eyebrow ?? "").trim() ? (
            <p className="sb-visit-eyebrow">{p.eyebrow}</p>
          ) : null}
          <h2 className="sb-visit-title">
            {titleNodes(p.title ?? "Your visit", p.titleAccent ?? "visit")}
          </h2>
        </header>
        <div className="sb-visit-grid">
          {hasMap ? (
            <figure className="sb-visit-map">
              {/* eslint-disable-next-line @next/next/no-img-element -- authored map URL, not Next Image CDN */}
              <img src={mapUrl} alt={mapCaption || "Service area"} />
              {mapCaption ? (
                <span className="sb-visit-map-chip">{mapCaption}</span>
              ) : null}
            </figure>
          ) : null}
          <ul className="sb-visit-facts">
            {allFacts.map((f) => (
              <li key={`${f.label}:${f.value}`} className="sb-visit-fact">
                <span className="sb-visit-fact-icon" aria-hidden>
                  <FactGlyph kind={f.icon} />
                </span>
                <div>
                  <p className="sb-visit-fact-label">{f.label}</p>
                  <p className="sb-visit-fact-value">{f.value}</p>
                  {f.note ? <p className="sb-visit-fact-note">{f.note}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
