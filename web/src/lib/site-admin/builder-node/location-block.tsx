/**
 * Location section (`visit` layout "location", the Ubicacion section).
 *
 * What it shows: the studio kind, the "where" zone (neighbourhood + city),
 * rows (hours link, address line, arrival note and photo), actions (Como
 * llegar only for a public address, otherwise a zone search, plus Escribir) and
 * a map area that is a TOKEN-COLOURED ZONE PLACEHOLDER generated from the zone
 * text. No fictional data: with no zone the whole section hides.
 *
 * PRIVACY. The only address input is `TalentLocationPublic`, which carries
 * `exactAddress` solely when the talent chose "Public address". This module
 * never reads anything else, so in every other mode there is nothing to leak
 * into markup, links or the (future) map embed.
 *
 * LIVE MAP. The consented live map is a later task. This file leaves a clean
 * slot (`[data-location-map-slot]`) and a "Ver mapa" button that is rendered
 * only when `LOCATION_LIVE_MAP_ENABLED` is on; until consent tooling exists
 * the flag is off and the button does not exist.
 */
import type { CSSProperties, ReactNode } from "react";

import { TALENT_ASK_HREF } from "@/lib/talent-site/contact-channels";
import {
  STUDIO_KIND_LABELS,
  directionsHref,
  zoneLabel,
  zoneSearchHref,
  type StudioKind,
  type TalentLocationPublic,
} from "@/lib/talent/location-settings";

import type { TalentVisitFact } from "./visit-types";
import type { BuilderVisitNode } from "./types";

/** Off until consent tooling (first-party consent store + cookie page) exists. */
export const LOCATION_LIVE_MAP_ENABLED = false;

