"use client";

/**
 * The customer's booking card (A07 / R04) with its one live action.
 *
 * The token allows ONE action; the other button is drawn disabled with the
 * sentence that says so. Cancel opens A10's confirmation (policy line,
 * what comes back, a reason) and calls `cancelBookingByManageToken`;
 * Reschedule asks for a new time and calls `rescheduleBookingByManageToken`
 * with the time the customer was looking at as the expected window. Every
 * refusal is the engine's sentence in the reader's language.
 */

import { useState, useTransition } from "react";

import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { cancelBookingByManageToken, rescheduleBookingByManageToken } from "@/lib/server-actions/scheduling-engine";
import { schedulingEngineSentence, type SchedulingEngineSentences } from "@/lib/scheduling/engine-refusals";

export type ManageBookingFacts = {
  action: "cancel" | "reschedule";
  title: string;
  status: string;
  startsAt: string | null;
  whenLabel: string;
  place: string | null;
  paidLabel: string;
  deadlineLabel: string;
  refundIfCancelled: number;
  paidCents: number;
  currency: string;
  timeZone: string;
  closed: boolean;
};

export type ManageBookingCopy = {
  statusConfirmed: string;
  statusClosed: string;
  paid: string;
  atVisit: string;
  atVisitValue: string;
  freeUntil: string;
  reschedule: string;
  cancel: string;
  addToCalendar: string;
  onlyCancels: string;
  onlyReschedules: string;
  closed: string;
  note: string;
  cancelTitle: string;
  cancelPolicy: string;
  cancelRefund: string;
  cancelNoRefund: string;
  cancelNothingPaid: string;
  reason: string;
  reasonPlaceholder: string;
  keep: string;
  cancelConfirm: string;
  cancelled: string;
  cancelledRefund: string;
  rescheduleTitle: string;
  newTime: string;
  rescheduleConfirm: string;
  rescheduled: string;
  engine: SchedulingEngineSentences;
};

const BTN =
  "inline-flex h-11 items-center justify-center rounded-[var(--site-radius-base,0.5rem)] border px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50";
const BTN_PRIMARY = `${BTN} border-transparent bg-[var(--token-color-primary,#111111)] text-[#fff]`;
const BTN_SECONDARY = `${BTN} border-border bg-transparent text-[var(--token-color-ink,#111111)]`;
const ROW = "flex items-baseline justify-between gap-4 border-t border-border py-3 text-sm";

