"use client";

/**
 * Nail Designer side panel: the Color, Art, Finish, Shape, Extras and Looks
 * tab bodies, ported from the owner's Nail Studio design. Presentational: all
 * state lives in the island and arrives through `Actions`.
 */
import type { CSSProperties, ReactNode } from "react";

import { Sticker } from "./nail-designer-art";
import type { NailCopy } from "./nail-designer-copy";
import {
  NAIL_COLORS,
  NAIL_FINISHES,
  NAIL_LENGTHS,
  NAIL_PATTERNS,
  NAIL_SHAPES,
  NAIL_SKINS,
  NAIL_STICKERS,
  nailColorName,
  type NailLook,
  type NailState,
} from "./nail-designer-model";
import { nailPatternBg, nailShine } from "./nail-designer-paint";

export type NailTab = "color" | "art" | "finish" | "shape" | "extras" | "looks";

export type PanelActions = {
  apply: (patch: Partial<NailState>, quiet?: boolean) => void;
  setShape: (id: string) => void;
  setLength: (id: string) => void;
  setSkin: (hex: string) => void;
  loadLook: (look: NailLook) => void;
};

type Props = {
  tab: NailTab;
  cur: NailState;
  shape: string;
  length: string;
  skin: string;
  looks: ReadonlyArray<NailLook>;
  es: boolean;
  t: NailCopy;
  actions: PanelActions;
};

const nm = (x: { en: string; es: string }, es: boolean) => (es ? x.es : x.en);

function Head({ children, cap }: { children: ReactNode; cap?: string }) {
  return (
    <div className="nd-sechead">
      <h3 className="nd-h3">{children}</h3>
      {cap !== undefined ? <span className="nd-cap">{cap}</span> : null}
    </div>
  );
}

function Shiny({ shine }: { shine: string }) {
  return <span className="nd-shine" style={{ background: shine }} />;
}

/** The thumbnail nails of a saved look. */
export function LookThumbs({ look }: { look: NailLook }) {
  const sh = NAIL_SHAPES.find((x) => x.id === look.shape) ?? NAIL_SHAPES[0];
  return (
    <span className="nd-lookthumbs">
      {look.nails.map((n, i) => (
        <span
          key={i}
          className="nd-lookthumb"
          style={{ borderRadius: sh.radius, clipPath: sh.clip, background: nailPatternBg(n, 0.4) }}
        >
          <Shiny shine={nailShine(n.finish)} />
        </span>
      ))}
    </span>
  );
}

export function LookButton({
  look,
  es,
  full,
  onPick,
}: {
  look: NailLook;
  es: boolean;
  full?: boolean;
  onPick: () => void;
}) {
  const sh = NAIL_SHAPES.find((x) => x.id === look.shape) ?? NAIL_SHAPES[0];
  const len = NAIL_LENGTHS.find((x) => x.id === look.length);
  return (
    <button type="button" className={full ? "nd-look nd-lookfull" : "nd-look"} data-nd-look onClick={onPick}>
      <LookThumbs look={look} />
      <span className="nd-looktext">
        <span className="nd-lookname">{es ? look.nameEs : look.name}</span>
        <span className="nd-lookmeta">{`${nm(sh, es)} · ${len ? nm(len, es) : look.length}`}</span>
      </span>
    </button>
  );
}

