"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ConfirmDialog, MoreMenu, initialsFor, type MoreMenuAction } from "./AgendaRecordParts";
import { BookingStateChip, MoneyBlock, NowBox, PaymentStateChip, TALENT_AGENDA_VARS } from "./primitives";
import type { AgendaListItem } from "./types";
import { cancelBookingWithRefund, cancelPaymentPreview, markBookingNoShow, markBookingTransferReceived, createAgendaBookingPayLink, respondToReschedule } from "@/lib/talent-agenda";
import { respondToInquiryOffer, declineInquiryInvitation } from "@/lib/server-actions/talent-pipeline";
import { AgendaRescheduleSheet } from "./AgendaRescheduleSheet";
import { AgendaFinishCollect } from "./AgendaFinishCollect";
import { recordSourceLabel, recordWhenLabel } from "@/lib/talent-agenda/record-labels";
import { TradeSections } from "./TradeSections";
import {
  cancelConsequenceKeys,
  holdEndsParts,
  noShowMoneyKey,
  nowBodyForRecord,
  recordActionVisibility,
  showMoreMenu,
  type CancelledBy,
} from "./record-actions";
import { encodeQr } from "@/lib/links/qr";
import { toSvg } from "@/lib/links/qr/render";
import { AgendaPayRequest } from "./AgendaPayRequest";
import { AgendaHoldFlows } from "./AgendaHoldFlows";
import { useAgendaCopy } from "./use-agenda-copy";
import { readAgendaNowClient } from "@/lib/talent-agenda/agenda-now";
import { useRouter } from "next/navigation";

// ─── Main component ───────────────────────────────────────────────────────────

