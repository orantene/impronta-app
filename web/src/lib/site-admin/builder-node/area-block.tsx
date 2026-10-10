/**
 * Area card (`visit` layout "area", Gridline W-13 `.gl-area`).
 *
 * An APPROXIMATE area: a generated, token-coloured grid drawing with a radius
 * circle and the zone label, the municipality chips (the talent's own
 * "travels to" places) and a travel note (the arrival note). It is never an
 * address: the zone comes only from `TalentLocationPublic`, which is the output
 * of `toPublicLocation` (the Location privacy gate), and `exactAddress` is
 * never read here, not even when the talent published it for the Location card.
 *
 * No responsive rules: the mockup's card is one column at every width.
 * Token colours only. Hidden when there is neither a zone nor a chip.
 */
import type { CSSProperties, ReactNode } from "react";

import { zoneLabel, type TalentLocationPublic } from "@/lib/talent/location-settings";

import { anchorIdAttrs } from "./anchor-id";
import { hash32, seeded } from "./location-block";
import type { BuilderVisitNode } from "./types";
import type { TalentVisitFact } from "./visit-types";

export const AREA_CSS = `
.sb-area{color:var(--token-color-ink);font:inherit;width:100%;min-width:0;box-sizing:border-box}
.sb-area[data-area-empty="1"]{display:none!important}
/* TUL-474: keep Where I work clear of the job grid above. */
.sb-area-header{margin:12px 0 .75rem;scroll-margin-top:72px}
.sb-area-eyebrow{margin:0 0 .35rem;font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:var(--token-color-muted)}
.sb-area-title{margin:0;font-size:clamp(1.35rem,2.5vw,1.85rem);font-weight:600;letter-spacing:-.02em;line-height:1.15}
.sb-area-card{display:grid;gap:10px;background:var(--token-color-surface-raised,var(--token-color-background));border:1.5px solid var(--token-color-ink);border-radius:var(--site-radius-md,8px);padding:12px}
.sb-area-card svg{width:100%;height:auto;display:block;border-radius:6px;background:var(--token-color-background)}
.sb-area-chips{margin:0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:6px}
.sb-area-chips li{font:500 12px var(--site-mono-font,ui-monospace,monospace);padding:6px 9px;border-radius:4px;background:var(--token-color-background)}
.sb-area-note{margin:0;font-size:13px;color:var(--token-color-muted)}
`;

const SLOT_CHIPS_MAX = 12;

/**
 * The generated drawing: a faint grid, a dashed route, a radius circle on the
 * zone and its label. Laid out from the zone text only (deterministic, never
 * geographic: no street names, no real map data).
 */
export function AreaGridMap({ zone, label }: { zone: string; label: string }): ReactNode {
  const seed = zone.toLowerCase();
  const rnd = seeded(hash32(seed));
  const round = (v: number) => Math.round(v * 10) / 10;
  const cx = round(150 + rnd() * 30);
  const cy = round(70 + rnd() * 16);
  const y0 = round(112 + rnd() * 16);
  const y1 = round(26 + rnd() * 14);
  const patternId = `sb-area-grid-${hash32(seed).toString(36)}`;
  const ink = "var(--token-color-ink)";
  const accent = "var(--token-color-accent,var(--token-color-primary))";
  const tag = zone.split(",").pop()?.trim().toUpperCase().slice(0, 14) ?? "";
  return (
    <svg viewBox="0 0 320 150" role="img" aria-label={label} focusable="false">
      <defs>
        <pattern id={patternId} width="16" height="16" patternUnits="userSpaceOnUse">
          <path d="M16 0H0V16" fill="none" stroke="currentColor" strokeOpacity=".12" />
        </pattern>
      </defs>
      <rect width="320" height="150" fill={`url(#${patternId})`} style={{ color: ink }} />
      <path
        d={`M20 ${y0} C80 ${round(y0 - 30)} 120 ${round(y0 - 10)} 170 ${round(cy)} S260 ${round(y1 + 10)} 300 ${y1}`}
        fill="none"
        strokeWidth="2"
        strokeDasharray="4 4"
        style={{ stroke: "var(--token-color-muted)" }}
      />
      <circle cx={cx} cy={cy} r="58" strokeWidth="2" style={{ fill: accent, fillOpacity: 0.22, stroke: accent }} />
      <circle cx={cx} cy={cy} r="5" style={{ fill: ink }} />
      {tag ? (
        <text x={round(cx + 11)} y={round(cy - 4)} fontSize="10" style={{ fill: ink, font: "500 10px var(--site-mono-font, ui-monospace, monospace)" }}>
          {tag}
        </text>
      ) : null}
    </svg>
  );
}

/** The chips the card shows: the live "travels to" places, de-duplicated. */
export function areaChips(facts: ReadonlyArray<TalentVisitFact>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of facts) {
    if (f.icon !== "travel") continue;
    for (const raw of f.chips ?? []) {
      const name = raw.trim();
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
  }
  return out.slice(0, SLOT_CHIPS_MAX);
}

export function renderAreaBlock(args: {
  node: BuilderVisitNode;
  /** Output of `toPublicLocation` (null when the talent has no zone yet). */
  location: TalentLocationPublic | null | undefined;
  facts: ReadonlyArray<TalentVisitFact>;
  locale?: string;
  styleAttr?: CSSProperties;
}): ReactNode {
  const { node, location, facts, styleAttr } = args;
  const es = (args.locale ?? "en").toLowerCase().startsWith("es");
  const p = node.props;
  const zone = location ? zoneLabel(location) : "";
  const chips = areaChips(facts);
  const empty = !zone && chips.length === 0;
  const note = location?.arrivalNote?.trim() ?? "";
  const eyebrow = (p.eyebrow ?? "").trim();
  const title = (p.title ?? "").trim();
  const mapLabel = es
    ? `Zona aproximada${zone ? `: ${zone}` : ""}. No es una dirección.`
    : `Approximate area${zone ? `: ${zone}` : ""}. Not an address.`;
  return (
    <section
      className="sb-area"
      data-builder-kind="visit"
      data-builder-node-kind="visit"
      data-visit-layout="area"
      data-area-empty={empty ? "1" : "0"}
      style={styleAttr}
      hidden={empty || undefined}
      aria-hidden={empty || undefined}
      {...anchorIdAttrs(node)}
    >
      {empty ? null : (
        <>
          <style>{AREA_CSS}</style>
          {eyebrow || title ? (
            <header className="sb-area-header">
              {eyebrow ? <p className="sb-area-eyebrow">{eyebrow}</p> : null}
              {title ? <h2 className="sb-area-title">{title}</h2> : null}
            </header>
          ) : null}
          <div className="sb-area-card" data-area-card>
            <AreaGridMap zone={zone || chips[0] || ""} label={mapLabel} />
            {chips.length > 0 ? (
              <ul className="sb-area-chips" aria-label={es ? "Zonas que cubro" : "Areas I cover"}>
                {chips.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            ) : null}
            {note ? <p className="sb-area-note">{note}</p> : null}
          </div>
        </>
      )}
    </section>
  );
}
