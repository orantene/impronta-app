"use client";

/**
 * useCounterEngine — the counter's Package 1 flows, wired: the custom
 * amount and its manager approval (C14 / C15), the booking link (C11), the
 * tip (the basket's half of D02 / D03) and the payment link (the collect
 * screen's `Payment link` tab). Kept beside the page as wiring, like
 * `useCounterCustomer`: the sheets are the design screens, the writes are
 * `pos/actions.ts` and `lib/server-actions/pos-engine.ts`, and this hook is
 * the state between them.
 *
 * REFUSALS ARE CODES. Every one of these actions answers `{ ok: false,
 * reason }` with a word from `docs/plans/program/engine/pos-money.md`; the
 * sentence is `dashboard.pos.engine.refusal.<reason>` in the operator's
 * language, rendered by `PosEngineRefusalBanner`. A word this hook has never
 * met reads as `unavailable`, never as itself.
 *
 * KEYS ARE DERIVED, NOT MINTED. A custom line's idempotency key, an
 * approval's operation key, a link's operation key and a payment link's key
 * are all built from the sale, its version and the figure, so a second tap
 * on an unchanged screen is the same operation and not a second write.
 */

import { useCallback, useState, type ReactElement, type ReactNode } from "react";

import {
  CustomAmountSheet,
  LinkBookingSheet,
  ManagerApprovalDialog,
  PaymentLinkPanel,
  PosEngineRefusalBanner,
  TipSheet,
  type CustomAmountCopy,
  type LinkBookingCandidate,
  type LinkBookingCopy,
  type LinkBookingState,
  type PaymentLinkCopy,
  type PaymentLinkRow,
  type PosBasketLine,
  type PosPerson,
  type TipSheetCopy,
} from "@/components/admin/pos";
import { basketTotals } from "@/components/admin/pos/pos-math";
import { createPaymentLink, posLinkBooking, posSetTip } from "@/lib/server-actions/pos-engine";

import { posAddCustomLine, posApproveCustomAmount, posBookingCandidates } from "./actions";
import { formatClock, keypadNext } from "./counter-model";
import type { PosSaleSummary } from "./counter-props";

type EngineSheet =
  | { kind: "custom" }
  | { kind: "approval"; lineId: string; description: string; amountCents: number }
  | { kind: "booking" }
  | { kind: "tip" }
  | null;

export type CounterEngineCopy = {
  readonly custom: CustomAmountCopy;
  readonly booking: LinkBookingCopy;
  readonly tip: TipSheetCopy;
  readonly paymentLink: PaymentLinkCopy;
  readonly refusal: Readonly<Record<string, string>>;
  readonly reload: string;
};

export type CounterEngine = {
  readonly sheets: ReactElement;
  /** The last engine refusal as a banner, or null. */
  readonly banner: ReactNode;
  readonly openCustom: () => void;
  readonly openApproval: (lineId: string) => void;
  readonly openBooking: () => void;
  readonly openTip: () => void;
  /** The collect screen's `Payment link` tab. */
  readonly paymentLinkPanel: ReactElement | null;
  readonly busy: boolean;
  readonly clearRefusal: () => void;
};

