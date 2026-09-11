"use client";

/**
 * DisplayClient — the customer display, wired.
 *
 * Every pixel is `CustomerDisplay` (props in, callbacks out); every read is
 * `posDisplayRead`, the counter's own reader behind the counter's own guard;
 * the one write is `posDisplayEmailReceipt`. This file holds the display's
 * state: which sale it follows, what the last tick said, and the three local
 * steps (confirm, receipt contact, sent) the customer takes on this screen.
 *
 * POLLING, ON PURPOSE. One read every two seconds, from a device the
 * workspace owns, is what a second screen costs today; there is no realtime
 * channel to add and none is added. The `storage` event makes a same-device
 * counter's beacon land at once rather than on the next tick.
 *
 * WHICH SALE. `nextFollowedOrder` decides: the counter's beacon on this
 * device first, the workspace's newest open sale otherwise, and never a sale
 * this display has just finished with. The address bar's `?order=` seeds the
 * first tick so the counter can open the display already pointed at the sale
 * it has up.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { CustomerDisplay, type CustomerDisplayReceiptOutcome, type CustomerDisplayScreen } from "@/components/admin/pos/CustomerDisplay";
import type { CustomerDisplayCopy } from "@/components/admin/pos/customer-display-copy";
import { displayStateFor, nextFollowedOrder } from "@/lib/pos/display-model";

import { posDisplayEmailReceipt, posDisplayRead, type PosDisplaySale } from "./actions";
import { readDisplayBeacon } from "./display-beacon";

export const DISPLAY_POLL_MS = 2_000;
/** D07: "This screen clears in a moment" — how long the thank-you stays without a tap. */
const PAID_CLEARS_AFTER_MS = 45_000;
/** After a receipt is sent, how long the confirmation stays. */
const SENT_CLEARS_AFTER_MS = 8_000;

export type DisplayClientProps = {
  tenantId: string;
  workspaceName: string;
  initialOrderId: string | null;
  copy: CustomerDisplayCopy;
};

type LocalStep = "confirm" | "contact" | "sent" | null;

