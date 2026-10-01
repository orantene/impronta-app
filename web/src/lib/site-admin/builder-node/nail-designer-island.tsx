"use client";

/**
 * Nail Designer island: the owner's Nail Studio design (Main.dc.html desktop,
 * Mobile.dc.html embed) ported to React with the same DOM, SVG artwork, state
 * and interactions. One DOM serves both boards; the scoped CSS switches
 * between them by the block's own container width.
 *
 * State is local (no network, no storage). "Send my design" hands a plain-text
 * summary to the site's EXISTING contact flow through the `tulala:ask-question`
 * window event the Maison "Ask" buttons use; nothing is sent until the visitor
 * submits there. First paint is the full interactive markup (real buttons).
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { PlusIcon, ResetIcon, ShuffleIcon, Sticker, UndoIcon } from "./nail-designer-art";
import { NAIL_COPY } from "./nail-designer-copy";
import {
  NAIL_FINGERS,
  NAIL_HISTORY_MAX,
  NAIL_LOOKS_MAX,
  NAIL_SHAPES,
  NAIL_STARTER_LOOKS,
  cloneNails,
  nailDesignSummary,
  nailLengthFactor,
  patchNails,
  starterNailDesign,
  surpriseNailDesign,
  type NailDesign,
  type NailLook,
  type NailState,
} from "./nail-designer-model";
import { nailPatternBg, nailShine } from "./nail-designer-paint";
import { LookButton, NailPanel, type NailTab, type PanelActions } from "./nail-designer-panels";

type Target = "all" | "one";
type S = {
  design: NailDesign;
  target: Target;
  sel: number | null;
  tab: NailTab;
  history: NailDesign[];
  looks: NailLook[];
  toast: string;
};

const TABS: ReadonlyArray<NailTab> = ["color", "art", "finish", "shape", "extras", "looks"];

type Props = { locale: string; ctaLabel: string };

export function NailDesignerIsland({ locale, ctaLabel }: Props) {
  const es = locale.toLowerCase().startsWith("es");
  const t = es ? NAIL_COPY.es : NAIL_COPY.en;
  const [s, setS] = useState<S>(() => ({
    design: starterNailDesign(),
    target: "all",
    sel: null,
    tab: "color",
    history: [],
    looks: [...NAIL_STARTER_LOOKS],
    toast: "",
  }));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const merge = (patch: Partial<S>) => setS((p) => ({ ...p, ...patch }));
  const snap = (p: S): NailDesign[] => [...p.history, p.design].slice(-NAIL_HISTORY_MAX);
  const flash = (msg: string) => {
    merge({ toast: msg });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => merge({ toast: "" }), 1800);
  };

  const apply = (patch: Partial<NailState>, quiet?: boolean) =>
    setS((p) => ({
      ...p,
      design: { ...p.design, nails: patchNails(p.design.nails, p.target === "all" ? null : p.sel, patch) },
      history: quiet ? p.history : snap(p),
    }));
  const setGlobal = (patch: Partial<NailDesign>) =>
    setS((p) => ({ ...p, design: { ...p.design, ...patch }, history: snap(p) }));
  const undo = () =>
    setS((p) => {
      const last = p.history[p.history.length - 1];
      return last ? { ...p, design: last, history: p.history.slice(0, -1) } : p;
    });
  const reset = () => {
    setS((p) => {
      const start = starterNailDesign();
      return {
        ...p,
        design: { ...p.design, nails: start.nails, shape: start.shape, length: start.length },
        target: "all",
        sel: null,
        history: snap(p),
      };
    });
    flash(t.toastReset);
  };
  const selectNail = (i: number) =>
    setS((p) => (p.target === "one" && p.sel === i ? { ...p, target: "all", sel: null } : { ...p, target: "one", sel: i }));
  const setTarget = (target: Target) =>
    setS((p) => ({ ...p, target, sel: target === "one" ? (p.sel == null ? 2 : p.sel) : null }));
  const randomize = () =>
    setS((p) => {
      const r = surpriseNailDesign();
      return { ...p, design: { ...p.design, nails: r.nails, shape: r.shape }, history: snap(p) };
    });
  const save = () => {
    const n = s.looks.length - NAIL_STARTER_LOOKS.length + 1;
    const look: NailLook = {
      name: `${NAIL_COPY.en.myLook} ${n}`,
      nameEs: `${NAIL_COPY.es.myLook} ${n}`,
      shape: s.design.shape,
      length: s.design.length,
      nails: cloneNails(s.design.nails),
    };
    merge({ looks: [look, ...s.looks].slice(0, NAIL_LOOKS_MAX) });
    flash(`${t.toastSaved} “${es ? look.nameEs : look.name}”`);
  };
  const loadLook = (l: NailLook) => {
    setS((p) => ({
      ...p,
      design: { ...p.design, nails: cloneNails(l.nails), shape: l.shape, length: l.length },
      target: "all",
      sel: null,
      history: snap(p),
    }));
    flash(`${t.toastApplied} “${es ? l.nameEs : l.name}”`);
  };
  const send = () => {
    window.dispatchEvent(
      new CustomEvent("tulala:ask-question", {
        detail: {
          message: nailDesignSummary(s.design, locale),
          offeringId: null,
          offeringTitle: null,
          from: "app_nail_designer",
        },
      }),
    );
    flash(t.toastSent);
  };

  const { design } = s;
  const shape = NAIL_SHAPES.find((x) => x.id === design.shape) ?? NAIL_SHAPES[0];
  const cur = s.target === "one" && s.sel != null ? design.nails[s.sel] : design.nails[2];
  const selName = s.sel != null ? (es ? NAIL_FINGERS[s.sel].es : NAIL_FINGERS[s.sel].en) : null;
  const actions: PanelActions = {
    apply,
    setShape: (shapeId) => setGlobal({ shape: shapeId }),
    setLength: (lengthId) => setGlobal({ length: lengthId }),
    setSkin: (skin) => merge({ design: { ...design, skin } }),
    loadLook,
  };
  const tabLabel = (id: NailTab) => t.tabs[id];
  const rootStyle = { "--k": nailLengthFactor(design.length), "--nd-skin": design.skin } as CSSProperties;

  const surpriseBtn = (cls: string) => (
    <button type="button" className={`nd-act nd-ghost ${cls}`} data-nd-action="surprise" onClick={randomize}>
      <ShuffleIcon />
      {t.surprise}
    </button>
  );
  const saveBtn = (cls: string) => (
    <button type="button" className={`nd-act nd-accentbtn ${cls}`} data-nd-action="save" onClick={save}>
      <PlusIcon />
      {t.save}
    </button>
  );

  return (
    <div className="nd-root" style={rootStyle} data-nd-app="nail-designer">
      <section className="nd-main">
        <header className="nd-head">
          <div className="nd-brandbox">
            <div className="nd-brand">
              Nail <em>Studio</em>
            </div>
            <div className="nd-sub">{t.sub}</div>
          </div>
          <div className="nd-tools">
            <button
              type="button"
              className="nd-pill"
              aria-label={t.undo}
              disabled={s.history.length === 0}
              data-nd-action="undo"
              onClick={undo}
            >
              <UndoIcon />
              <span className="nd-pill-t">{t.undo}</span>
            </button>
            <button type="button" className="nd-pill" aria-label={t.reset} data-nd-action="reset" onClick={reset}>
              <ResetIcon />
              <span className="nd-pill-t">{t.reset}</span>
            </button>
          </div>
        </header>
        <div className="nd-boardwrap">
          <div className="nd-board">
            <div className="nd-edit">
              <i />
              {`${t.editing} · ${s.target === "all" ? t.allNails : `${selName} ${t.nailWord}`}`}
            </div>
            <div className="nd-hand">
              {NAIL_FINGERS.map((F, i) => {
                const n = design.nails[i];
                const on = s.target === "one" && s.sel === i;
                const fname = es ? F.es : F.en;
                const style = { "--w": F.w, "--h": F.h, "--rot": F.rot, "--tx": F.tx, "--ty": F.ty } as CSSProperties;
                return (
                  <div key={F.id} className="nd-fing" style={style}>
                    <div className="nd-fskin" />
                    <div className="nd-crease" />
                    <button
                      type="button"
                      className="nd-fbtn"
                      data-nd-finger={F.id}
                      aria-label={`${es ? `${t.nailWord} ${fname.toLowerCase()}` : `${fname} ${t.nailWord}`}${on ? `, ${t.selected}` : ""}`}
                      aria-pressed={on}
                      style={{ borderRadius: shape.radius }}
                      onClick={() => selectNail(i)}
                    >
                      <span
                        className="nd-nailface"
                        style={{ borderRadius: shape.radius, clipPath: shape.clip, background: nailPatternBg(n, 1) }}
                      >
                        <span className="nd-shine" style={{ background: nailShine(n.finish) }} />
                      </span>
                      <span className="nd-stk">
                        <Sticker id={n.sticker} />
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
            {s.toast ? (
              <div className="nd-toast" role="status">
                {s.toast}
              </div>
            ) : null}
            <div className="nd-hint">{t.hint}</div>
          </div>
        </div>
        <div className="nd-looksrow">
          <div className="nd-lookscroll">
            {s.looks.map((l, i) => (
              <LookButton key={`${l.name}-${i}`} look={l} es={es} onPick={() => loadLook(l)} />
            ))}
          </div>
          <div className="nd-desk-acts">
            {surpriseBtn("")}
            {saveBtn("")}
          </div>
        </div>
      </section>
      <aside className="nd-side">
        <div className="nd-ctl">
          <div className="nd-applylabel">{t.applyTo}</div>
          <div className="nd-seg">
            <button type="button" className="nd-segbtn" aria-pressed={s.target === "all"} data-nd-target="all" onClick={() => setTarget("all")}>
              {t.allNails}
            </button>
            <button type="button" className="nd-segbtn" aria-pressed={s.target === "one"} data-nd-target="one" onClick={() => setTarget("one")}>
              {selName ? `${selName} ${t.only}` : t.oneNail}
            </button>
          </div>
          <div className="nd-tabs">
            {TABS.map((id) => (
              <button
                key={id}
                type="button"
                className={id === "looks" ? "nd-tab nd-mobonly" : "nd-tab"}
                aria-pressed={s.tab === id}
                data-nd-tab={id}
                onClick={() => merge({ tab: id })}
              >
                {tabLabel(id)}
              </button>
            ))}
          </div>
        </div>
        <div className="nd-panel">
          <NailPanel
            tab={s.tab}
            cur={cur}
            shape={design.shape}
            length={design.length}
            skin={design.skin}
            looks={s.looks}
            es={es}
            t={t}
            actions={actions}
          />
        </div>
        <div className="nd-foot">
          {surpriseBtn("nd-mobonly")}
          {saveBtn("nd-mobonly")}
          <button type="button" className="nd-act nd-send" data-nd-action="send" onClick={send}>
            {ctaLabel}
          </button>
        </div>
      </aside>
    </div>
  );
}