function operationKey(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function icsHref(facts: ManageBookingFacts): string | null {
  if (!facts.startsAt) return null;
  const stamp = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    `DTSTART:${stamp(new Date(facts.startsAt).toISOString())}`,
    `SUMMARY:${facts.title.replace(/[\n,;]/g, " ")}`,
    facts.place ? `LOCATION:${facts.place.replace(/[\n,;]/g, " ")}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter((line): line is string => line !== null)
    .join("\r\n");
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(body)}`;
}

export function ManageBookingView({ token, facts, copy }: { token: string; facts: ManageBookingFacts; copy: ManageBookingCopy }) {
  const [mode, setMode] = useState<"idle" | "cancel" | "reschedule">("idle");
  const [reason, setReason] = useState("");
  const [newTime, setNewTime] = useState("");
  const [opKey] = useState(() => operationKey(facts.action));
  const [note, setNote] = useState<string | null>(null);
  const [done, setDone] = useState<{ kind: "cancelled"; refundCents: number } | { kind: "rescheduled"; when: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const calendar = icsHref(facts);

  const canCancel = facts.action === "cancel" && !facts.closed && !done;
  const canReschedule = facts.action === "reschedule" && !facts.closed && !done;

  function cancelNow() {
    setNote(null);
    startTransition(async () => {
      const result = await cancelBookingByManageToken({ token, operationKey: opKey, reason: reason.trim().slice(0, 200) });
      if (!result.ok) {
        setNote(schedulingEngineSentence(result.reason, copy.engine));
        return;
      }
      setDone({ kind: "cancelled", refundCents: result.refundableCents });
      setMode("idle");
    });
  }

  function rescheduleNow() {
    const iso = new Date(newTime);
    if (!newTime || Number.isNaN(iso.getTime())) {
      setNote(copy.engine.invalid);
      return;
    }
    setNote(null);
    startTransition(async () => {
      const result = await rescheduleBookingByManageToken({ token, operationKey: opKey, newStartsAt: iso.toISOString(), expectedStartsAt: facts.startsAt });
      if (!result.ok) {
        setNote(schedulingEngineSentence(result.reason, copy.engine));
        return;
      }
      setDone({ kind: "rescheduled", when: new Intl.DateTimeFormat(undefined, { timeZone: facts.timeZone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(result.startsAt)) });
      setMode("idle");
    });
  }

  return (
    <section className="mt-6 rounded-[var(--site-radius-lg,1rem)] border border-border bg-[var(--token-color-surface-raised,#fff)] p-5" data-manage-booking>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[var(--token-color-line,#e5e5e5)] px-2.5 py-0.5 text-xs font-semibold" data-manage-status={facts.closed ? "closed" : facts.status}>
          {facts.closed || done?.kind === "cancelled" ? copy.statusClosed : copy.statusConfirmed}
        </span>
      </div>
      <h2 className="mt-3 text-xl font-semibold">{facts.title}</h2>
      <p className="mt-1 text-sm text-[var(--token-color-muted,#737373)]">
        {done?.kind === "rescheduled" ? done.when : facts.whenLabel}
        {facts.place ? ` · ${facts.place}` : ""}
      </p>
      <dl className="mt-4">
        <div className={ROW}>
          <dt className="text-[var(--token-color-muted,#737373)]">{copy.paid}</dt>
          <dd className="m-0 font-semibold">{facts.paidLabel}</dd>
        </div>
        <div className={ROW}>
          <dt className="text-[var(--token-color-muted,#737373)]">{copy.atVisit}</dt>
          <dd className="m-0">{copy.atVisitValue}</dd>
        </div>
        <div className={ROW}>
          <dt className="text-[var(--token-color-muted,#737373)]">{copy.freeUntil}</dt>
          <dd className="m-0">{facts.deadlineLabel}</dd>
        </div>
      </dl>

      {done ? (
        <p role="status" className="mt-4 rounded-[var(--site-radius-base,0.5rem)] bg-[var(--token-color-line,#e5e5e5)] px-3 py-2.5 text-sm" data-manage-done={done.kind}>
          {done.kind === "cancelled"
            ? done.refundCents > 0
              ? interpolate(copy.cancelledRefund, { amount: formatOrderMoney(done.refundCents, facts.currency) })
              : copy.cancelled
            : copy.rescheduled}
        </p>
      ) : null}

      {mode === "idle" ? (
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={!canReschedule || pending}
            title={facts.closed ? copy.closed : facts.action !== "reschedule" ? copy.onlyCancels : undefined}
            onClick={() => setMode("reschedule")}
            data-manage-reschedule
          >
            {copy.reschedule}
          </button>
          <button
            type="button"
            className={BTN_SECONDARY}
            disabled={!canCancel || pending}
            title={facts.closed ? copy.closed : facts.action !== "cancel" ? copy.onlyReschedules : undefined}
            onClick={() => setMode("cancel")}
            data-manage-cancel
          >
            {copy.cancel}
          </button>
          {calendar ? (
            <a href={calendar} download="booking.ics" className={BTN_SECONDARY}>
              {copy.addToCalendar}
            </a>
          ) : null}
        </div>
      ) : null}

      {mode === "cancel" ? (
        <form
          className="mt-5 rounded-[var(--site-radius-base,0.5rem)] border border-border p-4"
          data-manage-cancel-form
          onSubmit={(e) => {
            e.preventDefault();
            cancelNow();
          }}
        >
          <h3 className="m-0 text-base font-semibold">{copy.cancelTitle}</h3>
          <p className="mt-2 text-sm">
            <b>{copy.cancelPolicy}</b> {facts.deadlineLabel}
          </p>
          <p className="mt-1 text-sm">
            {facts.paidCents === 0
              ? copy.cancelNothingPaid
              : facts.refundIfCancelled > 0
                ? interpolate(copy.cancelRefund, { amount: formatOrderMoney(facts.refundIfCancelled, facts.currency) })
                : copy.cancelNoRefund}
          </p>
          <label className="mt-3 block text-sm">
            <span className="font-semibold">{copy.reason}</span>
            <input
              value={reason}
              maxLength={200}
              placeholder={copy.reasonPlaceholder}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 h-11 w-full rounded-[var(--site-radius-base,0.5rem)] border border-border bg-transparent px-3 text-sm"
              data-manage-reason
            />
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={BTN_SECONDARY} disabled={pending} onClick={() => setMode("idle")}>
              {copy.keep}
            </button>
            <button type="submit" className={BTN_PRIMARY} disabled={pending} data-manage-cancel-confirm>
              {facts.refundIfCancelled > 0
                ? interpolate(copy.cancelConfirm, { amount: ` · ${formatOrderMoney(facts.refundIfCancelled, facts.currency)}` })
                : interpolate(copy.cancelConfirm, { amount: "" })}
            </button>
          </div>
        </form>
      ) : null}

      {mode === "reschedule" ? (
        <form
          className="mt-5 rounded-[var(--site-radius-base,0.5rem)] border border-border p-4"
          data-manage-reschedule-form
          onSubmit={(e) => {
            e.preventDefault();
            rescheduleNow();
          }}
        >
          <h3 className="m-0 text-base font-semibold">{copy.rescheduleTitle}</h3>
          <label className="mt-3 block text-sm">
            <span className="font-semibold">{copy.newTime}</span>
            <input
              type="datetime-local"
              value={newTime}
              required
              onChange={(e) => setNewTime(e.target.value)}
              className="mt-1 h-11 w-full rounded-[var(--site-radius-base,0.5rem)] border border-border bg-transparent px-3 text-sm"
              data-manage-new-time
            />
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={BTN_SECONDARY} disabled={pending} onClick={() => setMode("idle")}>
              {copy.keep}
            </button>
            <button type="submit" className={BTN_PRIMARY} disabled={pending || !newTime} data-manage-reschedule-confirm>
              {copy.rescheduleConfirm}
            </button>
          </div>
        </form>
      ) : null}

      {note ? (
        <p role="alert" className="mt-3 text-sm text-[#b42318]" data-manage-refusal>
          {note}
        </p>
      ) : null}
      <p className="mt-5 text-xs text-[var(--token-color-muted,#737373)]">{copy.note}</p>
    </section>
  );
}
