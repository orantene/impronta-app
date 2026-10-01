"use client";

/**
 * Nail Designer island. All state is local (no network, no storage): the
 * visitor styles five nails, then the CTA hands a short plain-text summary of
 * the design to the site's EXISTING contact flow through the same
 * `tulala:ask-question` window event the Maison "Ask" buttons use. The booking
 * sheet / inquiry form / front-door chat each listen for it and pre-fill their
 * message box with `detail.message`; nothing is sent until the visitor submits
 * there.
 *
 * First paint is the full interactive markup (every control is a real
 * <button>), so a crawler or a visitor before hydration sees the app.
 */
import { useId, useRef, useState, type CSSProperties } from "react";

import {
  NAIL_FINGERS,
  NAIL_LENGTHS,
  NAIL_SHAPES,
  initialNailDesign,
  nailDesignSummary,
  nailLabel,
  nailLengthFactor,
  patchNails,
  surpriseNailDesign,
  type NailDesign,
  type NailOffered,
  type NailState,
} from "./nail-designer-model";
import { nailArtBackground, nailHex, nailShine } from "./nail-designer-paint";

type TabId = "color" | "art" | "finish" | "shape" | "extras";

const COPY = {
  en: {
    tabs: { color: "Colour", art: "Art", finish: "Finish", shape: "Shape", extras: "Extras" },
    applyTo: "Apply to",
    all: "All nails",
    only: "only",
    polish: "Polish",
    accent: "Accent",
    length: "Length",
    charms: "Charms",
    hint: "Tap a nail to style it on its own",
    undo: "Undo",
    reset: "Reset",
    surprise: "Surprise me",
    sent: "Design ready. Add your details to send it.",
    didUndo: "Last change undone",
    didReset: "Back to the starter look",
    selected: "selected",
    nail: "nail",
    stage: "Your design",
    controls: "Design controls",
  },
  es: {
    tabs: { color: "Color", art: "Arte", finish: "Acabado", shape: "Forma", extras: "Extras" },
    applyTo: "Aplicar a",
    all: "Todas las uñas",
    only: "solamente",
    polish: "Esmalte",
    accent: "Acento",
    length: "Largo",
    charms: "Accesorios",
    hint: "Toca una uña para diseñarla por separado",
    undo: "Deshacer",
    reset: "Reiniciar",
    surprise: "Sorpréndeme",
    sent: "Diseño listo. Agrega tus datos para enviarlo.",
    didUndo: "Último cambio deshecho",
    didReset: "De vuelta al diseño inicial",
    selected: "seleccionada",
    nail: "uña",
    stage: "Tu diseño",
    controls: "Controles del diseño",
  },
} as const;

const FINGER_W = [16, 18, 19, 18, 21];

function Charm({ id }: { id: string }) {
  switch (id) {
    case "gem":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 21 10 12 22 3 10Z" /></svg>;
    case "star":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 3 7 7 .6-5.3 4.7 1.6 7.2L12 17.6 5.7 21.5l1.6-7.2L2 9.6 9 9Z" /></svg>;
    case "heart":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21C5 15.5 2 12 2 8.5A5 5 0 0 1 12 6a5 5 0 0 1 10 2.5C22 12 19 15.5 12 21Z" /></svg>;
    case "flower":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="4" /><circle cx="19" cy="11" r="4" /><circle cx="16" cy="19" r="4" /><circle cx="8" cy="19" r="4" /><circle cx="5" cy="11" r="4" /><circle cx="12" cy="12" r="3" /></svg>;
    case "pearls":
      return (
        <>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /></svg>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /></svg>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /></svg>
        </>
      );
    default:
      return null;
  }
}

type Props = {
  offered: NailOffered;
  locale: string;
  title: string;
  ctaLabel: string;
  sendWithBooking: boolean;
};

