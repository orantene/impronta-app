"use client";

import type { ReactNode } from "react";

/** The catalog booking sheet footer: total plus the step's primary action (split out for max-lines). */
export function CatalogSheetFooter({
  step, es, totalLabel, onContinueChoose, chooseDisabled, chooseLabel,
  whenReady, onContinueWhen, whoCta, onDone,
}: {
  step: "choose" | "when" | "who" | "done";
  es: boolean;
  /** The footer total line (null on done). */
  totalLabel: ReactNode;
  onContinueChoose: () => void;
  chooseDisabled: boolean;
  chooseLabel: string;
  whenReady: boolean;
  onContinueWhen: () => void;
  /** The who-step primary button, built by the sheet (it owns confirm/chat). */
  whoCta: ReactNode;
  onDone: () => void;
}) {
  return (
    <footer className="jb-foot">
      {step !== "done" ? (
        <div className="jb-total">
          <span>Total</span>
          {totalLabel}
        </div>
      ) : (
        <span />
      )}
      {step === "choose" ? (
        <button type="button" className="jb-cta" data-catalog-continue="choose" disabled={chooseDisabled} onClick={onContinueChoose}>
          {chooseLabel}
        </button>
      ) : null}
      {step === "when" ? (
        <button
          type="button"
          className="jb-cta"
          data-catalog-continue="when"
          disabled={!whenReady}
          aria-describedby={whenReady ? undefined : "jb-when-hint"}
          onClick={onContinueWhen}
        >
          {es ? "Continuar" : "Continue"}
        </button>
      ) : null}
      {step === "who" ? whoCta : null}
      {step === "done" ? (
        <button type="button" className="jb-cta" onClick={onDone}>
          {es ? "Listo" : "Done"}
        </button>
      ) : null}
    </footer>
  );
}
