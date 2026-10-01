/**
 * Location section (`visit` layout "location", the Ubicacion section, mockup
 * `#s-loc`).
 *
 * Two columns from 900px (map card left, details right), stacked on phones.
 * Header: eyebrow "Tu visita" and the heading "Donde <em>encontrarme</em>" (both
 * editable). Details: the kind eyebrow ("ESTUDIO"), the zone as a big serif
 * title, a sub line, divided rows (zone / exact address / hours / arrival) with
 * token-coloured icons, and the actions.
 *
 * The map is a GENERATED, TOKEN-COLOURED street-grid illustration of the zone
 * (deterministic from the zone text, a dashed circle on the zone, the zone
 * label). It never draws a real street name or any place data: nothing here can
 * be wrong about a city. A pin is drawn only for a public address.
 *
 * PRIVACY. The only address input is `TalentLocationPublic`, which carries
 * `exactAddress` solely when the talent chose "Public address". In every other
 * mode there is nothing to leak into markup, links or the (future) map embed.
 *
 * LIVE MAP. The consented live map is a later task: a clean slot
 * (`[data-location-map-slot]`) and an "Abrir mapa interactivo" pill that only
 * renders when `LOCATION_LIVE_MAP_ENABLED` is on (off until consent tooling).
 */
import { Clock, DoorOpen, Lock, MapPin } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

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

/** Notes longer than this get the "Ver mas" toggle (the CSS clamps to two lines). */
export const ARRIVAL_NOTE_CLAMP_CHARS = 90;