export const LOCATION_CSS = `
.sb-loc{color:var(--token-color-ink);font:inherit;width:100%;min-width:0;box-sizing:border-box}
.sb-loc[data-visit-empty="1"]{display:none!important}
.sb-loc[data-visit-band="1"]{padding:clamp(2.5rem,5vw,4.5rem) clamp(1.1rem,3vw,2rem);background:var(--token-color-surface-raised,var(--token-color-background))}
.sb-loc-inner{width:100%;max-width:68rem;margin:0 auto}
.sb-loc-header{margin-bottom:clamp(1.25rem,3vw,2.25rem)}
.sb-loc-eyebrow{margin:0 0 .4rem;font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;color:var(--token-color-ink)}
.sb-loc-title{margin:0;font-family:var(--token-typography-heading-font-family,var(--site-heading-font,Georgia,serif));font-size:clamp(1.85rem,4vw,2.75rem);font-weight:400;letter-spacing:-.02em;line-height:1.1;color:var(--token-color-ink)}
.sb-loc-title em{font-style:italic;font-weight:400}
.sb-loc-grid{display:grid;gap:1.25rem;align-items:stretch}
.sb-loc-map{position:relative;margin:0;border-radius:var(--site-radius-lg,1rem);overflow:hidden;border:1px solid var(--token-color-line);background:color-mix(in oklab,var(--token-color-accent,var(--token-color-primary)) 8%,var(--token-color-surface-raised,var(--token-color-background)));aspect-ratio:16/10}
.sb-loc[data-map-size="sm"] .sb-loc-map{aspect-ratio:16/8}
.sb-loc[data-map-size="lg"] .sb-loc-map{aspect-ratio:4/3}
.sb-loc-map svg{display:block;width:100%;height:100%}
.sb-loc-map-tag{position:absolute;left:.85rem;bottom:.85rem;max-width:62%;padding:.4rem .7rem;border-radius:999px;background:color-mix(in oklab,var(--token-color-background) 90%,transparent);color:var(--token-color-ink);font-size:.75rem;font-weight:500;border:1px solid var(--token-color-line);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-loc-map-slot{position:absolute;inset:0}
.sb-loc-map-slot:empty{display:none}
.sb-loc-map-open{position:absolute;right:.85rem;bottom:.85rem;min-height:2.25rem;padding:.4rem .9rem;border-radius:999px;border:1px solid var(--token-color-line);background:var(--token-color-surface-raised,var(--token-color-background));color:var(--token-color-ink);font:inherit;font-size:.8rem;font-weight:500;cursor:pointer}
.sb-loc-card{display:flex;flex-direction:column;gap:1rem;padding:clamp(1.1rem,2.5vw,1.75rem);border-radius:var(--site-radius-lg,1rem);border:1px solid var(--token-color-line);background:var(--token-color-surface-raised,var(--token-color-background))}
.sb-loc[data-visit-band="1"] .sb-loc-card{background:var(--token-color-background)}
.sb-loc-kind{margin:0;font-size:.7rem;letter-spacing:.14em;text-transform:uppercase;color:var(--token-color-muted);font-weight:500}
.sb-loc-where{margin:0;font-family:var(--token-typography-heading-font-family,var(--site-heading-font,Georgia,serif));font-style:italic;font-weight:400;font-size:1.5rem;line-height:1.2;letter-spacing:-.01em;color:var(--token-color-ink)}
.sb-loc-rows{list-style:none;margin:0;padding:0;display:grid}
.sb-loc-row{display:grid;grid-template-columns:2.25rem 1fr;gap:.85rem;align-items:start;padding:.85rem 0;border-top:1px solid var(--token-color-line)}
.sb-loc-row:first-child{border-top:0}
.sb-loc-row-icon{display:inline-flex;height:2.25rem;width:2.25rem;align-items:center;justify-content:center;border-radius:999px;background:var(--token-color-blush,color-mix(in oklab,var(--token-color-accent,var(--token-color-primary)) 14%,var(--token-color-surface-raised,var(--token-color-background))));color:var(--token-color-ink);font-size:.85rem;line-height:1}
.sb-loc-row-label{margin:0;font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;color:var(--token-color-muted);font-weight:500}
.sb-loc-row-value{margin:.2rem 0 0;font-size:1rem;line-height:1.4;color:var(--token-color-ink);font-weight:500}
.sb-loc-row-note{margin:3px 0 0;font-size:.8rem;line-height:1.4;color:var(--token-color-muted)}
.sb-loc-row-link{display:inline-block;margin-top:.3rem;font-size:.85rem;color:var(--token-color-ink);text-decoration:underline;text-underline-offset:3px}
.sb-loc-photo{display:block;margin-top:.6rem;width:100%;max-width:16rem;aspect-ratio:4/3;object-fit:cover;border-radius:var(--site-radius-md,.75rem);border:1px solid var(--token-color-line)}
.sb-loc-actions{display:flex;flex-wrap:wrap;gap:.6rem;margin-top:.25rem}
.sb-loc-action{display:inline-flex;align-items:center;justify-content:center;min-height:2.75rem;padding:.55rem 1.1rem;border-radius:999px;font-size:.9rem;font-weight:500;text-decoration:none;border:1px solid var(--token-color-line);color:var(--token-color-ink);background:transparent}
.sb-loc-action[data-primary="1"]{background:var(--token-color-primary,var(--token-color-ink));border-color:var(--token-color-primary,var(--token-color-ink));color:var(--token-color-primary-on,var(--token-color-background))}
@media (min-width:900px){
  .sb-loc-grid{grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:2.5rem}
  .sb-loc[data-map-side="right"] .sb-loc-map{order:2}
  .sb-loc-where{font-size:1.875rem}
}
`;

