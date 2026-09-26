"use client";

import { useState, useTransition } from "react";
import { BookingStateChip, MoneyBlock, NowBox, PaymentStateChip, TALENT_AGENDA_VARS } from "./primitives";
import type { AgendaListItem } from "./types";
import { cancelBookingWithRefund, markBookingNoShow, markBookingTransferReceived, createAgendaBookingPayLink, respondToReschedule } from "@/lib/talent-agenda";
import { respondToInquiryOffer, declineInquiryInvitation } from "@/lib/server-actions/talent-pipeline";
import { AgendaRescheduleSheet } from "./AgendaRescheduleSheet";
import { AgendaFinishCollect } from "./AgendaFinishCollect";
import { TradeSections } from "./TradeSections";
import { useAgendaCopy } from "./use-agenda-copy";
import { readAgendaNowClient } from "@/lib/talent-agenda/agenda-now";
import { useRouter } from "next/navigation";

// ─── More menu ────────────────────────────────────────────────────────────────

type MoreMenuAction = {
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onClick: () => void;
};

function MoreMenu({ actions }: { actions: MoreMenuAction[] }) {
  const copy = useAgendaCopy();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-label={copy.t("More actions")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-black/10 bg-white text-[20px] leading-none text-[#5F6368]"
      >
        ···
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 top-full z-20 mt-1 min-w-[180px] overflow-hidden rounded-xl border border-black/8 bg-white shadow-md"
          >
            {actions.map((a) => (
              <button
                key={a.label}
                role="menuitem"
                type="button"
                disabled={a.disabled}
                title={a.disabled ? a.disabledReason : undefined}
                onClick={() => {
                  if (a.disabled) return;
                  setOpen(false);
                  a.onClick();
                }}
                className={`flex w-full flex-col items-start px-4 py-3 text-left text-[13px] font-medium transition-colors hover:bg-[rgba(11,11,13,0.04)] disabled:cursor-not-allowed disabled:opacity-50 ${
                  a.destructive ? "text-[#B42318]" : "text-[var(--tc-primary)]"
                }`}
              >
                <span>{a.label}</span>
                {a.disabled && a.disabledReason ? (
                  <span className="mt-0.5 text-[11px] font-normal text-[#5F6368]">{a.disabledReason}</span>
                ) : null}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  destructive,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const copy = useAgendaCopy();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4">
      <div className="w-full max-w-[360px] rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-[16px] font-semibold text-[var(--tc-primary)]">{title}</h2>
        <p className="mt-2 text-[13px] text-[#5F6368]">{body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-black/10 px-4 py-2 text-[13px]"
          >
            {copy.t("Cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-full px-4 py-2 text-[13px] text-white ${
              destructive ? "bg-[#B42318]" : "bg-[var(--tc-primary)]"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

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

  const canAct = !!bookingId;
  const cancellable = canAct && !isAgency;
  const bookingCurrency = item.currency?.trim() || "MXN";
  const now = readAgendaNowClient(new Date());
  const startsMs = item.startsAtIso ? Date.parse(item.startsAtIso) : NaN;
  const noShowReady = Number.isFinite(startsMs) && startsMs < now.getTime();

  // ── No-show ──────────────────────────────────────────────────────
  function handleNoShow() {
    if (!bookingId || !noShowReady) return;
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
    setConfirmCancel(true);
  }

  function handleCancelConfirm() {
    if (!bookingId) return;
    setConfirmCancel(false);
    setStatus(copy.t("Cancelling…"));
    startTransition(async () => {
      const res = await cancelBookingWithRefund({ bookingId, cancelledBy: "talent" });
      if (res.ok) {
        setStatus(
          res.refundableCents > 0
            ? `${copy.t("Cancelled")}. ${copy.t("Refund of")} ${(res.refundableCents / 100).toFixed(2)} ${bookingCurrency} ${copy.t("initiated")}.`
            : copy.t("Cancelled ✓"),
        );
        onCancelled?.();
      } else {
        setStatus(`${copy.t("Cancel failed")}: ${res.reason}`);
      }
    });
  }

  const needsDepositCollect =
    canAct &&
    item.bookingState === "confirmed" &&
    item.paymentState !== "paid" &&
    item.paymentState !== "paid_by_agency" &&
    item.paymentState !== "deposit_paid" &&
    item.paymentState !== "refund_pending";

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

  const moreActions: MoreMenuAction[] = [
    ...(canAct && (item.bookingState === "confirmed" || item.bookingState === "requested")
      ? [
          {
            label: copy.t("Reschedule"),
            onClick: () => setShowReschedule(true),
          },
        ]
      : []),
    ...(cancellable
      ? [{ label: copy.t("Cancel booking"), destructive: true, onClick: () => void handleCancelRequest() }]
      : []),
    ...(canAct && item.bookingState === "confirmed"
      ? [
          {
            label: copy.t("Mark no-show"),
            destructive: true,
            disabled: !noShowReady,
            disabledReason: copy.t("Available after the start time"),
            onClick: handleNoShow,
          },
        ]
      : []),
  ];

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
        <button
          type="button"
          onClick={onBack}
          aria-label={copy.t("Back to calendar")}
          className="min-h-[44px] px-1 text-[13px] text-[var(--tc-accent)]"
        >
          ← {copy.t("Back")}
        </button>

        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[24px] font-semibold text-[var(--tc-primary)]">{item.title}</h1>
            <p className="mt-1 text-[14px] text-[#5F6368]">{item.subtitle}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {item.bookingState ? <BookingStateChip state={item.bookingState} /> : null}
              {item.paymentState ? <PaymentStateChip state={item.paymentState} /> : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onMessage ? (
              <button
                type="button"
                onClick={onMessage}
                aria-label={copy.t("Message client")}
                className="min-h-[44px] rounded-full border border-black/10 bg-white px-4 py-2 text-[13px]"
              >
                {copy.t("Message")}
              </button>
            ) : null}
            {moreActions.length > 0 && <MoreMenu actions={moreActions} />}
          </div>
        </header>

        {item.bookingState === "requested" ? (
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

        {item.pendingReschedule?.requestId ? (
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

        {item.bookingState === "requested" && refTable === "inquiries" ? (
          <button
            type="button"
            className="min-h-[44px] text-[13px] text-[#B42318]"
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
          <dl className="space-y-2">
            <div className="flex justify-between gap-3">
              <dt className="text-[#5F6368]">{copy.t("When")}</dt>
              <dd>{item.whenLabel}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[#5F6368]">{copy.t("Where")}</dt>
              <dd>{item.whereLabel}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[#5F6368]">{copy.t("Came from")}</dt>
              <dd>{item.sourceLabel}</dd>
            </div>
          </dl>
        </section>

        {item.nowTitle ? (
          <NowBox
            tone={
              item.nowTone === "ok"
                ? "success"
                : item.nowTone === "warn"
                  ? "attention"
                  : item.nowTone === "risk"
                    ? "danger"
                    : "info"
            }
            title={copy.t(item.nowTitle)}
            body={item.nowBody ? copy.t(item.nowBody) : ""}
            primaryAction={item.primaryAction}
            secondaryAction={item.secondaryAction}
          />
        ) : null}

        {/* Collect deposit — mint pay link + WhatsApp share (criterion 3) */}
        {needsDepositCollect && !showFinish ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleCollectDeposit}
              aria-label={copy.t("Collect deposit")}
              className="w-full min-h-[44px] rounded-xl border border-black/10 bg-white py-3 text-[14px] font-semibold text-[var(--tc-primary)]"
            >
              {copy.t("Collect deposit")}
            </button>
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

        {/* Finish and collect */}
        {item.bookingState === "confirmed" && canAct && !showFinish ? (
          <button
            type="button"
            onClick={() => setShowFinish(true)}
            aria-label={copy.t("Finish and collect")}
            className="w-full min-h-[44px] rounded-xl bg-[var(--tc-primary)] py-3 text-[14px] font-semibold text-white"
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

        {item.paymentState === "awaiting_deposit" &&
        item.bookingState === "completed" &&
        item.paymentMethod === "transfer" &&
        bookingId &&
        canAct ? (
          <button
            type="button"
            onClick={() =>
              startTransition(async () => {
                const res = await markBookingTransferReceived({ bookingId });
                if (res.ok) {
                  setStatus(copy.t("Transfer marked received ✓"));
                  router.refresh();
                } else {
                  setStatus(`${copy.t("Could not confirm transfer")}: ${res.reason}`);
                }
              })
            }
            aria-label={copy.t("Mark transfer received")}
            className="w-full min-h-[44px] rounded-xl border border-black/10 bg-white py-3 text-[14px] font-semibold text-[var(--tc-primary)]"
          >
            {copy.t("Mark transfer received")}
          </button>
        ) : null}

        {/* Status feedback */}
        {status ? (
          <p className="text-center text-[13px] text-[#5F6368]" aria-live="polite">{status}</p>
        ) : null}

        {/* Trade section */}
        {sections && sections.length > 0 ? <TradeSections sections={sections} /> : null}
      </div>

      <aside className="space-y-4">
        <MoneyBlock items={item.moneyLines ?? []} />
        {item.terms ? (
          <section className="rounded-2xl border border-black/8 bg-white p-4 text-[13px] text-[#5F6368]">
            <h2 className="mb-2 text-[14px] font-semibold text-[var(--tc-primary)]">{copy.t("Terms")}</h2>
            <p>{item.terms}</p>
          </section>
        ) : null}
        {item.history && item.history.length > 0 ? (
          <section className="rounded-2xl border border-black/8 bg-white p-4 text-[13px] text-admin-ink-muted">
            <h2 className="mb-2 text-[14px] font-semibold text-[var(--tc-primary)]">{copy.t("History")}</h2>
            <ul className="space-y-2">
              {item.history.map((line) => (
                <li key={`${line.at}-${line.label}`}>
                  <time dateTime={line.at} className="block text-[11px] text-admin-ink-dim">
                    {new Date(line.at).toLocaleString()}
                  </time>
                  <span>{line.label}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </aside>

      {/* Cancel confirm dialog */}
      {confirmCancel && (
        <ConfirmDialog
          title={copy.t("Cancel this booking?")}
          body={copy.t("This cannot be undone. Any refund due is calculated when you confirm.")}
          confirmLabel={copy.t("Cancel booking")}
          destructive
          onConfirm={handleCancelConfirm}
          onCancel={() => setConfirmCancel(false)}
        />
      )}
    </div>
  );
}