export const LOCATION_CSS = `
.sb-loc{color:var(--token-color-ink);font:inherit;width:100%;min-width:0;box-sizing:border-box}
.sb-loc *{box-sizing:border-box}
.sb-loc[data-visit-empty="1"]{display:none!important}
.sb-loc[data-visit-band="1"]{padding:clamp(2.5rem,5vw,4.5rem) clamp(1.1rem,3vw,2rem);background:var(--token-color-surface-raised,var(--token-color-background))}
.sb-loc .sb-loc-inner{width:100%;max-width:68rem;margin:0 auto}
.sb-loc .sb-loc-header{margin-bottom:clamp(1.25rem,3vw,2.25rem)}
.sb-loc .sb-loc-eyebrow{margin:0 0 .4rem;font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;color:var(--token-color-ink)}
.sb-loc .sb-loc-title{margin:0;font-family:var(--token-typography-heading-font-family,var(--site-heading-font,Georgia,serif));font-size:clamp(1.85rem,4vw,2.75rem);font-weight:400;letter-spacing:-.02em;line-height:1.1;color:var(--token-color-ink)}
.sb-loc .sb-loc-title em{font-style:italic;font-weight:400}
.sb-loc .sb-loc-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:1.25rem;align-items:stretch}
.sb-loc .sb-loc-map{position:relative;margin:0;border-radius:18px;overflow:hidden;border:1px solid transparent;background:color-mix(in srgb,var(--token-color-blush,var(--token-color-accent,var(--token-color-primary))) 60%,var(--token-color-surface-raised,var(--token-color-background)));aspect-ratio:16/10;max-width:100%;min-width:0}
.sb-loc[data-map-size="sm"] .sb-loc-map{aspect-ratio:16/8}
.sb-loc[data-map-size="lg"] .sb-loc-map{aspect-ratio:4/3}
.sb-loc .sb-loc-map svg{position:absolute;inset:0;width:100%;height:100%;display:block}
.sb-loc .sb-loc-map-tag{position:absolute;left:10px;bottom:10px;max-width:calc(100% - 20px);padding:7px 11px;border-radius:12px;background:color-mix(in srgb,var(--token-color-surface-raised,var(--token-color-background)) 94%,transparent);color:var(--token-color-ink);font-size:12px;line-height:1.35;box-shadow:0 8px 20px -14px color-mix(in srgb,var(--token-color-ink) 45%,transparent)}
.sb-loc .sb-loc-map-tag b{display:block;font-size:13px;font-weight:600}
.sb-loc .sb-loc-map-slot{position:absolute;inset:0}
.sb-loc .sb-loc-map-slot:empty{display:none}
.sb-loc .sb-loc-map-open{position:absolute;right:10px;top:10px;min-height:36px;padding:0 13px;border-radius:99px;border:1px solid var(--token-color-line);background:var(--token-color-surface-raised,var(--token-color-background));color:var(--token-color-ink);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}
.sb-loc .sb-loc-card{display:grid;gap:14px;align-content:start;min-width:0}
.sb-loc .sb-loc-kind{display:block;margin:0;font-size:.6875rem;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--token-color-accent-text,var(--token-color-ink))}
.sb-loc .sb-loc-where{margin:4px 0 0;font-family:var(--token-typography-heading-font-family,var(--site-heading-font,Georgia,serif));font-weight:500;font-size:1.5rem;line-height:1.15;overflow-wrap:anywhere;color:var(--token-color-ink)}
.sb-loc .sb-loc-where small{display:block;margin-top:5px;font-family:var(--site-body-font,inherit);font-size:.8125rem;font-weight:500;color:var(--token-color-muted)}
.sb-loc .sb-loc-rows{display:grid;border-top:1px solid var(--token-color-line)}
.sb-loc .sb-loc-row{display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px;padding:11px 0;border-bottom:1px solid var(--token-color-line);font-size:.875rem;line-height:1.45}
.sb-loc .sb-loc-row svg{width:16px;height:16px;margin-top:2px;color:var(--token-color-accent-text,var(--token-color-ink))}
.sb-loc .sb-loc-row b{display:block;font-weight:600}
.sb-loc .sb-loc-row b+span{display:block;color:var(--token-color-muted);font-size:.84375rem}
.sb-loc .sb-loc-note-t{margin:0;color:var(--token-color-muted);font-size:.84375rem;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.sb-loc .sb-loc-more-c{position:absolute;opacity:0;pointer-events:none}
.sb-loc .sb-loc-more{display:inline-block;margin-top:2px;min-height:28px;font-size:.8125rem;color:var(--token-color-ink);text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.sb-loc .sb-loc-more-less{display:none}
.sb-loc .sb-loc-note:has(.sb-loc-more-c:checked) .sb-loc-note-t{display:block;-webkit-line-clamp:unset;overflow:visible}
.sb-loc .sb-loc-note:has(.sb-loc-more-c:checked) .sb-loc-more-more{display:none}
.sb-loc .sb-loc-note:has(.sb-loc-more-c:checked) .sb-loc-more-less{display:inline}
.sb-loc .sb-loc-photo{display:block;margin-top:.6rem;width:100%;max-width:16rem;aspect-ratio:4/3;object-fit:cover;border-radius:12px;border:1px solid var(--token-color-line)}
.sb-loc .sb-loc-acts{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px}
.sb-loc .sb-loc-btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 16px;border-radius:99px;border:1px solid var(--token-color-line);color:var(--token-color-ink);background:transparent;font-size:.875rem;font-weight:500;text-decoration:none}
.sb-loc .sb-loc-link{display:inline-flex;align-items:center;min-height:40px;font-size:.875rem;color:var(--token-color-ink);text-decoration:underline;text-underline-offset:3px}
@media (min-width:900px){
  .sb-loc .sb-loc-grid{grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:40px}
  .sb-loc[data-map-side="right"] .sb-loc-map{order:2}
  .sb-loc .sb-loc-map{aspect-ratio:auto;min-height:360px}
  .sb-loc[data-map-size="sm"] .sb-loc-map{min-height:280px}
  .sb-loc[data-map-size="lg"] .sb-loc-map{min-height:440px}
}
`;

/* ---------- zone illustration (generated, never geographic) ---------- */