export function NailDesignerIsland({ offered, locale, title, ctaLabel, sendWithBooking }: Props) {
  const es = locale.toLowerCase().startsWith("es");
  const t = es ? COPY.es : COPY.en;
  const uid = useId();
  const [design, setDesign] = useState<NailDesign>(() => initialNailDesign(offered));
  const [history, setHistory] = useState<NailDesign[]>([]);
  const [target, setTarget] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const live = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tabs: TabId[] = [];
  if (offered.colors.length) tabs.push("color");
  if (offered.arts.length) tabs.push("art");
  if (offered.finishes.length) tabs.push("finish");
  if (offered.shapes.length) tabs.push("shape");
  if (offered.charms.length) tabs.push("extras");
  const [tab, setTab] = useState<TabId>(tabs[0] ?? "color");
  const activeTab: TabId = tabs.includes(tab) ? tab : (tabs[0] ?? "color");

  const flash = (msg: string) => {
    setStatus(msg);
    if (live.current) clearTimeout(live.current);
    live.current = setTimeout(() => setStatus(""), 2200);
  };
  const commit = (next: NailDesign) => {
    setHistory((h) => [...h, design].slice(-40));
    setDesign(next);
  };
  const apply = (patch: Partial<NailState>) => commit(patchNails(design, target, patch));
  const current: NailState = design.nails[target ?? 2];

  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    setDesign(last);
    flash(t.didUndo);
  };
  const reset = () => {
    commit(initialNailDesign(offered));
    setTarget(null);
    flash(t.didReset);
  };
  const surprise = () => {
    commit(surpriseNailDesign(offered));
    setTarget(null);
  };
  const send = () => {
    const message = nailDesignSummary(design, locale);
    window.dispatchEvent(
      new CustomEvent("tulala:ask-question", {
        detail: { message, offeringId: null, offeringTitle: null, from: "app_nail_designer" },
      }),
    );
    flash(t.sent);
  };

  const shape = NAIL_SHAPES.find((s) => s.id === design.shape) ?? NAIL_SHAPES[3];
  const len = nailLengthFactor(design.length);
  const oneName = target === null ? "" : nailLabel(NAIL_FINGERS, NAIL_FINGERS[target].id, es);
  const tabLabel = (id: TabId) => t.tabs[id];

  const swatches = (key: "c1" | "c2", caption: string) => (
    <div className="sb-nd-group" role="group" aria-label={caption}>
      <p className="sb-nd-label">{caption}</p>
      <div className="sb-nd-swatches">
        {offered.colors.map((c) => (
          <button
            key={c.id}
            type="button"
            className="sb-nd-sw"
            style={{ background: c.hex }}
            aria-pressed={current[key] === c.id}
            aria-label={`${caption} ${es ? c.es : c.en}`}
            data-nd-color={c.id}
            onClick={() => apply({ [key]: c.id })}
          />
        ))}
      </div>
    </div>
  );

  const tiles = (
    caption: string,
    list: ReadonlyArray<{ id: string; en: string; es: string }>,
    key: keyof NailState,
    preview: (id: string) => CSSProperties,
  ) => (
    <div className="sb-nd-group" role="group" aria-label={caption}>
      <p className="sb-nd-label">{caption}</p>
      <div className="sb-nd-tiles">
        {list.map((x) => (
          <button
            key={x.id}
            type="button"
            className="sb-nd-tile"
            aria-pressed={current[key] === x.id}
            data-nd-option={x.id}
            onClick={() => apply({ [key]: x.id })}
          >
            <i style={preview(x.id)} aria-hidden="true" />
            {es ? x.es : x.en}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="sb-nd-app" data-nd-app="nail-designer">
      <div className="sb-nd-stage" role="group" aria-label={t.stage}>
        <div className="sb-nd-hand">
          <div className="sb-nd-palm" aria-hidden="true" />
          <div className="sb-nd-fingers">
            {NAIL_FINGERS.map((f, i) => {
              const n = design.nails[i];
              const w = FINGER_W[i];
              const nh = w * 0.9 * len;
              const top = w * 0.9 + 3 - nh;
              const on = target === i;
              const fingerName = es ? f.es : f.en;
              return (
                <button
                  key={f.id}
                  type="button"
                  className={`sb-nd-finger sb-nd-f${i}`}
                  aria-pressed={on}
                  aria-label={`${es ? `Uña ${fingerName.toLowerCase()}` : `${fingerName} ${t.nail}`}${on ? `, ${t.selected}` : ""}`}
                  data-nd-finger={f.id}
                  onClick={() => setTarget((cur) => (cur === i ? null : i))}
                >
                  <span
                    className="sb-nd-nail"
                    style={{
                      top: `${top}cqw`,
                      height: `${nh}cqw`,
                      borderRadius: shape.radius,
                      clipPath: shape.clip,
                      background: `${nailShine(n.finish)}, ${nailArtBackground(n)}`,
                    }}
                  />
                  {n.charm !== "none" ? (
                    <span className="sb-nd-charm" style={{ top: `${top + nh * 0.55}cqw` }} aria-hidden="true">
                      <Charm id={n.charm} />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
        <p className="sb-nd-hint">{t.hint}</p>
        <div className="sb-nd-bar">
          <button type="button" className="sb-nd-btn" onClick={undo} disabled={history.length === 0} data-nd-action="undo">
            {t.undo}
          </button>
          <button type="button" className="sb-nd-btn" onClick={reset} data-nd-action="reset">
            {t.reset}
          </button>
          <button type="button" className="sb-nd-btn" onClick={surprise} data-nd-action="surprise">
            {t.surprise}
          </button>
        </div>
      </div>

      <div className="sb-nd-panel" role="group" aria-label={`${title ? `${title}. ` : ""}${t.controls}`}>
        <div className="sb-nd-group" role="group" aria-label={t.applyTo}>
          <p className="sb-nd-label">{t.applyTo}</p>
          <div className="sb-nd-seg">
            <button type="button" aria-pressed={target === null} onClick={() => setTarget(null)}>
              {t.all}
            </button>
            <button type="button" aria-pressed={target !== null} onClick={() => setTarget((cur) => cur ?? 2)}>
              {target === null ? nailLabel(NAIL_FINGERS, "middle", es) : oneName} {t.only}
            </button>
          </div>
        </div>

        {tabs.length ? (
          <div className="sb-nd-tabs" role="tablist" aria-label={t.controls}>
            {tabs.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`${uid}-tab-${id}`}
                aria-controls={`${uid}-panel`}
                aria-selected={activeTab === id}
                className="sb-nd-tab"
                onClick={() => setTab(id)}
              >
                {tabLabel(id)}
              </button>
            ))}
          </div>
        ) : null}

        <div role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${activeTab}`} className="sb-nd-panel">
          {activeTab === "color" ? (
            <>
              {swatches("c1", t.polish)}
              {swatches("c2", t.accent)}
            </>
          ) : null}
          {activeTab === "art"
            ? tiles(tabLabel("art"), offered.arts, "art", (id) => ({
                background: nailArtBackground({ ...current, art: id }, 0.5),
              }))
            : null}
          {activeTab === "finish"
            ? tiles(tabLabel("finish"), offered.finishes, "finish", (id) => ({
                background: `${nailShine(id)}, ${nailArtBackground(current, 0.5)}`,
              }))
            : null}
          {activeTab === "shape" ? (
            <>
              <div className="sb-nd-group" role="group" aria-label={tabLabel("shape")}>
                <p className="sb-nd-label">{tabLabel("shape")}</p>
                <div className="sb-nd-tiles">
                  {offered.shapes.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="sb-nd-tile"
                      aria-pressed={design.shape === s.id}
                      data-nd-option={s.id}
                      onClick={() => commit({ ...design, shape: s.id })}
                    >
                      <i
                        style={{
                          borderRadius: s.radius,
                          clipPath: s.clip,
                          background: `${nailShine(current.finish)}, ${nailArtBackground(current, 0.5)}`,
                        }}
                        aria-hidden="true"
                      />
                      {es ? s.es : s.en}
                    </button>
                  ))}
                </div>
              </div>
              <div className="sb-nd-group" role="group" aria-label={t.length}>
                <p className="sb-nd-label">{t.length}</p>
                <div className="sb-nd-tiles">
                  {NAIL_LENGTHS.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      className="sb-nd-tile"
                      aria-pressed={design.length === l.id}
                      data-nd-option={l.id}
                      onClick={() => commit({ ...design, length: l.id })}
                    >
                      {es ? l.es : l.en}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : null}
          {activeTab === "extras"
            ? tiles(t.charms, offered.charms, "charm", () => ({ background: "var(--token-color-line)" }))
            : null}
        </div>

        {sendWithBooking ? (
          <button type="button" className="sb-nd-btn sb-nd-cta" onClick={send} data-nd-action="send">
            {ctaLabel}
          </button>
        ) : null}
        <p className="sb-nd-live" role="status" aria-live="polite">
          {status}
        </p>
      </div>
    </div>
  );
}