export function DisplayClient(props: DisplayClientProps) {
  const [followed, setFollowed] = useState<string | null>(props.initialOrderId);
  const [sale, setSale] = useState<PosDisplaySale | null>(null);
  const [workspaceName, setWorkspaceName] = useState(props.workspaceName);
  const [lost, setLost] = useState(false);
  const [step, setStep] = useState<LocalStep>(null);
  const [declinedSeenAtVersion, setDeclinedSeenAtVersion] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [receiptOutcome, setReceiptOutcome] = useState<CustomerDisplayReceiptOutcome | null>(null);

  // Refs mirror the state the tick needs, so the interval never reads a
  // stale closure and never has to be re-created on every change.
  const followedRef = useRef(followed);
  useEffect(() => {
    followedRef.current = followed;
  }, [followed]);
  const finishedRef = useRef<string | null>(null);
  const inFlight = useRef(false);

  /** Done with this sale: clear the screen and never re-adopt it. */
  const finish = useCallback((orderId: string | null) => {
    finishedRef.current = orderId;
    setFollowed(null);
    setSale(null);
    setStep(null);
    setEmail("");
    setReceiptOutcome(null);
    setDeclinedSeenAtVersion(null);
  }, []);

  const tick = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const current = followedRef.current;
      const result = await posDisplayRead({ orderId: current });
      if (!result.ok) {
        setLost(true);
        return;
      }
      setLost(false);
      setWorkspaceName(result.workspaceName);
      const next = nextFollowedOrder({
        beacon: readDisplayBeacon(props.tenantId),
        newestOpen: result.newestOpenOrderId,
        finished: finishedRef.current,
      });
      if (next !== current) {
        // A different sale from the next tick on. Local steps belong to the
        // sale they were taken on, so they go with it.
        followedRef.current = next;
        setFollowed(next);
        setSale(null);
        setStep(null);
        setReceiptOutcome(null);
        setDeclinedSeenAtVersion(null);
        return;
      }
      setSale(result.sale);
    } finally {
      inFlight.current = false;
    }
  }, [props.tenantId]);

  useEffect(() => {
    void tick();
    const timer = window.setInterval(() => void tick(), DISPLAY_POLL_MS);
    const onStorage = () => void tick();
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", onStorage);
    };
  }, [tick]);

  const engineState = displayStateFor({
    sale: sale
      ? { orderId: sale.orderId, version: sale.version, paymentState: sale.paymentState, lineCount: sale.lines.length }
      : null,
    latestTransaction: sale?.latestTransaction ?? null,
    declinedSeenAtVersion,
  });

  // Remember the version a decline was first seen at, and forget it once a
  // new attempt is in flight, so the NEXT decline reads as one too.
  useEffect(() => {
    if (engineState === "declined" && declinedSeenAtVersion === null && sale) {
      setDeclinedSeenAtVersion(sale.version);
    } else if (engineState === "waiting" && declinedSeenAtVersion !== null) {
      setDeclinedSeenAtVersion(null);
    }
  }, [engineState, declinedSeenAtVersion, sale]);

  // The local steps only make sense on the engine state they were taken from.
  useEffect(() => {
    if (step === "confirm" && engineState !== "review") setStep(null);
    if ((step === "contact" || step === "sent") && engineState !== "paid") setStep(null);
  }, [step, engineState]);

  // D07 clears on its own after a while; a sent receipt clears sooner.
  const paidOrderId = engineState === "paid" && sale ? sale.orderId : null;
  useEffect(() => {
    if (!paidOrderId) return;
    if (step === "contact") return;
    const ms = step === "sent" ? SENT_CLEARS_AFTER_MS : PAID_CLEARS_AFTER_MS;
    const timer = window.setTimeout(() => finish(paidOrderId), ms);
    return () => window.clearTimeout(timer);
  }, [paidOrderId, step, finish]);

  const screen: CustomerDisplayScreen =
    engineState === "review" && step === "confirm"
      ? "confirm"
      : engineState === "paid" && (step === "contact" || step === "sent")
        ? step
        : engineState;

  const send = useCallback(async () => {
    if (!sale || sending) return;
    setSending(true);
    setReceiptOutcome(null);
    try {
      const result = await posDisplayEmailReceipt({ orderId: sale.orderId, email: email.trim() });
      if (result.ok) {
        setReceiptOutcome({ kind: result.status, email: email.trim() });
        setStep("sent");
        return;
      }
      const sentence =
        result.reason === "invalid"
          ? props.copy.refusalInvalidEmail
          : result.reason === "not_paid"
            ? props.copy.refusalNotPaid
            : result.reason === "send_failed"
              ? props.copy.refusalSendFailed
              : result.reason === "not_allowed"
                ? props.copy.notAllowed
                : props.copy.refusalUnavailable;
      setReceiptOutcome({ kind: "refused", sentence });
    } finally {
      setSending(false);
    }
  }, [email, props.copy, sale, sending]);

  const paidVia: "cash" | "card" | null =
    sale?.latestTransaction?.paidVia === "cash"
      ? "cash"
      : sale?.latestTransaction?.paidVia
        ? "card"
        : null;

  return (
    // Above every piece of workspace chrome (the shell's highest layer is
    // z-[300]): the person reading this screen is a customer, and the top
    // bar's Workspace/Counter switch is not theirs to see.
    <div className="fixed inset-0 z-[400] overflow-y-auto bg-admin-surface">
      <CustomerDisplay
        screen={screen}
        workspaceName={workspaceName}
        sale={
          sale
            ? {
                currency: sale.currency,
                lines: sale.lines,
                subtotalCents: sale.subtotalCents,
                discountCents: sale.discountCents,
                totalCents: sale.totalCents,
                depositPaidCents: sale.depositPaidCents,
                outstandingCents: sale.outstandingCents,
                customerName: sale.customerName,
                paidVia,
              }
            : null
        }
        copy={props.copy}
        connectionLost={lost}
        onLooksRight={() => setStep("confirm")}
        onBack={() => setStep(null)}
        onEmailMe={() => {
          setReceiptOutcome(null);
          setStep("contact");
        }}
        onNoReceipt={() => finish(sale?.orderId ?? null)}
        email={email}
        onEmailChange={setEmail}
        onSend={() => void send()}
        sending={sending}
        receiptOutcome={receiptOutcome}
      />
    </div>
  );
}