export function AgendaBookingRecord({
  item,
  bookingId,
  isAgency,
  refTable,
  refId,
  tradeSection,
  onBack,
  onMessage,
  onCancelled,
}: {
  item: AgendaListItem;
  /** Real booking UUID used for server actions. When absent, destructive actions are disabled. */
  bookingId?: string;
  /** Agency-managed bookings hide Cancel (only admin can cancel). */
  isAgency?: boolean;
  /** Source table for request accept/decline (inquiries vs bookings). */
  refTable?: string;
  refId?: string;
  /** Optional trade-type section data (legacy prop; prefer item.tradeSectionPayloads). */
  tradeSection?: { kind: string; payload: Record<string, unknown> };
  onBack: () => void;
  onMessage?: () => void;
  onCancelled?: () => void;
}) {
  const copy = useAgendaCopy();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [showFinish, setShowFinish] = useState(false);
  const [depositLink, setDepositLink] = useState<string | null>(null);
  const [showPayRequest, setShowPayRequest] = useState(false);
  const [confirmNoShow, setConfirmNoShow] = useState(false);
  const [cancelledBy, setCancelledBy] = useState<CancelledBy>("talent");
  const [linkCopied, setLinkCopied] = useState(false);
  const [showHold, setShowHold] = useState(false);
  // Ledger-read money for the cancel dialog (undefined = loading, null = unknown).
  const [cancelPaidCents, setCancelPaidCents] = useState<number | null | undefined>(undefined);
  const [cancelInFlight, setCancelInFlight] = useState(false);
  // The record flips to Cancelled the moment the server says so, not on reload.
  const [cancelledHere, setCancelledHere] = useState(false);
  const bookingState: AgendaListItem["bookingState"] = cancelledHere ? "cancelled" : item.bookingState;
  // The NOW card follows the same flip: it said "Confirmed" until a reload.
  const nowTitle = cancelledHere ? "Cancelled" : item.nowTitle;
  const nowBodyRaw = cancelledHere ? "This booking was cancelled." : item.nowBody;
  const nowTone = cancelledHere ? "risk" : item.nowTone;
  const depositQrSvg = useMemo(() => {
    if (!depositLink) return null;
    try {
      return toSvg(encodeQr(depositLink).matrix, { size: 160 });
    } catch {
      return null;
    }
  }, [depositLink]);

  const canAct = !!bookingId;
  const bookingCurrency = item.currency?.trim() || "MXN";
  const now = readAgendaNowClient(new Date());
  const startsMs = item.startsAtIso ? Date.parse(item.startsAtIso) : NaN;
  const noShowReady = Number.isFinite(startsMs) && startsMs < now.getTime();
  const show = recordActionVisibility({
    canAct,
    isAgency,
    bookingState: bookingState,
    paymentState: item.paymentState,
    started: noShowReady,
  });
  // F61: the record states the day, not just the times.
  const whenFull =
    recordWhenLabel({ startsAt: item.startsAtIso, endsAt: item.endsAtIso, tz: item.talentTz, locale: copy.locale }) ?? item.whenLabel;
  // F44: Money → Record payment lands here with ?collect=1 and opens Finish and collect.
  useEffect(() => {
    if (!show.finishCollect) return;
    if (new URLSearchParams(window.location.search).get("collect") !== "1") return;
    setShowFinish(true);
  }, [show.finishCollect]);

  // ── No-show ──────────────────────────────────────────────────────
  function handleNoShow() {
    if (!bookingId || !noShowReady) return;
    setConfirmNoShow(false);
    setStatus(copy.t("Marking no-show…"));
    startTransition(async () => {
      const res = await markBookingNoShow({ bookingId });
      if (res.ok) {
        setStatus(copy.t("Marked no-show ✓"));
      } else {
        setStatus(`${copy.t("Could not mark no-show")}: ${res.reason}`);
      }
    });
  }

  // ── Cancel confirm (A1.7 — do not cancel on open; only on confirm) ─
  function handleCancelRequest() {
    if (!bookingId) return;
    setCancelPaidCents(undefined);
    setCancelInFlight(false);
    setConfirmCancel(true);
    startTransition(async () => {
      const preview = await cancelPaymentPreview(bookingId);
      setCancelPaidCents(preview.ok ? preview.paidCents : null);
      setCancelInFlight(preview.ok && preview.paymentInFlight);
    });
  }

  function handleCancelConfirm() {
    if (!bookingId) return;
    setConfirmCancel(false);
    setStatus(copy.t("Cancelling…"));
    startTransition(async () => {
      const res = await cancelBookingWithRefund({ bookingId, cancelledBy });
      if (res.ok) {
        // Refunds are never automatic here: say what was paid and where to refund it.
        setStatus(
          res.paidCents > 0
            ? `${copy.t("Cancelled. The client paid")} ${(res.paidCents / 100).toFixed(2)} ${bookingCurrency}. ${copy.t("Refund it by hand from Money.")}`
            : res.paymentInFlight
              ? `${copy.t("Cancelled ✓")} ${copy.t("A card payment is still arriving. The payment link is closed and the payment is flagged in Money. Refund it by hand.")}`
              : copy.t("Cancelled ✓"),
        );
        setCancelledHere(true);
        router.refresh();
        onCancelled?.();
      } else {
        setStatus(`${copy.t("Cancel failed")}: ${res.reason}`);
      }
    });
  }

  const needsDepositCollect = show.collectDeposit;
  const holdId = refTable === "talent_holds" ? refId || bookingId : undefined;
  const transferPending =
    item.paymentState === "awaiting_deposit" &&
    bookingState === "completed" &&
    item.paymentMethod === "transfer" &&
    !!bookingId &&
    show.confirmTransfer;

  /**
   * Mockup tc_record: the Now card carries the ONE next step for this state,
   * built from actions that already exist. Order: requests and reschedules
   * have their own boxes; then transfer, payment, finish, deposit, hold.
   */
  type NowStep = "transfer" | "request_payment" | "finish" | "deposit" | "hold_deposit" | "hold";
  const nowStep: NowStep | null = !show.talentOwnsActions
    ? null
    : transferPending
      ? "transfer"
      : show.requestPayment && item.orderId
        ? "request_payment"
        : show.finishCollect
          ? "finish"
          : needsDepositCollect
            ? "deposit"
            : bookingState === "hold" && item.orderId
              ? "hold_deposit"
              : bookingState === "hold" && holdId
                ? "hold"
                : null;

  function handleCollectDeposit() {
    if (!bookingId) return;
    setStatus(copy.t("Creating deposit link…"));
    setDepositLink(null);
    startTransition(async () => {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const link = await createAgendaBookingPayLink({
        bookingId,
        amountCents: item.dueCents && item.dueCents > 0 ? item.dueCents : undefined,
        publicOrigin: origin,
      });
      if (!link.ok) {
        setStatus(`${copy.t("Could not create pay link")}: ${link.reason}`);
        return;
      }
      setDepositLink(link.url);
      setStatus(copy.t("Deposit link created ✓"));
    });
  }

  function handleTransferReceived() {
    if (!bookingId) return;
    startTransition(async () => {
      const res = await markBookingTransferReceived({ bookingId });
      if (res.ok) {
        setStatus(copy.t("Transfer marked received ✓"));
        router.refresh();
      } else {
        setStatus(`${copy.t("Could not confirm transfer")}: ${res.reason}`);
      }
    });
  }

  // Mockup tc_more order: edit items, private note, no-show, cancel.
  // Edit items and private note have no server action yet: shown off, with why.
  const moreActions: MoreMenuAction[] = [
    {
      label: copy.t("Change items or price"),
      disabled: true,
      disabledReason: copy.t("Not available yet. Message the client to agree a change."),
      onClick: () => undefined,
    },
    {
      label: copy.t("Add a private note"),
      disabled: true,
      disabledReason: copy.t("Not available yet."),
      onClick: () => undefined,
    },
    ...(show.noShow
      ? [
          {
            label: copy.t("Mark no-show"),
            disabled: !noShowReady,
            disabledReason: copy.t("Available after the start time"),
            onClick: () => setConfirmNoShow(true),
          },
        ]
      : []),
    ...(show.cancel
      ? [
          {
            label: copy.t("Cancel booking"),
            destructive: true,
            hint: copy.t("Shows what happens to the payment first"),
            onClick: () => void handleCancelRequest(),
          },
        ]
      : []),
  ];
  const moreVisible = show.talentOwnsActions && showMoreMenu({ isAgency, bookingState: bookingState });

  const sections =
    item.tradeSectionPayloads ??
    (tradeSection
      ? [
          {
            type: tradeSection.kind as
              | "event"
              | "performance"
              | "intake"
              | "tz"
              | "estimate"
              | "project",
            data: Object.fromEntries(
              Object.entries(tradeSection.payload).map(([k, v]) => [
                k,
                typeof v === "string" || typeof v === "number" || v == null ? v : String(v),
              ]),
            ),
          },
        ]
      : undefined);

  return (
    <div style={TALENT_AGENDA_VARS} className="mx-auto grid max-w-[1100px] gap-4 lg:grid-cols-[1fr_280px]">
      <div className="space-y-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[20px] font-semibold text-[var(--tc-primary)]">{item.title}</h1>
            <p className="mt-0.5 text-[12.5px] text-[var(--tc-muted)]">
              {[item.id ? `#${item.id.slice(0, 8).toUpperCase()}` : "", whenFull].filter(Boolean).join(" · ")}
            </p>
            <button
              type="button"
              onClick={onBack}
              aria-label={copy.t("Back to calendar")}
              className="mt-1 min-h-[32px] text-[13px] font-medium text-[var(--tc-accent)]"
            >
              ‹ {copy.t("Calendar")}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {onMessage ? (
              <button
                type="button"
                onClick={onMessage}
                aria-label={isAgency ? copy.t("Message the agency") : copy.t("Message client")}
                className="min-h-[44px] rounded-full border border-black/10 bg-white px-4 py-2 text-[13px]"
              >
                {isAgency ? copy.t("Message the agency") : copy.t("Message")}
              </button>
            ) : null}
            {show.reschedule ? (
              <button
                type="button"
                onClick={() => setShowReschedule(true)}
                className="min-h-[44px] rounded-full border border-black/10 bg-white px-4 py-2 text-[13px]"
              >
                {copy.t("Reschedule")}
              </button>
            ) : null}
            {moreVisible ? <MoreMenu actions={moreActions} /> : null}
          </div>
        </header>

        {bookingState === "requested" && show.talentOwnsActions ? (
          <NowBox
            tone="attention"
            title={copy.t("Request")}
            body={copy.t(
              "Accepting re-checks the hour on the server. Suggest another time keeps the request open. Decline closes it.",
            )}
            primaryAction={{
              label: copy.t("Accept"),
              onClick: () => {
                const inquiryId = refTable === "inquiries" ? (refId || bookingId) : null;
                if (!inquiryId) {
                  setStatus(copy.t("Open Messages to accept this request."));
                  onMessage?.();
                  return;
                }
                setStatus(copy.t("Accepting…"));
                startTransition(async () => {
                  const res = await respondToInquiryOffer(inquiryId, "accepted");
                  if (res.ok) {
                    setStatus(copy.t("Accepted. The hour was re-checked on the server."));
                    router.refresh();
                  } else {
                    setStatus(`${copy.t("Could not accept")}: ${res.error}`);
                  }
                });
              },
            }}
            secondaryAction={{
              label: copy.t("Suggest another time"),
              onClick: () => setShowReschedule(true),
            }}
          />
        ) : null}

        {item.pendingReschedule?.requestId && show.talentOwnsActions ? (
          <NowBox
            tone="attention"
            title={copy.t("Reschedule proposed")}
            body={copy.t(
              "Accept to move the booking. Decline keeps the current time. Deposit stays with the booking.",
            )}
            primaryAction={{
              label: copy.t("Accept new time"),
              onClick: () => {
                const requestId = item.pendingReschedule?.requestId;
                if (!requestId) return;
                setStatus(copy.t("Accepting…"));
                startTransition(async () => {
                  const res = await respondToReschedule({ requestId, accept: true });
                  if (res.ok) {
                    setStatus(copy.t("Booking moved. Deposit kept. Old time is free."));
                    router.refresh();
                  } else {
                    setStatus(
                      `${copy.t("Could not accept")}: ${res.reason ?? "unavailable"}`,
                    );
                  }
                });
              },
            }}
            secondaryAction={{
              label: copy.t("Decline new time"),
              onClick: () => {
                const requestId = item.pendingReschedule?.requestId;
                if (!requestId) return;
                setStatus(copy.t("Declining…"));
                startTransition(async () => {
                  const res = await respondToReschedule({ requestId, accept: false });
                  if (res.ok) {
                    setStatus(copy.t("Reschedule declined. Current time kept."));
                    router.refresh();
                  } else {
                    setStatus(
                      `${copy.t("Could not decline")}: ${res.reason ?? "unavailable"}`,
                    );
                  }
                });
              },
            }}
          />
        ) : null}

        {bookingState === "requested" && refTable === "inquiries" && show.talentOwnsActions ? (
          <button
            type="button"
            className="min-h-[44px] text-[13px] text-[var(--tc-risk)]"
            onClick={() => {
              const inquiryId = refId || bookingId;
              if (!inquiryId) return;
              setStatus(copy.t("Declining…"));
              startTransition(async () => {
                const res = await declineInquiryInvitation(inquiryId);
                if (res.ok) {
                  setStatus(copy.t("Declined. The request is closed."));
                  router.refresh();
                } else {
                  setStatus(`${copy.t("Could not decline")}: ${res.error}`);
                }
              });
            }}
          >
            {copy.t("Decline request")}
          </button>
        ) : null}

        {showReschedule && bookingId ? (
          <AgendaRescheduleSheet
            bookingId={bookingId}
            currentStartsAt={item.startsAtIso}
            currentEndsAt={item.endsAtIso}
            onClose={() => setShowReschedule(false)}
            onProposed={() => {
              setShowReschedule(false);
              setStatus(copy.t("Reschedule proposed. Waiting for the client."));
            }}
          />
        ) : null}

        <section className="rounded-2xl border border-black/8 bg-white p-4 text-[14px]">
          <div className="mb-3 flex items-start gap-3">
            <span
              aria-hidden
              className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-black/[0.06] text-[15px] font-semibold text-[var(--tc-primary)]"
            >
              {initialsFor(item.title)}
            </span>
            <div className="min-w-0">
              <div className="text-[18px] font-semibold text-[var(--tc-primary)]">{item.title}</div>
              <div className="text-[13.5px] text-[var(--tc-muted)]">{item.subtitle ?? copy.t("No service set")}</div>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {bookingState ? <BookingStateChip state={bookingState} /> : null}
                {item.paymentState ? <PaymentStateChip state={item.paymentState} /> : null}
              </div>
            </div>
          </div>
          <dl className="divide-y divide-black/8 rounded-xl border border-black/8 px-3">
            <div className="grid grid-cols-[120px_1fr] gap-3 py-2.5">
              <dt className="text-[var(--tc-muted)]">{copy.t("When")}</dt>
              <dd>{whenFull}</dd>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-3 py-2.5">
              <dt className="text-[var(--tc-muted)]">{copy.t("Where")}</dt>
              <dd>
                {item.whereLabel ? (
                  copy.t(item.whereLabel)
                ) : (
                  <span className="text-[var(--tc-muted)]">{copy.t("Not set yet")}</span>
                )}
              </dd>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-3 py-2.5">
              <dt className="text-[var(--tc-muted)]">{copy.t("Came from")}</dt>
              <dd>{copy.t(recordSourceLabel(item.sourceLabel))}</dd>
            </div>
            {isAgency ? (
              <div className="grid grid-cols-[120px_1fr] gap-3 py-2.5">
                <dt className="text-[var(--tc-muted)]">{copy.t("Managed by")}</dt>
                <dd>{copy.t("The agency. Changes to time, place or fee go through them.")}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        {nowTitle ? (
          <NowBox
            tone={
              nowTone === "ok"
                ? "success"
                : nowTone === "warn"
                  ? "attention"
                  : nowTone === "risk"
                    ? "danger"
                    : "info"
            }
            title={copy.t(nowTitle ?? "")}
            body={(() => {
              const rawBody = nowBodyForRecord(nowBodyRaw, isAgency);
              const body = rawBody ? copy.t(rawBody) : "";
              const hold = bookingState === "hold" ? holdEndsParts(item.holdUntilIso, now) : null;
              if (!hold) return body;
              const line = hold.left
                ? `${copy.t("Hold ends")} ${hold.ends} · ${hold.left} ${copy.t("left")}`
                : `${copy.t("Hold ended")} ${hold.ends}`;
              return body ? `${line}. ${body}` : line;
            })()}
            primaryAction={
              nowStep === "transfer"
                ? { label: copy.t("Mark transfer received"), onClick: handleTransferReceived }
                : nowStep === "request_payment" || nowStep === "hold_deposit"
                  ? {
                      label: copy.t(nowStep === "hold_deposit" ? "Request deposit" : "Request payment"),
                      onClick: () => setShowPayRequest(true),
                    }
                  : nowStep === "finish"
                    ? { label: copy.t("Finish and collect"), onClick: () => setShowFinish(true) }
                    : nowStep === "deposit"
                      ? { label: copy.t("Request deposit"), onClick: handleCollectDeposit }
                      : nowStep === "hold"
                        ? { label: copy.t("Confirm or release hold"), onClick: () => setShowHold(true) }
                        : show.talentOwnsActions
                          ? (cancelledHere ? undefined : item.primaryAction)
                          : undefined
            }
            secondaryAction={show.talentOwnsActions && !cancelledHere ? item.secondaryAction : undefined}
          />
        ) : null}

        {isAgency && onMessage ? (
          <button
            type="button"
            onClick={onMessage}
            className="w-full min-h-[44px] rounded-xl border border-black/10 bg-white py-3 text-[14px] font-semibold text-[var(--tc-primary)]"
          >
            {copy.t("Request a change")}
          </button>
        ) : null}

        {showHold && holdId ? (
          <AgendaHoldFlows
            holdId={holdId}
            title={item.title}
            onClose={() => setShowHold(false)}
            onConverted={() => {
              setShowHold(false);
              router.refresh();
            }}
            onReleased={() => {
              setShowHold(false);
              router.refresh();
            }}
          />
        ) : null}

        {/* Collect deposit — mint pay link + WhatsApp share (criterion 3) */}
        {needsDepositCollect && !showFinish ? (
          <div className="space-y-2">
            {nowStep !== "deposit" || !nowTitle ? (
              <button
                type="button"
                onClick={handleCollectDeposit}
                aria-label={copy.t("Collect deposit")}
                className="w-full min-h-[44px] rounded-xl border border-black/10 bg-white py-3 text-[14px] font-semibold text-[var(--tc-primary)]"
              >
                {copy.t("Collect deposit")}
              </button>
            ) : null}
            {depositLink ? (
              <div className="rounded-xl bg-[rgba(31,122,76,0.08)] p-3 text-[13px] space-y-2">
                <a
                  href={depositLink}
                  target="_blank"
                  rel="noreferrer"
                  className="block break-all text-[var(--tc-accent)] underline"
                >
                  {depositLink}
                </a>
                {depositQrSvg ? (
                  <div
                    role="img"
                    aria-label={copy.t("QR code for the payment link")}
                    className="h-[160px] w-[160px] rounded-lg bg-white p-1"
                    dangerouslySetInnerHTML={{ __html: depositQrSvg }}
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(depositLink).then(
                      () => setLinkCopied(true),
                      () => setLinkCopied(false),
                    );
                  }}
                  className="mr-2 inline-flex min-h-[44px] items-center rounded-full border border-black/10 bg-white px-4 text-[13px] font-semibold text-[var(--tc-primary)]"
                >
                  {linkCopied ? copy.t("Link copied") : copy.t("Copy link")}
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(depositLink)}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={copy.t("Send on WhatsApp")}
                  className="inline-flex min-h-[44px] items-center rounded-full bg-[var(--tc-ok)] px-4 text-[13px] font-semibold text-white"
                >
                  {copy.t("Send on WhatsApp")}
                </a>
              </div>
            ) : null}
          </div>
        ) : null}

        {showPayRequest && item.orderId ? (
          <AgendaPayRequest
            orderId={item.orderId}
            onClose={() => {
              setShowPayRequest(false);
              router.refresh();
            }}
          />
        ) : null}

        {/* Finish and collect */}
        {show.finishCollect && !showFinish && (nowStep !== "finish" || !nowTitle) ? (
          <button
            type="button"
            onClick={() => setShowFinish(true)}
            aria-label={copy.t("Finish and collect")}
            className="w-full min-h-[44px] rounded-xl bg-[var(--tc-action)] hover:bg-[var(--tc-action-hover)] py-3 text-[14px] font-semibold text-white"
          >
            {copy.t("Finish and collect")}
          </button>
        ) : null}

        {showFinish && bookingId ? (
          <AgendaFinishCollect
            bookingId={bookingId}
            orderId={item.orderId}
            dueCents={item.dueCents}
            onClose={() => setShowFinish(false)}
            onDone={() => {
              setShowFinish(false);
              setStatus(copy.t("Finished and collected ✓"));
              router.refresh();
            }}
          />
        ) : null}

        {transferPending && !nowTitle ? (
          <button
            type="button"
            onClick={handleTransferReceived}
            aria-label={copy.t("Mark transfer received")}
            className="w-full min-h-[44px] rounded-xl border border-black/10 bg-white py-3 text-[14px] font-semibold text-[var(--tc-primary)]"
          >
            {copy.t("Mark transfer received")}
          </button>
        ) : null}

        {/* Status feedback */}
        {status ? (
          <p className="text-center text-[13px] text-[var(--tc-muted)]" aria-live="polite">{status}</p>
        ) : null}

        {/* Trade section */}
        {sections && sections.length > 0 ? <TradeSections sections={sections} /> : null}
      </div>

      <aside className="space-y-4">
        <MoneyBlock
          title={copy.t("Agreed")}
          items={(item.moneyLines ?? []).map((line) => ({
            ...line,
            label: copy.t(line.label),
            value: copy.t(line.value),
            helper: line.helper ? copy.t(line.helper) : undefined,
          }))}
        />
        <section className="rounded-2xl border border-black/8 bg-white p-4 text-[13px] text-[var(--tc-muted)]">
            <h2 className="mb-2 text-[14px] font-semibold text-[var(--tc-primary)]">{copy.t("Terms and history")}</h2>
            {item.terms ? <p className="border-b border-black/8 pb-2">{item.terms}</p> : null}
            {bookingState === "hold" && item.holdUntilIso ? (
              <p className="border-b border-black/8 py-2">
                {`${copy.t("The hold keeps this time until")} ${new Date(item.holdUntilIso).toLocaleString(
                  copy.locale === "es" ? "es-MX" : "en-GB",
                  { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false },
                )}.`}
              </p>
            ) : null}
            {(item.history ?? []).length === 0 ? (
              <p className="pt-2">{copy.t("Nothing has happened on this booking yet.")}</p>
            ) : null}
            {isAgency ? (
              <p className="border-b border-black/8 py-2">
                {copy.t("Agency job: you cannot cancel or move it here. Ask the agency.")}
              </p>
            ) : null}
            <ul className="mt-2 space-y-2">
              {(item.history ?? []).map((line) => (
                <li key={`${line.at}-${line.label}`}>
                  <time dateTime={line.at} className="block text-[11px] text-admin-ink-dim">
                    {new Date(line.at).toLocaleString()}
                  </time>
                  <span>{copy.t(line.label)}</span>
                </li>
              ))}
            </ul>
        </section>
      </aside>

      {/* Cancel confirm dialog */}
      {confirmCancel && (
        <ConfirmDialog
          title={copy.t("Cancel this booking?")}
          body={`${item.whenLabel} · ${item.title}`}
          confirmLabel={copy.t("Cancel booking")}
          cancelLabel={copy.t("Keep booking")}
          destructive
          onConfirm={handleCancelConfirm}
          onCancel={() => setConfirmCancel(false)}
        >
          <fieldset className="space-y-2">
            <legend className="mb-1 font-semibold text-[var(--tc-primary)]">{copy.t("Who is cancelling?")}</legend>
            {(["client", "talent"] as const).map((who) => (
              <label key={who} className="flex min-h-[44px] items-center gap-3 rounded-xl border border-black/10 px-3">
                <input
                  type="radio"
                  name="cancelled-by"
                  checked={cancelledBy === who}
                  onChange={() => setCancelledBy(who)}
                />
                <span>{who === "client" ? copy.t("The client asked to cancel") : copy.t("I am cancelling")}</span>
              </label>
            ))}
          </fieldset>
          {typeof cancelPaidCents === "number" && cancelPaidCents > 0 ? (
            <p className="rounded-xl bg-black/[0.03] p-3">
              {`${copy.t("The client paid")} ${(cancelPaidCents / 100).toFixed(2)} ${bookingCurrency}.`}
            </p>
          ) : null}
          <ul className="list-disc space-y-1 pl-5 text-[var(--tc-muted)]">
            {cancelConsequenceKeys(item.paymentState, cancelledBy, cancelPaidCents, cancelInFlight).map((k) => (
              <li key={k}>{copy.t(k)}</li>
            ))}
            <li>{copy.t("This cannot be undone.")}</li>
          </ul>
        </ConfirmDialog>
      )}

      {confirmNoShow && (
        <ConfirmDialog
          title={copy.t("Mark as no-show?")}
          body={`${item.whenLabel} · ${item.title}`}
          confirmLabel={copy.t("Mark no-show")}
          cancelLabel={copy.t("Back")}
          destructive
          onConfirm={handleNoShow}
          onCancel={() => setConfirmNoShow(false)}
        >
          <p className="rounded-xl bg-black/[0.03] p-3">{copy.t(noShowMoneyKey(item.paymentState))}</p>
          <p className="text-[var(--tc-muted)]">
            {copy.t("The booking stays in your history as No-show. No message is sent unless you write one.")}
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
