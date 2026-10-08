"use client";

/**
 * A solo talent's one action on an ACCEPTED offer: "Confirm booking and request
 * payment" (es: "Confirmar reserva y pedir pago"). Sits above the Messages
 * shell like `TalentDecisionBar`, so it carries its own `msgv5` scope (the kit's
 * `.btn` styles are scoped `.msgv5 .btn`).
 *
 * The control only RENDERS what the server decided: `messagingTalentConfirmBookingState`
 * verifies she is the owner/seller and reads the offer, booking and payment card.
 * The button calls `messagingTalentConfirmBooking`, which runs the engine's own
 * accept-to-payment function (see lib/messaging/talent-confirm-booking.ts).
 *
 * `TalentConfirmBookingView` is the pure, prop-driven half (the render tests
 * target it); `TalentConfirmBookingBar` is the thin stateful wrapper.
 */

import { useCallback, useEffect, useState } from "react";

import type { ConfirmBookingState } from "@/lib/messages-v5/confirm-booking-state";
import { confirmBookingCopy, fillAmount, type ConfirmBookingCopy } from "@/lib/messaging/talent-confirm-booking-copy";
import type { ConfirmBookingResult } from "@/lib/messaging/talent-confirm-booking";
import { messagingTalentConfirmBooking, messagingTalentConfirmBookingState } from "@/lib/server-actions/messaging-talent-confirm-booking";

import { Btn } from "../kit/primitives";

export type ConfirmBookingPhase = "idle" | "confirming" | "busy";

export type TalentConfirmBookingViewProps = {
  readonly state: ConfirmBookingState;
  readonly copy: ConfirmBookingCopy;
  /** What the client will be asked for; null when nothing is collected online. */
  readonly amountLabel: string | null;
  readonly collect: "none" | "deposit" | "full" | null;
  readonly phase: ConfirmBookingPhase;
  /** Sentence under the control after a failed attempt. */
  readonly error: string | null;
  readonly onOpen: () => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
};

export function TalentConfirmBookingView(props: TalentConfirmBookingViewProps) {
  const { state, copy, amountLabel, collect, phase, error, onOpen, onConfirm, onCancel } = props;
  if (state === "hidden") return null;

  if (state === "done") {
    return (
      <div data-talent-confirm-booking="done" className="msgv5 flex gap-2 px-3 py-2">
        <div className="okline" role="status" data-confirm-booking-done>
          {collect === "none" ? copy.doneInPerson : copy.done}
        </div>
      </div>
    );
  }

  const retry = state === "retry_payment";
  const body =
    collect === "none" || !amountLabel
      ? copy.dialogBodyInPerson
      : fillAmount(retry ? copy.dialogBodyRetry : copy.dialogBody, amountLabel);

  return (
    <div data-talent-confirm-booking={state} className="msgv5 flex flex-col gap-2 px-3 py-2">
      {phase === "idle" ? (
        <div className="flex gap-2">
          <Btn size="sm" variant="primary" onClick={onOpen} data-confirm-booking-open>
            {retry ? copy.retryButton : copy.button}
          </Btn>
        </div>
      ) : (
        <div role="dialog" aria-label={copy.dialogTitle} className="flex flex-col gap-2" data-confirm-booking-dialog>
          <b>{copy.dialogTitle}</b>
          <p data-confirm-booking-body>{body}</p>
          <div className="flex gap-2">
            <Btn size="sm" variant="primary" busy={phase === "busy"} onClick={onConfirm} data-confirm-booking-go>
              {copy.confirm}
            </Btn>
            <Btn size="sm" disabled={phase === "busy"} onClick={onCancel} data-confirm-booking-cancel>
              {copy.cancel}
            </Btn>
          </div>
        </div>
      )}
      {error ? (
        <div className="refuse" role="alert" data-confirm-booking-error>
          <b>{error}</b>
        </div>
      ) : null}
    </div>
  );
}

const REFRESH_MS = 45_000;

export function TalentConfirmBookingBar({
  inquiryId,
  locale,
  onToast,
}: {
  inquiryId: string | null;
  locale: string;
  onToast: (message: string) => void;
}) {
  const copy = confirmBookingCopy(locale);
  const [view, setView] = useState<{ state: ConfirmBookingState; amountLabel: string | null; collect: "none" | "deposit" | "full" | null }>({
    state: "hidden",
    amountLabel: null,
    collect: null,
  });
  const [phase, setPhase] = useState<ConfirmBookingPhase>("idle");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!inquiryId) return;
    const res = await messagingTalentConfirmBookingState({ inquiryId });
    // An unreadable state keeps what is on screen; it never invents a button.
    if (res.ok) setView({ state: res.view.state, amountLabel: res.view.amountLabel, collect: res.view.collect });
  }, [inquiryId]);

  useEffect(() => {
    setView({ state: "hidden", amountLabel: null, collect: null });
    setPhase("idle");
    setError(null);
    if (!inquiryId) return;
    let cancelled = false;
    void messagingTalentConfirmBookingState({ inquiryId }).then((res) => {
      if (!cancelled && res.ok) setView({ state: res.view.state, amountLabel: res.view.amountLabel, collect: res.view.collect });
    });
    // The client may accept while the thread is open: look again now and then.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [inquiryId, refresh]);

  const confirm = () => {
    if (!inquiryId) return;
    setPhase("busy");
    setError(null);
    void messagingTalentConfirmBooking({ inquiryId }).then(async (res: ConfirmBookingResult) => {
      if (res.ok) {
        onToast(res.payInPerson ? copy.toastOkInPerson : copy.toastOk);
        setPhase("idle");
        await refresh();
        return;
      }
      const message = copy.errors[res.error];
      onToast(message);
      setError(message);
      setPhase("idle");
      // A failed payment request leaves the booking standing: show "retry", not "confirm".
      await refresh();
    });
  };

  return (
    <TalentConfirmBookingView
      state={view.state}
      copy={copy}
      amountLabel={view.amountLabel}
      collect={view.collect}
      phase={phase}
      error={error}
      onOpen={() => setPhase("confirming")}
      onConfirm={confirm}
      onCancel={() => setPhase("idle")}
    />
  );
}
