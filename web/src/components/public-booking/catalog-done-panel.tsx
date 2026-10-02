"use client";

import type { deriveGuestBookingPresentation } from "@/lib/booking/guest-booking-presentation";
import type { CatalogBookingDetail } from "./CatalogBookingSheet";

/** The "done" step body of the catalog booking sheet (split out for max-lines). */
export function CatalogDonePanel({
  detail, es, slotLabel, variantLabel, extraLabels, isQuote, totalLabel,
  doneStatus, nextActionCopy, showDemoNote,
}: {
  detail: CatalogBookingDetail;
  es: boolean;
  slotLabel: string | null;
  variantLabel: string | null;
  extraLabels: string[];
  isQuote: boolean;
  totalLabel: string;
  doneStatus: ReturnType<typeof deriveGuestBookingPresentation>;
  nextActionCopy: string;
  showDemoNote: boolean;
}) {
  return (
    <div className="jb-done">
      <div className="jb-check" aria-hidden="true">
        ✓
      </div>
      <h3>{slotLabel}</h3>
      <p>
        {detail.title}
        {variantLabel ? ` · ${variantLabel}` : ""}
        {extraLabels.length ? ` · ${extraLabels.join(", ")}` : ""}
        {isQuote ? ` · ${es ? "A cotizar" : "Quote"}` : ` · ${totalLabel}`}
      </p>
      {doneStatus.detail ? <p className="jb-fixture" data-catalog-done-state={doneStatus.bookingState}>{doneStatus.detail}</p> : null}
      <p className="jb-fixture" data-catalog-done-next="">
        {nextActionCopy}
      </p>
      {showDemoNote ? (
        <p className="jb-demo" data-catalog-demo-note="">
          {es
            ? "Demostración: aquí no se guarda nada."
            : "Preview: nothing is saved here."}
        </p>
      ) : null}
    </div>
  );
}

/** The dialog header (kicker, title, close button). */
export function CatalogSheetHeader({
  kicker, title, closeLabel, onClose,
}: {
  kicker: string;
  title: string;
  closeLabel: string;
  onClose: () => void;
}) {
  return (
    <header className="jb-head">
      <div>
        <p className="jb-kicker">{kicker}</p>
        <h2>{title}</h2>
      </div>
      <button type="button" className="jb-x" onClick={onClose} aria-label={closeLabel}>
        ✕
      </button>
    </header>
  );
}
