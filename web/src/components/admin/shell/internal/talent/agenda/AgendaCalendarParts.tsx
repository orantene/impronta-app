"use client";

import type { ReactNode } from "react";
import type { TalentAgendaItem } from "@/lib/talent-agenda/types";
import { peekActionLabels } from "@/lib/talent-agenda/attention-cta";
import { PrimaryButton, SecondaryButton } from "../../primitives";
import { AgendaRow, BookingStateChip, PaymentStateChip } from "./primitives";
import { itemsOnDay, rowFromAgendaItem } from "./present";
import { placeLabelFor } from "./record-actions";
import { LIST_FILTERS, matchesFilter, serviceLabel, timeRange, type ListFilter } from "./calendar-view";
import { localYmd, sameDay } from "./AgendaCalendarViews";
import { useAgendaCopy } from "./use-agenda-copy";

const MUTED = "text-[rgba(11,11,13,0.62)]";
const DANGER = "text-[rgba(138,31,31,1)]";
const INPUT = "mt-1 block min-h-[44px] w-full rounded-lg border border-[rgba(11,11,13,0.14)] px-2";
const LABEL = "block text-[13px] font-medium text-[var(--tc-primary)]";

const FILTER_LABEL: Record<ListFilter, string> = {
  all: "All",
  requested: "Requests",
  hold: "On hold",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

const SOURCE_LABEL: Record<string, string> = {
  website: "Website",
  tulala: "Tulala",
  manual: "Added by you",
  agency: "Agency",
};

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex gap-0.5 rounded-[10px] bg-[rgba(11,11,13,0.06)] p-[3px]">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="tab"
          aria-selected={value === opt.id}
          onClick={() => onChange(opt.id)}
          className={`min-h-[38px] rounded-lg px-3 text-[13.5px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tc-accent)] ${
            value === opt.id ? "bg-white font-semibold text-[var(--tc-primary)] shadow-sm" : `font-medium ${MUTED}`
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** Phone: bottom sheet. Desktop: centred dialog. Only one is ever open (no sheet on sheet). */
export function Overlay({
  title,
  phone,
  onClose,
  children,
  footer,
  closeLabel,
}: {
  title: string;
  phone: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel: string;
}) {
  return (
    <>
      <button type="button" aria-label={closeLabel} className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={
          phone
            ? "fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-[20px] bg-white p-4 pb-6 shadow-lg"
            : "fixed left-1/2 top-[12vh] z-50 w-[min(520px,calc(100vw-32px))] -translate-x-1/2 rounded-[16px] bg-white p-5 shadow-lg"
        }
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[16px] font-semibold text-[var(--tc-primary)]">{title}</h2>
          <button type="button" aria-label={closeLabel} onClick={onClose} className="min-h-[44px] min-w-[44px] text-[16px]">
            ✕
          </button>
        </div>
        {children}
        {footer ? <div className="mt-4 flex flex-wrap justify-end gap-2">{footer}</div> : null}
      </div>
    </>
  );
}

/** The + menu: one + for two jobs, both start on the selected day. */
export function AddMenu({ options }: { options: { id: string; title: string; body: string; run: () => void }[] }) {
  return (
    <div className="divide-y divide-[rgba(11,11,13,0.08)] rounded-[14px] border border-[rgba(11,11,13,0.10)]">
      {options.map((opt) => (
        <button key={opt.id} type="button" onClick={opt.run} className="flex min-h-[64px] w-full items-center gap-3 px-4 text-left">
          <span className="flex-1">
            <span className="block text-[15px] font-semibold text-[var(--tc-primary)]">{opt.title}</span>
            <span className={`block text-[13px] ${MUTED}`}>{opt.body}</span>
          </span>
          <span aria-hidden className={MUTED}>
            ›
          </span>
        </button>
      ))}
    </div>
  );
}

/** Block time form: the overlap check runs as you pick; Save stays off and names the booking. */
export function BlockTimeForm({
  date,
  start,
  end,
  note,
  agencyVisible,
  onDate,
  onStart,
  onEnd,
  onNote,
  onAgencyVisible,
  invalid,
  conflict,
  error,
  label,
  onSubmit,
}: {
  date: string;
  start: string;
  end: string;
  note: string;
  agencyVisible: boolean;
  onDate: (v: string) => void;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
  onNote: (v: string) => void;
  onAgencyVisible: (v: boolean) => void;
  invalid: boolean;
  conflict: TalentAgendaItem | null;
  error: string | null;
  label: string;
  onSubmit: () => void;
}) {
  const copy = useAgendaCopy();
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className={LABEL}>
        {copy.t("Date")}
        <input className={INPUT} type="date" value={date} onChange={(e) => onDate(e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className={LABEL}>
          {copy.t("From")}
          <input className={INPUT} type="time" value={start} onChange={(e) => onStart(e.target.value)} />
        </label>
        <label className={LABEL}>
          {copy.t("To")}
          <input className={INPUT} type="time" value={end} onChange={(e) => onEnd(e.target.value)} />
        </label>
      </div>
      <label className={LABEL}>
        {copy.t("Note · only you see it")}
        <input className={INPUT} value={note} onChange={(e) => onNote(e.target.value)} />
      </label>
      <label className="flex min-h-[44px] items-start gap-3 text-[13.5px]">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5"
          checked={agencyVisible}
          onChange={(e) => onAgencyVisible(e.target.checked)}
        />
        <span>
          <span className="block font-medium text-[var(--tc-primary)]">{copy.t("Let your agency see this block")}</span>
          <span className={`block text-[12.5px] ${MUTED}`}>{copy.t('They see "Unavailable", not your note.')}</span>
        </span>
      </label>
      {invalid ? (
        <p className={`text-[13px] ${DANGER}`}>{copy.t("End must be after start.")}</p>
      ) : conflict ? (
        <p role="alert" className={`text-[13px] ${DANGER}`}>
          {`${copy.t("Overlaps")} ${conflict.client?.name ?? conflict.title} ${timeRange(conflict.startsAt, conflict.endsAt)}. ${copy.t("Pick another time.")}`}
        </p>
      ) : (
        <p className="rounded-lg bg-[rgba(11,11,13,0.04)] p-2 text-[13px]">
          {`✓ ${copy.t("Nothing is booked")} ${label}. ${copy.t("Clients will see this time as unavailable.")}`}
        </p>
      )}
      {error ? <p className={`text-[13px] ${DANGER}`}>{error}</p> : null}
    </form>
  );
}

/** Desktop summary when an event is clicked: when, where, state words, next actions. */
export function EventPeek({
  item,
  anchor,
  clock,
  busy,
  onClose,
  onOpenRecord,
  onLabel,
}: {
  item: TalentAgendaItem;
  anchor: { top: number; left: number } | null;
  clock: Date;
  busy: boolean;
  onClose: () => void;
  onOpenRecord: () => void;
  onLabel: (label: string) => void;
}) {
  const copy = useAgendaCopy();
  const locale = copy.locale === "es" ? "es-MX" : "en-US";
  const place = placeLabelFor(item.where);
  const row = rowFromAgendaItem(item, clock);
  const block = item.kind === "block";
  return (
    <>
      <button type="button" aria-label={copy.t("Close")} className="fixed inset-0 z-40 bg-black/10" onClick={onClose} />
      <div
        role="dialog"
        aria-label={item.client?.name ?? item.title}
        className="fixed left-[var(--peek-left)] top-[var(--peek-top)] z-50 w-[min(330px,calc(100vw-24px))] space-y-3 rounded-[16px] border border-[rgba(11,11,13,0.12)] bg-white p-4 shadow-lg"
        style={{
          "--peek-top": `${Math.max(12, anchor?.top ?? 120)}px`,
          "--peek-left": `${Math.max(12, anchor?.left ?? 24)}px`,
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold">{block ? copy.t("Blocked") : (item.client?.name ?? item.title)}</h2>
            {item.client?.name || block ? <p className={`text-[14px] ${MUTED}`}>{item.title}</p> : null}
          </div>
          <button type="button" aria-label={copy.t("Close")} className="min-h-[44px] min-w-[44px]" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="text-[13.5px] leading-5">
          {`${new Date(item.startsAt).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })} · ${timeRange(item.startsAt, item.endsAt)}`}
          {place ? <span className={`block ${MUTED}`}>{place}</span> : null}
          {(item.where.travelMin ?? 0) > 0 ? (
            <span className={`block ${MUTED}`}>{`${copy.t("Travel")} ${item.where.travelMin} ${copy.t("min")}`}</span>
          ) : null}
          {item.managedBy ? <span className={`block ${MUTED}`}>{`${item.managedBy.name} · ${copy.t("agency job")}`}</span> : null}
        </p>
        {!block ? (
          <div className="flex flex-wrap gap-2">
            {row.bookingState ? <BookingStateChip state={row.bookingState} /> : null}
            {row.paymentState ? <PaymentStateChip state={row.paymentState} /> : null}
          </div>
        ) : null}
        {!block ? (
          <div className="flex flex-wrap gap-2">
            <PrimaryButton onClick={onOpenRecord}>{copy.t("Open booking")}</PrimaryButton>
            {peekActionLabels(item)
              .filter((label) => label !== "Open booking")
              .map((label, i) => (
                <SecondaryButton key={label} disabled={busy} onClick={() => onLabel(label)}>
                  {busy && i === 0 ? copy.t("Working…") : copy.t(label)}
                </SecondaryButton>
              ))}
          </div>
        ) : null}
      </div>
    </>
  );
}

/** List view: filter chips (counts from the same records) and every record grouped by day. */
export function CalendarList({
  days,
  items,
  clock,
  phone,
  filter,
  counts,
  onFilter,
  onOpen,
  onOpenRecord,
}: {
  days: Date[];
  items: readonly TalentAgendaItem[];
  clock: Date;
  phone: boolean;
  filter: ListFilter;
  counts: Record<ListFilter, number>;
  onFilter: (f: ListFilter) => void;
  onOpen: (item: TalentAgendaItem) => void;
  onOpenRecord?: (id: string) => void;
}) {
  const copy = useAgendaCopy();
  const locale = copy.locale === "es" ? "es-MX" : "en-US";
  const cols = "grid-cols-[120px_1.2fr_1.4fr_140px_160px_120px]";
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label={copy.t("Filter")} className="flex gap-2 overflow-x-auto pb-1">
        {LIST_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            onClick={() => onFilter(f)}
            className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] ${
              filter === f
                ? "border-[var(--tc-action)] bg-[var(--tc-soft)] font-semibold text-[var(--tc-ink)]"
                : "border-[rgba(11,11,13,0.12)] bg-white text-[var(--tc-primary)]"
            }`}
          >
            {copy.t(FILTER_LABEL[f])}
            <span className="tabular-nums opacity-70">{counts[f]}</span>
          </button>
        ))}
      </div>
      {!phone ? (
        <div className={`grid ${cols} gap-3 px-3 text-[12px] font-semibold ${MUTED}`}>
          <span>{copy.t("Time")}</span>
          <span>{copy.t("Client")}</span>
          <span>{copy.t("Work")}</span>
          <span>{copy.t("Booking")}</span>
          <span>{copy.t("Payment")}</span>
          <span>{copy.t("Source")}</span>
        </div>
      ) : null}
      {days.map((day) => {
        const dayItems = itemsOnDay(items, day).filter((i) => matchesFilter(i, filter));
        if (dayItems.length === 0) return null;
        return (
          <section key={localYmd(day)} className="space-y-2">
            <h2 className="text-[13px] font-semibold text-[var(--tc-primary)]">
              {day.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })}
              {sameDay(day, clock) ? ` · ${copy.t("today")}` : ""}
            </h2>
            {dayItems.map((item) => {
              const r = rowFromAgendaItem(item, clock, () => onOpen(item));
              const source = item.managedBy
                ? `${item.managedBy.name} · ${copy.t("agency job")}`
                : copy.t(SOURCE_LABEL[item.source] ?? item.source);
              if (phone) {
                return (
                  <AgendaRow
                    key={item.id}
                    item={{
                      ...r,
                      timeLabel: timeRange(item.startsAt, item.endsAt),
                      note: r.note ? copy.t(r.note) : undefined,
                      sourceLabel: source,
                    }}
                  />
                );
              }
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpenRecord?.(item.id)}
                  className={`grid min-h-[48px] w-full ${cols} items-center gap-3 rounded-xl border border-[rgba(11,11,13,0.08)] bg-white px-3 text-left text-[13px]`}
                >
                  <span className="tabular-nums">{timeRange(item.startsAt, item.endsAt)}</span>
                  <span className="truncate font-semibold">{item.client?.name ?? item.title}</span>
                  <span className={`truncate ${MUTED}`}>{serviceLabel(item) ?? copy.t("No service set")}</span>
                  <span>{r.bookingState ? <BookingStateChip state={r.bookingState} /> : null}</span>
                  <span>{r.paymentState ? <PaymentStateChip state={r.paymentState} /> : null}</span>
                  <span className={`truncate ${MUTED}`}>{source}</span>
                </button>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
