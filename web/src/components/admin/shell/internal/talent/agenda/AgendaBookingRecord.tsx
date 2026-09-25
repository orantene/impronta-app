"use client";

import { useState, useTransition } from "react";
import { BookingStateChip, MoneyBlock, NowBox, PaymentStateChip, TALENT_AGENDA_VARS } from "./primitives";
import type { AgendaListItem } from "./types";
import { cancelBookingWithRefund, markBookingNoShow, markBookingTransferReceived } from "@/lib/talent-agenda";
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
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="More actions"
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
            Cancel
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

  const canAct = !!bookingId;
  const cancellable = canAct && !isAgency;
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
            ? `${copy.t("Cancelled")}. ${copy.t("Refund of")} $${(res.refundableCents / 100).toFixed(2)} ${copy.t("initiated")}.`
            : copy.t("Cancelled ✓"),
        );
        onCancelled?.();
      } else {
        setStatus(`${copy.t("Cancel failed")}: ${res.reason}`);
      }
    });
  }

  const moreActions: MoreMenuAction[] = [
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
          aria-label="Back to calendar"
          className="min-h-[44px] px-1 text-[13px] text-[var(--tc-accent)]"
        >
          ← Back
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
                aria-label="Message client"
                className="min-h-[44px] rounded-full border border-black/10 bg-white px-4 py-2 text-[13px]"
              >
                Message
              </button>
            ) : null}
            {moreActions.length > 0 && <MoreMenu actions={moreActions} />}
          </div>
        </header>

        {item.bookingState === "requested" ? (
          <NowBox
            tone="attention"
            title="Request"
            body="Accepting re-checks the hour on the server. Suggest another time keeps the request open. Decline closes it."
            primaryAction={{
              label: "Accept",
              onClick: () => {
                const inquiryId = refTable === "inquiries" ? (refId || bookingId) : null;
                if (!inquiryId) {
                  setStatus("Open Messages to accept this request.");
                  onMessage?.();
                  return;
                }
                setStatus("Accepting…");
                startTransition(async () => {
                  const res = await respondToInquiryOffer(inquiryId, "accepted");
                  if (res.ok) {
                    setStatus("Accepted. The hour was re-checked on the server.");
                    router.refresh();
                  } else {
                    setStatus(`Could not accept: ${res.error}`);
                  }
                });
              },
            }}
            secondaryAction={{
              label: "Suggest another time",
              onClick: () => setShowReschedule(true),
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
              setStatus("Declining…");
              startTransition(async () => {
                const res = await declineInquiryInvitation(inquiryId);
                if (res.ok) {
                  setStatus("Declined. The request is closed.");
                  router.refresh();
                } else {
                  setStatus(`Could not decline: ${res.error}`);
                }
              });
            }}
          >
            Decline request
          </button>
        ) : null}

        {showReschedule && bookingId ? (
          <AgendaRescheduleSheet
            bookingId={bookingId}
            onClose={() => setShowReschedule(false)}
            onProposed={() => {
              setShowReschedule(false);
              setStatus("Reschedule proposed. Waiting for the client.");
            }}
          />
        ) : null}

        <section className="rounded-2xl border border-black/8 bg-white p-4 text-[14px]">
          <dl className="space-y-2">
            <div className="flex justify-between gap-3">
              <dt className="text-[#5F6368]">When</dt>
              <dd>{item.whenLabel}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[#5F6368]">Where</dt>
              <dd>{item.whereLabel}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[#5F6368]">Came from</dt>
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
            title={item.nowTitle}
            body={item.nowBody ?? ""}
            primaryAction={item.primaryAction}
            secondaryAction={item.secondaryAction}
          />
        ) : null}

        {/* Finish and collect */}
        {item.bookingState === "confirmed" && canAct && !showFinish ? (
          <button
            type="button"
            onClick={() => setShowFinish(true)}
            aria-label="Finish and collect"
            className="w-full min-h-[44px] rounded-xl bg-[var(--tc-primary)] py-3 text-[14px] font-semibold text-white"
          >
            Finish and collect
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
              setStatus("Finished and collected ✓");
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
                  setStatus("Transfer marked received ✓");
                  router.refresh();
                } else {
                  setStatus(`Could not confirm transfer: ${res.reason}`);
                }
              })
            }
            aria-label="Mark transfer received"
            className="w-full min-h-[44px] rounded-xl border border-black/10 bg-white py-3 text-[14px] font-semibold text-[var(--tc-primary)]"
          >
            Mark transfer received
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
            <h2 className="mb-2 text-[14px] font-semibold text-[var(--tc-primary)]">Terms</h2>
            <p>{item.terms}</p>
          </section>
        ) : null}
      </aside>

      {/* Cancel confirm dialog */}
      {confirmCancel && (
        <ConfirmDialog
          title="Cancel this booking?"
          body="This cannot be undone. Any refund due is calculated when you confirm."
          confirmLabel="Cancel booking"
          destructive
          onConfirm={handleCancelConfirm}
          onCancel={() => setConfirmCancel(false)}
        />
      )}
    </div>
  );
}