export function NailPanel({ tab, cur, shape, length, skin, looks, es, t, actions }: Props) {
  const prevBg = (over: Partial<NailState> = {}) => nailPatternBg({ ...cur, ...over }, 0.5);
  const colorGroup = (key: "c1" | "c2", title: string, cap: string, note: string | null, custom: string) => (
    <div className="nd-stack12">
      <Head cap={cap}>{title}</Head>
      {note ? <p className="nd-note">{note}</p> : null}
      <div className="nd-g6">
        {NAIL_COLORS.map((c) => {
          const name = nm(c, es);
          return (
            <button
              key={c.hex}
              type="button"
              className="nd-sw"
              style={{ background: c.hex }}
              aria-label={`${title} ${name}`}
              aria-pressed={cur[key].toUpperCase() === c.hex}
              title={name}
              data-nd-color={c.hex}
              onClick={() => actions.apply({ [key]: c.hex })}
            />
          );
        })}
      </div>
      <label className="nd-colorrow">
        <input
          type="color"
          value={cur[key].toLowerCase()}
          data-nd-custom={key}
          onChange={(e) => actions.apply({ [key]: e.target.value }, true)}
        />
        {custom}
      </label>
    </div>
  );

  const tile = (
    key: string,
    name: string,
    on: boolean,
    onClick: () => void,
    preview: ReactNode,
    attrs: Record<string, string> = {},
  ) => (
    <button key={key} type="button" className="nd-tile" aria-pressed={on} onClick={onClick} {...attrs}>
      {preview}
      {name}
    </button>
  );

  const nail = (cls: string, style: CSSProperties, shine: string) => (
    <span className={`nd-prev ${cls}`} style={style}>
      <Shiny shine={shine} />
    </span>
  );

  switch (tab) {
    case "color":
      return (
        <div className="nd-stack28">
          {colorGroup("c1", t.polish, nailColorName(cur.c1, es), null, t.customPolish)}
          {colorGroup("c2", t.accent, nailColorName(cur.c2, es), t.accentNote, t.customAccent)}
        </div>
      );
    case "art":
      return (
        <div className="nd-stack12">
          <Head>{t.nailArt}</Head>
          <div className="nd-g4">
            {NAIL_PATTERNS.map((p) =>
              tile(
                p.id,
                nm(p, es),
                cur.pattern === p.id,
                () => actions.apply({ pattern: p.id }),
                nail("nd-prev-art", { background: prevBg({ pattern: p.id }) }, nailShine(cur.finish)),
                { "data-nd-pattern": p.id },
              ),
            )}
          </div>
        </div>
      );
    case "finish":
      return (
        <div className="nd-stack12">
          <Head>{t.finish}</Head>
          <div className="nd-g3">
            {NAIL_FINISHES.map((f) =>
              tile(
                f.id,
                nm(f, es),
                cur.finish === f.id,
                () => actions.apply({ finish: f.id }),
                nail("nd-prev-fin", { background: prevBg() }, nailShine(f.id)),
                { "data-nd-finish": f.id },
              ),
            )}
          </div>
        </div>
      );
    case "shape":
      return (
        <div className="nd-stack28">
          <div className="nd-stack12">
            <Head>{t.shape}</Head>
            <div className="nd-g3">
              {NAIL_SHAPES.map((x) =>
                tile(
                  x.id,
                  nm(x, es),
                  shape === x.id,
                  () => actions.setShape(x.id),
                  nail("nd-prev-shape", { borderRadius: x.radius, clipPath: x.clip, background: prevBg() }, nailShine(cur.finish)),
                  { "data-nd-shape": x.id },
                ),
              )}
            </div>
          </div>
          <div className="nd-stack12">
            <Head>{t.length}</Head>
            <div className="nd-seg nd-seg3">
              {NAIL_LENGTHS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className="nd-segbtn"
                  aria-pressed={length === l.id}
                  data-nd-length={l.id}
                  onClick={() => actions.setLength(l.id)}
                >
                  {nm(l, es)}
                </button>
              ))}
            </div>
          </div>
          <div className="nd-stack12">
            <Head>{t.skinTone}</Head>
            <div className="nd-g6">
              {NAIL_SKINS.map((x) => (
                <button
                  key={x.hex}
                  type="button"
                  className="nd-sw"
                  style={{ background: x.hex }}
                  aria-label={`${t.skinLabel} ${nm(x, es)}`}
                  aria-pressed={skin === x.hex}
                  title={nm(x, es)}
                  data-nd-skin={x.hex}
                  onClick={() => actions.setSkin(x.hex)}
                />
              ))}
            </div>
          </div>
        </div>
      );
    case "extras":
      return (
        <div className="nd-stack12">
          <Head>{t.charms}</Head>
          <p className="nd-note">{t.charmsTip}</p>
          <div className="nd-g3">
            {NAIL_STICKERS.map((s) =>
              tile(
                s.id,
                nm(s, es),
                cur.sticker === s.id,
                () => actions.apply({ sticker: s.id }),
                <span className="nd-stkbox">
                  <Sticker id={s.id} withNone />
                </span>,
                { "data-nd-sticker": s.id },
              ),
            )}
          </div>
        </div>
      );
    case "looks":
      return (
        <div className="nd-stack12">
          <Head>{t.savedLooks}</Head>
          <div className="nd-stack12" style={{ gap: 10 }}>
            {looks.map((l, i) => (
              <LookButton key={`${l.name}-${i}`} look={l} es={es} full onPick={() => actions.loadLook(l)} />
            ))}
          </div>
        </div>
      );
    default:
      return null;
  }
}