export function useCounterEngine(input: {
  readonly sale: PosSaleSummary | null;
  readonly lines: readonly PosBasketLine[];
  readonly currency: string;
  readonly locale: string;
  readonly people: readonly PosPerson[];
  readonly limitCents: number;
  readonly cashierName: string;
  readonly workspaceName: string;
  readonly customerName: string | null;
  /** The customer the counter has attached (written to the order at collection). */
  readonly customerId: string | null;
  readonly paymentLinks: readonly PaymentLinkRow[];
  readonly linkProvider: "stripe" | "mock";
  readonly copy: CounterEngineCopy;
  /** Re-read the sale after an accepted write. */
  readonly onWritten: () => void;
  readonly onOpenCustomer: () => void;
  /** `Link & pay`: open the collect screen once the link has landed. */
  readonly onCollect: () => void;
}): CounterEngine {
  const { sale, copy } = input;
  const [sheet, setSheet] = useState<EngineSheet>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const [customWhat, setCustomWhat] = useState("");
  const [customCents, setCustomCents] = useState(0);
  const [approverId, setApproverId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null);

  const [bookingState, setBookingState] = useState<LinkBookingState>({ status: "loading" });
  const [bookingChoice, setBookingChoice] = useState<string | null>(null);
  const [showPaid, setShowPaid] = useState(false);

  const [createdLink, setCreatedLink] = useState<PaymentLinkRow | null>(null);

  const sentence = useCallback((reason: unknown) => (typeof reason === "string" && copy.refusal[reason]) || copy.refusal.unavailable || "", [copy.refusal]);
  const approvers = input.people.filter((p) => p.manager && p.hasPin);

  /** Run one engine command; a refusal becomes the banner, a success re-reads. */
  const run = useCallback(
    async <T extends { ok: boolean; reason?: unknown }>(fn: () => Promise<T>): Promise<T> => {
      setBusy(true);
      setRefusal(null);
      try {
        const r = await fn();
        if (!r.ok) setRefusal(typeof r.reason === "string" ? r.reason : "unavailable");
        else input.onWritten();
        return r;
      } finally {
        setBusy(false);
      }
    },
    [input],
  );

  // ── Custom amount ───────────────────────────────────────────────────
  const submitCustom = () => {
    if (!sale) return;
    const label = customWhat.trim();
    const amountCents = customCents;
    void run(() =>
      posAddCustomLine({
        orderId: sale.orderId,
        label,
        amountCents,
        expectedVersion: sale.version,
        // Under the engine's 80-char cap: the version moves on every write,
        // so (sale, version, amount) names this attempt without the label.
        idempotencyKey: `custom:${sale.orderId}:${sale.version}:${amountCents}`,
      }),
    ).then((r) => {
      if (!r.ok) return;
      setCustomWhat("");
      setCustomCents(0);
      if (r.needsApproval && r.lineId) {
        setPin("");
        setApprovalStatus(null);
        setApproverId(approvers[0]?.userId ?? null);
        setSheet({ kind: "approval", lineId: r.lineId, description: label, amountCents });
      } else {
        setSheet(null);
      }
    });
  };

  const approve = () => {
    if (!sale || sheet?.kind !== "approval" || !approverId) return;
    const { lineId } = sheet;
    const fullPin = pin;
    setBusy(true);
    setApprovalStatus(null);
    void posApproveCustomAmount({
      orderId: sale.orderId,
      lineId,
      pin: fullPin,
      operationKey: `approve:${lineId}:${approverId.slice(0, 8)}`,
      approverUserId: approverId,
    })
      .then((r) => {
        if (r.ok) {
          setSheet(null);
          setPin("");
          input.onWritten();
        } else {
          setPin("");
          setApprovalStatus(sentence(r.reason));
        }
      })
      .finally(() => setBusy(false));
  };

  // ── Booking link ────────────────────────────────────────────────────
  const openBooking = () => {
    setSheet({ kind: "booking" });
    setBookingChoice(null);
    setBookingState({ status: "loading" });
    if (!sale) {
      setBookingState({ status: "noCustomer" });
      return;
    }
    void posBookingCandidates({ orderId: sale.orderId, customerId: input.customerId }).then((r) => {
      if (!r.ok) {
        setBookingState(r.reason === "no_customer" ? { status: "noCustomer" } : { status: "unreadable" });
        return;
      }
      const candidates: LinkBookingCandidate[] = r.candidates.map((c) => ({
        bookingId: c.bookingId,
        bookingKind: c.bookingKind,
        title: c.title,
        when: c.startsAt ? formatClock(c.startsAt, input.locale) : null,
        owedCents: c.owedCents,
        paid: c.paid,
        partySize: c.partySize,
      }));
      setBookingState({ status: "ready", candidates, linkedBookingId: r.linkedBookingId });
      setBookingChoice(r.linkedBookingId ?? candidates.find((c) => !c.paid)?.bookingId ?? null);
    });
  };

  const link = (thenCollect: boolean) => {
    if (!sale || bookingState.status !== "ready") return;
    const chosen = bookingState.candidates.find((c) => c.bookingId === bookingChoice);
    if (!chosen) return;
    void run(() =>
      posLinkBooking({
        orderId: sale.orderId,
        bookingKind: chosen.bookingKind,
        bookingId: chosen.bookingId,
        operationKey: `link:${sale.orderId}:${chosen.bookingId}`,
      }),
    ).then((r) => {
      if (!r.ok) return;
      setSheet(null);
      if (thenCollect) input.onCollect();
    });
  };

  // ── Tip ─────────────────────────────────────────────────────────────
  const setTip = (tipCents: number) => {
    if (!sale) return;
    void run(() =>
      posSetTip({
        orderId: sale.orderId,
        tipCents,
        operationKey: `tip:${sale.orderId}:${sale.version}:${tipCents}`,
        expectedVersion: sale.version,
      }),
    ).then((r) => {
      if (r.ok) setSheet(null);
    });
  };

  // ── Payment link ────────────────────────────────────────────────────
  const mintLink = () => {
    if (!sale || sale.outstandingCents <= 0) return;
    const amountCents = sale.outstandingCents;
    void run(() =>
      createPaymentLink({
        orderId: sale.orderId,
        amountCents,
        idempotencyKey: `paylink:${sale.orderId}:${sale.version}:${amountCents}`,
      }),
    ).then((r) => {
      if (!r.ok) return;
      setCreatedLink({ code: r.code, url: r.url, amountCents: r.amountCents, status: "open", expiresAt: formatClock(r.expiresAt, input.locale) });
    });
  };

  const totals = basketTotals(input.lines, sale?.discountCents ?? 0, 0);

  const sheets = (
    <>
      <CustomAmountSheet
        open={sheet?.kind === "custom"}
        onClose={() => setSheet(null)}
        currency={input.currency}
        description={customWhat}
        onDescriptionChange={setCustomWhat}
        amountCents={customCents}
        onKey={(key) => setCustomCents((current) => (key === "00" ? keypadNext(keypadNext(current, "0"), "0") : keypadNext(current, key)))}
        limitCents={input.limitCents}
        busy={busy}
        onContinue={submitCustom}
        copy={copy.custom}
      />
      {sheet?.kind === "approval" && (
        <ManagerApprovalDialog
          open
          onClose={() => setSheet(null)}
          currency={input.currency}
          description={sheet.description}
          amountCents={sheet.amountCents}
          limitCents={input.limitCents}
          cashier={input.cashierName}
          approvers={approvers}
          approverId={approverId}
          onApproverChange={(id) => {
            setApproverId(id);
            setPin("");
            setApprovalStatus(null);
          }}
          pinLength={pin.length}
          onKey={(key) => {
            if (key === "back") setPin((p) => p.slice(0, -1));
            else if (/^[0-9]$/.test(key)) setPin((p) => (p.length >= 6 ? p : `${p}${key}`));
            setApprovalStatus(null);
          }}
          status={approvalStatus}
          busy={busy}
          onApprove={approve}
          copy={copy.custom}
        />
      )}
      <LinkBookingSheet
        open={sheet?.kind === "booking"}
        onClose={() => setSheet(null)}
        customerName={input.customerName}
        saleTotalCents={sale?.totalCents ?? 0}
        saleLineCount={input.lines.length}
        currency={input.currency}
        state={bookingState}
        selectedId={bookingChoice}
        onSelect={setBookingChoice}
        showPaid={showPaid}
        onShowPaidChange={setShowPaid}
        busy={busy}
        onOpenCustomer={() => {
          setSheet(null);
          input.onOpenCustomer();
        }}
        onLinkOnly={() => link(false)}
        onLinkAndPay={() => link(true)}
        copy={copy.booking}
      />
      {sheet?.kind === "tip" && sale && (
        <TipSheet
          open
          onClose={() => setSheet(null)}
          currency={input.currency}
          baseCents={totals.subtotalCents - totals.discountCents}
          totalBeforeTipCents={totals.totalCents}
          tipCents={sale.tipCents}
          busy={busy}
          onSetTip={setTip}
          copy={copy.tip}
        />
      )}
    </>
  );

  const banner = refusal ? (
    <PosEngineRefusalBanner
      code={refusal}
      sentence={sentence(refusal)}
      reloadLabel={copy.reload}
      onReload={() => {
        setRefusal(null);
        input.onWritten();
      }}
    />
  ) : null;

  const paymentLinkPanel = sale ? (
    <PaymentLinkPanel
      amountCents={sale.outstandingCents}
      currency={input.currency}
      workspaceName={input.workspaceName}
      provider={input.linkProvider}
      links={input.paymentLinks}
      created={createdLink}
      busy={busy}
      onCreate={mintLink}
      copy={copy.paymentLink}
    />
  ) : null;

  return {
    sheets,
    banner,
    openCustom: () => {
      setRefusal(null);
      setSheet({ kind: "custom" });
    },
    openApproval: (lineId: string) => {
      const line = input.lines.find((l) => l.id === lineId);
      if (!line) return;
      setPin("");
      setApprovalStatus(null);
      setApproverId(approvers[0]?.userId ?? null);
      setSheet({ kind: "approval", lineId, description: line.label, amountCents: line.unitCents * line.units });
    },
    openBooking,
    openTip: () => setSheet({ kind: "tip" }),
    paymentLinkPanel,
    busy,
    clearRefusal: () => setRefusal(null),
  };
}
