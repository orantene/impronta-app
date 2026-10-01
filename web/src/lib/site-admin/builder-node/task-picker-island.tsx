"use client";

/**
 * Task picker island (W-11). Selection state only: the server already sent the
 * whole model, and every task is a real <button> in the first paint, so a
 * crawler (or a visitor before hydration) sees all of them.
 *
 * Each button carries `aria-pressed`. The recommendation card sits in a polite
 * live region; with nothing picked it shows the fallback (the inspection).
 * Actions reuse the services catalog entry: the same `tulala:offering-*`
 * window events the catalog rows dispatch, with the same detail. The bridge
 * that pre-fills the brief with the task is a later slice.
 */
import { useState } from "react";

import { deriveOfferingCta, offeringCtaLabel } from "@/lib/talent/offering-cta-derivation";
import type { TalentOffering } from "@/lib/talent/offerings-types";

import { BuilderIconSvg } from "./builder-icon-svg";
import { detailFor } from "./services-catalog-filter";
import type { TaskPickerModel } from "./task-picker-recommend";

type Props = {
  model: TaskPickerModel;
  locale: string;
  confirmsByHand: boolean;
  bookingPosture: "instant" | "request" | "inquiry";
};

const COPY = {
  en: { fit: "A good fit", price: "Price", duration: "Duration", mode: "How it works", details: "Details" },
  es: { fit: "Te conviene", price: "Precio", duration: "Duración", mode: "Agenda", details: "Detalles" },
};

export function TaskPickerIsland({ model, locale, confirmsByHand, bookingPosture }: Props) {
  const es = locale.toLowerCase().startsWith("es");
  const t = es ? COPY.es : COPY.en;
  const [picked, setPicked] = useState<string | null>(null);

  const task = model.tasks.find((x) => x.id === picked) ?? null;
  const offeringId = task ? task.offeringId : (model.fallback?.offeringId ?? null);
  const card = offeringId ? model.cards[offeringId] : undefined;
  const offering: TalentOffering | undefined = offeringId
    ? model.offerings.find((o) => o.id === offeringId)
    : undefined;
  const isFallback = !task;
  const derived = offering
    ? deriveOfferingCta({ offering, defaults: { bookingPosture }, confirmsByHand })
    : null;

  const dispatch = (eventName: string) => {
    if (!offering) return;
    window.dispatchEvent(
      new CustomEvent(eventName, { detail: detailFor(offering, confirmsByHand, bookingPosture) }),
    );
  };

  return (
    <div className="sb-tp-body">
      <div className="sb-tp-tasks">
        {model.tasks.map((x) => (
          <button
            key={x.id}
            type="button"
            className="sb-tp-task"
            data-task-id={x.id}
            aria-pressed={picked === x.id}
            onClick={() => setPicked((cur) => (cur === x.id ? null : x.id))}
          >
            {x.icon ? <BuilderIconSvg name={x.icon} className="sb-tp-ic" /> : <span className="sb-tp-ic" aria-hidden="true" />}
            <span>{x.label}</span>
          </button>
        ))}
      </div>
      <div aria-live="polite" className="sb-tp-live">
        {card ? (
          <div className={`sb-tp-rec${isFallback ? " sb-tp-rec0" : ""}`} data-rec={isFallback ? "default" : "task"}>
            <div className="sb-tp-rec-h">
              <span>{isFallback ? (model.fallback?.kicker ?? "") : t.fit}</span>
              {card.category ? <span>{card.category}</span> : null}
            </div>
            <div className="sb-tp-rec-b">
              <h3>{card.name}</h3>
              {(isFallback ? model.fallback?.hint : task?.hint) ? (
                <p>{isFallback ? model.fallback?.hint : task?.hint}</p>
              ) : null}
              <dl>
                <dt>{t.price}</dt>
                <dd>{card.priceLabel}</dd>
                {card.duration ? (
                  <>
                    <dt>{t.duration}</dt>
                    <dd>{card.duration}</dd>
                  </>
                ) : null}
                <dt>{t.mode}</dt>
                <dd data-mode={card.mode}>{card.modeLabel}</dd>
              </dl>
              {derived && !derived.hidden ? (
                <div className="sb-tp-row">
                  {isFallback ? null : (
                    <button type="button" className="sb-tp-btn sb-tp-ghost" data-tp-action="details" onClick={() => dispatch("tulala:offering-request")}>
                      {t.details}
                    </button>
                  )}
                  <button
                    type="button"
                    className="sb-tp-btn"
                    data-tp-action="primary"
                    data-offering-cta={derived.cta}
                    data-offering-id={offering?.id}
                    onClick={() => dispatch(derived.eventName)}
                  >
                    {offeringCtaLabel(derived.cta, locale, "card")}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
