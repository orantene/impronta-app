"use client";

/**
 * ticket_picker v3: the checkout. A bottom sheet on a phone (92svh, drag
 * handle, swipe down to dismiss), a 480px right drawer on desktop, both over
 * a scrim. Body scroll is locked, focus is trapped, Escape and the scrim
 * close it, and focus returns to whatever opened it.
 *
 * Progress reads "Tickets → Details → Payment": the tickets were chosen on
 * the cards before this opened, Details is this form, Payment is the hop to
 * the card page (or the door hold / the free receipt). The order summary is
 * always visible above the form so the guest never pays for a number they
 * cannot see.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";

import type { PickerNight } from "@/app/(public)/_events/ticket-picker-actions";
import { formatWhen, money, type Locale } from "./ticket-picker-copy";
import { DetailsFields, SeatsSection, type DetailsState, type T } from "./ticket-picker-form";
import { orderTotalCents, type CheckoutStage, type TierView } from "./ticket-picker-steps";

const FOCUSABLE = 'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])';

export function CheckoutSheet({
  t, loc, title, currency, timeZone, night, tier, qty, stage, details, onDetails, emailError, ageGate, busy, refusal, canBuy, ctaLabel,
  pickedSeats, holdUntil, onToggleSeat, onHoldSeats, onBuy, onClose, onEditOrder, titleId,
}: {
  t: T;
  loc: Locale;
  title: string;
  currency: string;
  timeZone: string | null;
  night: PickerNight;
  tier: TierView;
  qty: number;
  stage: CheckoutStage;
  details: DetailsState;
  onDetails: (patch: Partial<DetailsState>) => void;
  emailError: string | null;
  ageGate: number | null;
  busy: boolean;
  refusal: string | null;
  canBuy: boolean;
  ctaLabel: ReactNode;
  pickedSeats: string[];
  holdUntil: string | null;
  onToggleSeat: (seatId: string, on: boolean) => void;
  onHoldSeats: () => void;
  onBuy: () => void;
  onClose: () => void;
  onEditOrder: () => void;
  titleId: string;
}) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{ start: number; dy: number } | null>(null);
  // The latest `onClose`, read by the one-time effect below so a new closure
  // on every render never re-locks the page or re-moves focus.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Focus in, trap Tab, Escape out, body scroll locked, focus restored.
  useEffect(() => {
    const opener = (typeof document !== "undefined" ? document.activeElement : null) as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = sheetRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onCloseRef.current(); return; }
      if (e.key !== "Tab" || !sheetRef.current) return;
      const nodes = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (nodes.length === 0) return;
      const head = nodes[0];
      const tail = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === head || !sheetRef.current.contains(active))) { e.preventDefault(); tail.focus(); }
      else if (!e.shiftKey && active === tail) { e.preventDefault(); head.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, []);

  const total = orderTotalCents(tier, qty);
  const totalLabel = money(total, currency, loc, t("free"));
  const stages: Array<[CheckoutStage, string]> = [["tickets", t("stage_tickets")], ["details", t("stage_details")], ["pay", t("stage_pay")]];
  const order: CheckoutStage[] = ["tickets", "details", "pay"];
  const state = (s: CheckoutStage) => (order.indexOf(s) < order.indexOf(stage) ? "done" : s === stage ? "current" : "todo");

  return (
    <>
      <div className="tp-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={sheetRef}
        className="tp-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-ticket-picker="sheet"
        data-testid="ticket-checkout"
        style={drag && drag.dy > 0 ? { transform: `translateY(${drag.dy}px)`, transition: "none" } : undefined}
        onTouchStart={(e) => {
          // Only a drag that starts on the handle / head dismisses; the body scrolls.
          const target = e.target as HTMLElement;
          if (!target.closest(".tp-grab, .tp-sheet-head")) return;
          setDrag({ start: e.touches[0].clientY, dy: 0 });
        }}
        onTouchMove={(e) => { if (drag) setDrag({ start: drag.start, dy: Math.max(0, e.touches[0].clientY - drag.start) }); }}
        onTouchEnd={() => { if (drag && drag.dy > 110) onClose(); setDrag(null); }}
      >
        <div className="tp-grab" aria-hidden="true" />
        <div className="tp-sheet-head">
          <span className="tp-title" id={titleId}>{title}</span>
          <button type="button" className="tp-close" data-testid="ticket-checkout-close" onClick={onClose}>{t("close")}</button>
        </div>
        <div className="tp-sheet-body">
          <ol className="tp-progress" aria-label={t("heading")}>
            {stages.map(([s, label]) => <li key={s} data-state={state(s)} aria-current={s === stage ? "step" : undefined}>{label}</li>)}
          </ol>

          <div className="tp-summary" data-testid="ticket-order-summary">
            <div className="tp-summary-row" data-muted="1">
              <span>{t("ticketsFor")} {formatWhen(night.startsAt, timeZone, loc)}</span>
            </div>
            <div className="tp-summary-row">
              <span>{qty} × {tier.label}</span>
              <span>{money(tier.amountCents * qty, currency, loc, t("free"))}</span>
            </div>
            {tier.admitsPerUnit > 1 ? (
              <div className="tp-summary-row" data-muted="1"><span>{t("admits").replace("{n}", String(tier.admitsPerUnit * qty))}</span></div>
            ) : null}
            <div className="tp-summary-row" data-muted="1">
              <span>{t("subtotal")}</span>
              <span>{totalLabel}</span>
            </div>
            <div className="tp-summary-row" data-total="1">
              <span>{t("total")}</span>
              <b data-testid="ticket-order-total">{totalLabel}</b>
            </div>
            <button type="button" className="tp-cta-ghost" data-testid="ticket-edit-order" onClick={onEditOrder} disabled={busy}>{t("editOrder")}</button>
          </div>

          <SeatsSection t={t} night={night} pickedSeats={pickedSeats} busy={busy} holdUntil={holdUntil} onToggle={onToggleSeat} onHold={onHoldSeats} />

          <div className="tp-fields">
            <DetailsFields
              t={t}
              state={details}
              onChange={onDetails}
              busy={busy}
              emailError={emailError}
              showPhone
              doorOffered={night.door.offered}
              ageGate={ageGate}
              emailId={`${titleId}-email`}
            />
            <p className="tp-fine">{t("howItWorks")}</p>
            {refusal ? <div className="tp-alert" data-ticket-picker="refusal" role="alert">{refusal}</div> : null}
            <div className="tp-actions">
              <button type="button" className="tp-cta" data-testid="ticket-pay" data-busy={busy ? "1" : undefined} onClick={onBuy} disabled={!canBuy} aria-busy={busy || undefined}>
                {busy ? <span className="tp-spinner" aria-hidden="true" /> : null}
                {ctaLabel}
              </button>
              <button type="button" className="tp-back" onClick={onEditOrder} disabled={busy}>‹ {t("back")}</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