/* ---------- zone placeholder map (generated, never geographic) ---------- */

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seeded(seed: number): () => number {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Abstract street grid and an approximate-area ring, derived only from the
 * zone text so two different zones look different and the same zone is stable.
 * Colours are token vars. A pin is drawn only for a public address.
 */
export function ZonePlaceholderMap({ zone, pin, label }: { zone: string; pin: boolean; label: string }): ReactNode {
  const rnd = seeded(hash32(zone.toLowerCase()));
  const cx = n1(150 + rnd() * 100);
  const cy = n1(85 + rnd() * 80);
  const r = n1(44 + rnd() * 26);
  const road = (w: number) => {
    const y0 = n1(20 + rnd() * 210);
    const y1 = n1(20 + rnd() * 210);
    const bend = n1(130 + rnd() * 140);
    return { w, d: `M-10 ${y0} C ${bend} ${n1(y0 + (rnd() - 0.5) * 120)}, ${n1(bend + 80)} ${n1(y1 + (rnd() - 0.5) * 120)}, 410 ${y1}` };
  };
  const roads = [road(7), road(4), road(4)];
  const cross = [0, 1].map(() => {
    const x0 = n1(40 + rnd() * 320);
    return `M${x0} -10 L ${n1(x0 + (rnd() - 0.5) * 140)} 260`;
  });
  const parkX = n1(20 + rnd() * 260);
  const parkY = n1(20 + rnd() * 150);
  const accent = "var(--token-color-accent,var(--token-color-primary))";
  const surface = "var(--token-color-surface-raised,var(--token-color-background))";
  return (
    <svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" role="img" aria-label={label} focusable="false">
      <rect width="400" height="250" style={{ fill: `color-mix(in oklab, ${accent} 7%, ${surface})` }} />
      <rect
        x={parkX}
        y={parkY}
        width="96"
        height="62"
        rx="14"
        style={{ fill: `color-mix(in oklab, var(--token-color-success,${accent}) 16%, ${surface})` }}
      />
      {cross.map((d) => (
        <path key={d} d={d} fill="none" strokeWidth="3" strokeLinecap="round" style={{ stroke: "var(--token-color-line)" }} />
      ))}
      {roads.map((rd) => (
        <path key={rd.d} d={rd.d} fill="none" strokeWidth={rd.w} strokeLinecap="round" style={{ stroke: "var(--token-color-line)" }} />
      ))}
      {pin ? (
        <g>
          <circle cx={cx} cy={cy} r="11" style={{ fill: "var(--token-color-primary,var(--token-color-ink))" }} />
          <circle cx={cx} cy={cy} r="4" style={{ fill: "var(--token-color-primary-on,var(--token-color-background))" }} />
        </g>
      ) : (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          strokeWidth="2"
          strokeDasharray="7 6"
          style={{ fill: `color-mix(in oklab, ${accent} 14%, transparent)`, stroke: accent }}
        />
      )}
    </svg>
  );
}

/* ---------- copy ---------- */

function sectionTitle(kind: StudioKind, es: boolean): string {
  if (kind === "home_visits") return es ? "Voy a donde estés" : "I come to you";
  if (kind === "both") return es ? "Dónde trabajo" : "Where I work";
  return es ? "Dónde encontrarme" : "Where to find me";
}

function kindLabel(kind: StudioKind, es: boolean): string {
  if (!es) return STUDIO_KIND_LABELS[kind];
  if (kind === "home_visits") return "Visitas a domicilio";
  if (kind === "both") return "Estudio y visitas a domicilio";
  return "Estudio";
}

function addressRow(loc: TalentLocationPublic, es: boolean): { value: string; note?: string } {
  if (loc.addressMode === "public" && loc.exactAddress) return { value: loc.exactAddress };
  if (loc.addressMode === "after_booking") {
    return {
      value: es ? "La dirección exacta llega al confirmar tu reserva" : "The exact address comes with your booking confirmation",
    };
  }
  return { value: es ? "Solo se muestra la zona" : "Only the area is shown" };
}

function Row({
  glyph,
  label,
  value,
  note,
  children,
}: {
  glyph: string;
  label: string;
  value: string;
  note?: string;
  children?: ReactNode;
}): ReactNode {
  return (
    <li className="sb-loc-row">
      <span className="sb-loc-row-icon" aria-hidden>
        {glyph}
      </span>
      <div>
        <p className="sb-loc-row-label">{label}</p>
        <p className="sb-loc-row-value">{value}</p>
        {note ? <p className="sb-loc-row-note">{note}</p> : null}
        {children}
      </div>
    </li>
  );
}

export function renderLocationBlock(args: {
  node: BuilderVisitNode;
  /** Public-safe location (null hides the section). */
  location: TalentLocationPublic | null | undefined;
  facts: ReadonlyArray<TalentVisitFact>;
  locale?: string;
  styleAttr?: CSSProperties;
  /** Test seam; production reads `LOCATION_LIVE_MAP_ENABLED`. */
  liveMapEnabled?: boolean;
}): ReactNode {
  const { node, location, facts, styleAttr } = args;
  const es = (args.locale ?? "en").toLowerCase().startsWith("es");
  const p = node.props;
  const band = p.band !== false;
  const empty = !location;
  const liveMap = args.liveMapEnabled ?? LOCATION_LIVE_MAP_ENABLED;
  const common = {
    className: "sb-loc",
    "data-builder-kind": "visit",
    "data-builder-node-kind": "visit",
    "data-visit-layout": "location",
    "data-visit-band": band ? "1" : "0",
    "data-visit-empty": empty ? "1" : "0",
    "data-map-side": p.mapSide === "right" ? "right" : "left",
    "data-map-size": p.mapSize ?? "md",
    style: styleAttr,
  } as const;

  if (!location) {
    // Nothing to show (no zone yet): an empty hidden shell keeps the node
    // addressable in the builder canvas without shipping the stylesheet.
    return <section {...common} hidden aria-hidden />;
  }

  const isPublic = location.addressMode === "public" && Boolean(location.exactAddress);
  const zone = zoneLabel(location) || location.exactAddress || "";
  const title = (p.title ?? "").trim() || sectionTitle(location.studioKind, es);
  const hours = facts.find((f) => f.icon === "hours");
  const address = addressRow(location, es);
  const mapLabel = es ? `Zona aproximada: ${zone}` : `Approximate area: ${zone}`;
  const eyebrow = (p.eyebrow ?? "").trim();

  return (
    <section {...common} data-location-mode={location.addressMode}>
      <style>{LOCATION_CSS}</style>
      <div className="sb-loc-inner">
        <header className="sb-loc-header">
          {eyebrow ? <p className="sb-loc-eyebrow">{eyebrow}</p> : null}
          <h2 className="sb-loc-title">{title}</h2>
        </header>
        <div className="sb-loc-grid">
          <figure className="sb-loc-map" data-location-map>
            <ZonePlaceholderMap zone={zone} pin={isPublic} label={isPublic ? zone : mapLabel} />
            <span className="sb-loc-map-tag">{zone}</span>
            <div className="sb-loc-map-slot" data-location-map-slot />
            {liveMap && p.showMapButton !== false ? (
              <button type="button" className="sb-loc-map-open" data-location-map-open>
                {es ? "Ver mapa" : "View map"}
              </button>
            ) : null}
          </figure>
          <div className="sb-loc-card">
            <p className="sb-loc-kind">{kindLabel(location.studioKind, es)}</p>
            <h3 className="sb-loc-where">{zone}</h3>
            <ul className="sb-loc-rows">
              {hours ? (
                <Row glyph="◷" label={es ? "Horario" : "Hours"} value={hours.value} note={hours.note}>
                  <a className="sb-loc-row-link" href="#services">
                    {es ? "Ver horarios" : "See times"}
                  </a>
                </Row>
              ) : null}
              <Row glyph="◉" label={es ? "Dirección" : "Address"} value={address.value} note={address.note} />
              {location.arrivalNote || location.arrivalPhotoUrl ? (
                <Row glyph="○" label={es ? "Al llegar" : "On arrival"} value={location.arrivalNote || (es ? "Así se ve la llegada" : "What arrival looks like")}>
                  {location.arrivalPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- talent-authored https photo, not the image CDN
                    <img className="sb-loc-photo" src={location.arrivalPhotoUrl} alt={es ? "Foto de la llegada" : "Arrival photo"} loading="lazy" />
                  ) : null}
                </Row>
              ) : null}
            </ul>
            <div className="sb-loc-actions">
              {isPublic && location.exactAddress ? (
                <a className="sb-loc-action" data-primary="1" href={directionsHref(location.exactAddress)} target="_blank" rel="noopener noreferrer">
                  {es ? "Cómo llegar" : "Get directions"}
                </a>
              ) : (
                <a className="sb-loc-action" href={zoneSearchHref(location)} target="_blank" rel="noopener noreferrer">
                  {es ? "Ver zona en el mapa" : "See the area on the map"}
                </a>
              )}
              <a className="sb-loc-action" data-primary={isPublic ? undefined : "1"} href={TALENT_ASK_HREF}>
                {es ? "Escribir" : "Message"}
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