export function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seeded(seed: number): () => number {
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
 * A pale street grid (white roads on a tinted ground, a green patch), a dashed
 * accent circle on the zone and the zone label. Laid out from the zone text
 * only, so the same zone always looks the same and two zones differ. No street
 * names, no neighbourhood names but the talent's own. A pin only when public.
 */
export function ZonePlaceholderMap({
  zone,
  city,
  pin,
  label,
}: {
  zone: string;
  city: string;
  pin: boolean;
  label: string;
}): ReactNode {
  const rnd = seeded(hash32(zone.toLowerCase()));
  const cx = n1(170 + rnd() * 60);
  const cy = n1(100 + rnd() * 50);
  const surface = "var(--token-color-surface-raised,var(--token-color-background))";
  const accent = "var(--token-color-accent,var(--token-color-primary))";
  const ink = "var(--token-color-ink)";
  const horiz = [0, 1, 2].map((i) => {
    const y0 = n1(50 + i * 62 + (rnd() - 0.5) * 24);
    const y1 = n1(y0 + (rnd() - 0.5) * 30);
    return { d: `M-10 ${y0} L410 ${y1}`, w: i === 1 ? 7 : 10 };
  });
  const vert = [0, 1, 2, 3].map((i) => {
    const x0 = n1(70 + i * 95 + (rnd() - 0.5) * 30);
    const x1 = n1(x0 + (rnd() - 0.5) * 36);
    return { d: `M${x0} -10 L${x1} 260`, w: i === 2 ? 16 : 9 };
  });
  const parkX = n1(14 + rnd() * 70);
  const parkY = n1(160 + rnd() * 30);
  const labelStyle = (bold: boolean) => ({
    fill: bold ? ink : `color-mix(in srgb, ${ink} 55%, transparent)`,
    font: `${bold ? 700 : 500} ${bold ? 12.5 : 11}px var(--site-body-font, sans-serif)`,
    paintOrder: "stroke" as const,
    stroke: surface,
    strokeWidth: 3,
  });
  return (
    <svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" role="img" aria-label={label} focusable="false">
      <rect width="400" height="250" style={{ fill: `color-mix(in srgb, var(--token-color-blush, ${accent}) 60%, ${surface})` }} />
      <rect
        x={parkX}
        y={parkY}
        width="92"
        height="56"
        rx="12"
        style={{ fill: `color-mix(in srgb, var(--token-color-success, ${accent}) 24%, ${surface})` }}
      />
      <g fill="none" strokeLinecap="round" style={{ stroke: surface }}>
        {horiz.map((r) => (
          <path key={r.d} d={r.d} strokeWidth={r.w} />
        ))}
        {vert.map((r) => (
          <path key={r.d} d={r.d} strokeWidth={r.w} />
        ))}
      </g>
      {pin ? (
        <g transform={`translate(${cx} ${cy})`}>
          <path d="M0 0c-10-11-16-19-16-26a16 16 0 0 1 32 0c0 7-6 15-16 26z" style={{ fill: accent }} />
          <circle cy="-26" r="6" style={{ fill: surface }} />
        </g>
      ) : (
        <circle
          cx={cx}
          cy={cy}
          r="58"
          strokeWidth="2"
          strokeDasharray="6 6"
          style={{ fill: `color-mix(in srgb, ${accent} 15%, transparent)`, stroke: accent }}
        />
      )}
      <text x={cx} y={pin ? n1(cy + 18) : cy + 4} textAnchor="middle" style={labelStyle(true)}>
        {zone}
      </text>
      {city ? (
        <text x="200" y="32" textAnchor="middle" style={{ ...labelStyle(false), letterSpacing: "0.12em" }}>
          {city.toUpperCase()}
        </text>
      ) : null}
    </svg>
  );
}

/* ---------- copy ---------- */

type Heading = { before: string; accent: string };

/** The mockup's titles by kind: "Donde encontrarme", "Voy a donde estes". */
function derivedHeading(kind: StudioKind, es: boolean): Heading {
  if (kind === "home_visits") return es ? { before: "Voy a ", accent: "donde estés" } : { before: "I come ", accent: "to you" };
  return es ? { before: "Dónde ", accent: "encontrarme" } : { before: "Where to ", accent: "find me" };
}

function titleNodes(text: string, accent: string): ReactNode {
  const a = accent.trim();
  if (!a) return text;
  const idx = text.toLowerCase().lastIndexOf(a.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <em>{text.slice(idx, idx + a.length)}</em>
      {text.slice(idx + a.length)}
    </>
  );
}

function kindLabel(kind: StudioKind, es: boolean): string {
  if (!es) return STUDIO_KIND_LABELS[kind];
  if (kind === "home_visits") return "Visitas a domicilio";
  if (kind === "both") return "Estudio y visitas a domicilio";
  return "Estudio";
}

function Row({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }): ReactNode {
  return (
    <div className="sb-loc-row">
      <span aria-hidden style={{ display: "contents" }}>
        {icon}
      </span>
      <div>
        <b>{title}</b>
        {children}
      </div>
    </div>
  );
}

export function renderLocationBlock(args: {
  node: BuilderVisitNode;
  /** Public-safe location (null hides the section). */
  location: TalentLocationPublic | null | undefined;
  facts: ReadonlyArray<TalentVisitFact>;
  locale?: string;
  styleAttr?: CSSProperties;
  /** Where the booking policy page lives on this host ("" prefix on a talent host). */
  policyHref?: string;
  /** Test seam; production reads `LOCATION_LIVE_MAP_ENABLED`. */
  liveMapEnabled?: boolean;
}): ReactNode {
  const { node, location, facts, styleAttr } = args;
  const es = (args.locale ?? "en").toLowerCase().startsWith("es");
  const p = node.props;
  const band = p.band !== false;
  const liveMap = args.liveMapEnabled ?? LOCATION_LIVE_MAP_ENABLED;
  const common = {
    className: "sb-loc",
    "data-builder-kind": "visit",
    "data-builder-node-kind": "visit",
    "data-visit-layout": "location",
    "data-visit-band": band ? "1" : "0",
    "data-visit-empty": location ? "0" : "1",
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
  const hours = facts.find((f) => f.icon === "hours");
  const authoredTitle = (p.title ?? "").trim();
  const heading = derivedHeading(location.studioKind, es);
  // Unset or empty eyebrow = the mockup's "Tu visita" (sites seeded before this carry "").
  const eyebrow = (p.eyebrow ?? "").trim() || (es ? "Tu visita" : "Your visit");
  const mapLabel = es ? `Zona aproximada: ${zone}` : `Approximate area: ${zone}`;
  const note = location.arrivalNote;
  const longNote = note.length > ARRIVAL_NOTE_CLAMP_CHARS;
  const iconProps = { size: 16, strokeWidth: 1.8, "aria-hidden": true } as const;
  const sub = isPublic
    ? location.city
      ? es
        ? `${location.city} · dirección publicada por la talento`
        : `${location.city} · address published by the professional`
      : ""
    : es
      ? "Zona aproximada"
      : "Approximate area";

  return (
    <section {...common} data-location-mode={location.addressMode}>
      <style>{LOCATION_CSS}</style>
      <div className="sb-loc-inner sb-visit-inner">
        <header className="sb-loc-header sb-visit-header">
          {eyebrow ? <p className="sb-loc-eyebrow sb-visit-eyebrow">{eyebrow}</p> : null}
          <h2 className="sb-loc-title sb-visit-title">
            {authoredTitle ? (
              titleNodes(authoredTitle, p.titleAccent ?? "")
            ) : (
              <>
                {heading.before}
                <em>{heading.accent}</em>
              </>
            )}
          </h2>
        </header>
        <div className="sb-loc-grid">
          <figure className="sb-loc-map" data-location-map>
            <ZonePlaceholderMap zone={zone} city={location.city} pin={isPublic} label={isPublic ? zone : mapLabel} />
            <div className="sb-loc-map-tag">
              <b>{zone}</b>
              {isPublic ? (es ? "Dirección publicada" : "Published address") : es ? "Zona aproximada, no es la dirección" : "Approximate area, not the address"}
            </div>
            <div className="sb-loc-map-slot" data-location-map-slot />
            {liveMap && p.showMapButton !== false ? (
              <button type="button" className="sb-loc-map-open" data-location-map-open>
                {es ? "Abrir mapa interactivo" : "Open interactive map"}
              </button>
            ) : null}
          </figure>
          <div className="sb-loc-card">
            <div>
              <span className="sb-loc-kind">{kindLabel(location.studioKind, es)}</span>
              <div className="sb-loc-where">
                {zone}
                {sub ? <small>{sub}</small> : null}
              </div>
            </div>
            <div className="sb-loc-rows">
              {isPublic ? (
                <Row icon={<MapPin {...iconProps} />} title={es ? "Dirección" : "Address"}>
                  <span>{location.exactAddress}</span>
                </Row>
              ) : (
                <>
                  <Row icon={<MapPin {...iconProps} />} title={es ? "Zona" : "Area"}>
                    <span>{es ? `${zone} (aproximada)` : `${zone} (approximate)`}</span>
                  </Row>
                  <Row icon={<Lock {...iconProps} />} title={es ? "Dirección exacta" : "Exact address"}>
                    <span>
                      {location.addressMode === "after_booking"
                        ? es
                          ? "Te llega en tu confirmación cuando la cita queda confirmada."
                          : "It reaches you in your confirmation once the booking is confirmed."
                        : es
                          ? "No se publica."
                          : "Not published."}
                    </span>
                  </Row>
                </>
              )}
              {hours ? (
                <Row icon={<Clock {...iconProps} />} title={es ? "Horario" : "Hours"}>
                  <span>{hours.note ? `${hours.value} · ${hours.note}` : hours.value}</span>
                </Row>
              ) : null}
              {note || location.arrivalPhotoUrl ? (
                <Row icon={<DoorOpen {...iconProps} />} title={es ? "Al llegar" : "On arrival"}>
                  <div className="sb-loc-note">
                    {note ? <p className="sb-loc-note-t" data-clamp={longNote ? "1" : undefined}>{note}</p> : null}
                    {longNote ? (
                      <label className="sb-loc-more">
                        <input type="checkbox" className="sb-loc-more-c" aria-label={es ? "Ver más" : "Read more"} />
                        <span className="sb-loc-more-more">{es ? "Ver más" : "Read more"}</span>
                        <span className="sb-loc-more-less">{es ? "Ver menos" : "Read less"}</span>
                      </label>
                    ) : null}
                    {location.arrivalPhotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- talent-authored https photo, not the image CDN
                      <img className="sb-loc-photo" src={location.arrivalPhotoUrl} alt={es ? "Foto de la llegada" : "Arrival photo"} loading="lazy" />
                    ) : null}
                  </div>
                </Row>
              ) : null}
            </div>
            <div className="sb-loc-acts">
              {isPublic && location.exactAddress ? (
                <a className="sb-loc-btn" href={directionsHref(location.exactAddress)} target="_blank" rel="noopener noreferrer">
                  {es ? "Cómo llegar" : "Get directions"}
                </a>
              ) : (
                <a className="sb-loc-btn" href={zoneSearchHref(location)} target="_blank" rel="noopener noreferrer">
                  {es ? "Ver zona en el mapa" : "See the area on the map"}
                </a>
              )}
              {args.policyHref ? (
                <a className="sb-loc-link" href={args.policyHref}>
                  {es ? "Pagos, cambios y cancelaciones" : "Payments, changes and cancellations"}
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
