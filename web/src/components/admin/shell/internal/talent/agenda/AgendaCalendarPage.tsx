"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { blocksTime } from "@/lib/talent-agenda/derive";
import type { TalentAgendaItem } from "@/lib/talent-agenda/types";
import type { BookingHours } from "@/lib/scheduling/hours-types";
import {
  createTalentAvailabilityBlock,
  deleteTalentAvailabilityBlock,
} from "@/lib/talent-calendar/actions";
import type { TalentCalendarEntry } from "../../data-bridge";
import { PageHeader } from "../shared/page-chrome-1";
import { PrimaryButton, SecondaryButton } from "../../primitives";
import { NowBox, TALENT_AGENDA_VARS } from "./primitives";
import {
  agendaItemFromCalendarEntry,
  itemsOnDay,
  weekDays,
  weekSubtitle,
} from "./present";
import { whoLabel } from "@/lib/talent-agenda/attention-cta";
import type { TradeCalendarRule } from "@/lib/talent-agenda/trade-calendar";
import { useAgendaCta } from "./use-agenda-cta";
import { useAgendaCopy } from "./use-agenda-copy";
import { AgendaRescheduleSheet } from "./AgendaRescheduleSheet";
import { AgendaPayRequest } from "./AgendaPayRequest";
import { AgendaCalendarSync } from "./AgendaCalendarSync";
import { setAgendaAttentionConfirm } from "./attention-confirm";
import { AddMenu, BlockTimeForm, CalendarList, EventPeek, Overlay, Segmented } from "./AgendaCalendarParts";
import {
  CompactMonth,
  DayTimeline,
  MonthGrid,
  PhoneDayAgenda,
  WeekGrid,
  WeekLegend,
  WeekStrip,
  dayWindows,
  gridBounds,
  localYmd,
  sameDay,
} from "./AgendaCalendarViews";
import {
  daySummary,
  durationText,
  filterCounts,
  isRecord,
  nextFreeTime,
  shiftMonth,
  stepDate,
  type CalendarView,
  type ListFilter,
} from "./calendar-view";

const MUTED = "text-[rgba(11,11,13,0.62)]";

function overlapItem(items: readonly TalentAgendaItem[], start: Date, end: Date): TalentAgendaItem | null {
  for (const item of items) {
    if (!blocksTime(item)) continue;
    if (item.booking !== "confirmed" && item.booking !== "hold") continue;
    const a = Date.parse(item.startsAt);
    const b = Date.parse(item.endsAt);
    if (start.getTime() < b && end.getTime() > a) return item;
  }
  return null;
}

function toTimeInput(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function AgendaCalendarPage({
  items,
  entries,
  now,
  hours,
  talentProfileId,
  overnightToHour,
  loadError,
  tradeRules,
  onOpenToday,
  onNewBooking,
  onOpenAvailability,
  onOpenRecord,
  onOpenMessages,
}: {
  items?: TalentAgendaItem[];
  entries?: TalentCalendarEntry[];
  now?: Date;
  hours?: BookingHours | null;
  talentProfileId?: string;
  /** T5.6 dancer overnight display extends past midnight (e.g. 26 = 2am next day). */
  overnightToHour?: number | null;
  loadError?: string | null;
  tradeRules?: TradeCalendarRule | null;
  onOpenToday: () => void;
  onNewBooking?: () => void;
  onOpenAvailability?: () => void;
  onOpenRecord?: (id: string) => void;
  onOpenMessages?: () => void;
}) {
  const copy = useAgendaCopy();
  const router = useRouter();
  const clock = now ?? new Date();
  const locale = copy.locale === "es" ? "es-MX" : "en-US";
  const agenda = useMemo(
    () => items ?? (entries ?? []).map(agendaItemFromCalendarEntry),
    [items, entries],
  );
  const ctaNav = useMemo(
    () => ({
      onOpenBooking: onOpenRecord,
      onOpenMessages,
      onRequestDeposit: (item: TalentAgendaItem) => {
        setSheet({ kind: "deposit", item });
        setPeekId(null);
      },
    }),
    [onOpenRecord, onOpenMessages],
  );
  const { runPeekLabel, busyId, error: ctaError, setError: setCtaError } = useAgendaCta(ctaNav);
  const [view, setView] = useState<CalendarView>("week");
  const [selected, setSelected] = useState(clock);
  // AUD-016: the visible week follows the selected date, not the clock.
  const days = weekDays(selected);
  const [phone, setPhone] = useState(false);
  const [peekId, setPeekId] = useState<string | null>(null);
  const [peekAnchor, setPeekAnchor] = useState<{ top: number; left: number } | null>(null);
  const [sheet, setSheet] = useState<
    | null
    | { kind: "reschedule"; item: TalentAgendaItem }
    | { kind: "deposit"; item: TalentAgendaItem }
    | { kind: "collect"; item: TalentAgendaItem }
  >(null);
  // One overlay at a time: the + menu, the block form or the date picker.
  const [overlay, setOverlay] = useState<null | "add" | "block" | "picker" | "sync">(null);
  const [pickerMonth, setPickerMonth] = useState(clock);
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [blockDate, setBlockDate] = useState(localYmd(clock));
  const [blockStart, setBlockStart] = useState("13:45");
  const [blockEnd, setBlockEnd] = useState("14:45");
  const [blockNote, setBlockNote] = useState("");
  const [blockAgencyVisible, setBlockAgencyVisible] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [undo, setUndo] = useState<{ id: string; label: string } | null>(null);
  const [localBlocks, setLocalBlocks] = useState<TalentAgendaItem[]>([]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 720px)");
    const apply = () => {
      setPhone(media.matches);
      // The month grid has no phone layout: fall back to the agenda strip.
      if (media.matches) setView((v) => (v === "month" ? "week" : v));
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!undo) return;
    const t = window.setTimeout(() => setUndo(null), 10_000);
    return () => window.clearTimeout(t);
  }, [undo]);

  const allItems = useMemo(() => [...agenda, ...localBlocks], [agenda, localBlocks]);
  const peek = allItems.find((item) => item.id === peekId) ?? null;
  const weekItems = days.flatMap((day) => itemsOnDay(allItems, day));
  const counts = filterCounts(weekItems);
  const bounds = (() => {
    const base = gridBounds(hours, days, clock);
    if (overnightToHour != null && overnightToHour > 24) {
      return { ...base, endMin: Math.max(base.endMin, overnightToHour * 60) };
    }
    return base;
  })();

  const blockRange = useMemo(() => {
    const [y, mo, d] = blockDate.split("-").map(Number);
    const [sh, sm] = blockStart.split(":").map(Number);
    const [eh, em] = blockEnd.split(":").map(Number);
    return {
      start: new Date(y || 1970, (mo || 1) - 1, d || 1, sh || 0, sm || 0),
      end: new Date(y || 1970, (mo || 1) - 1, d || 1, eh || 0, em || 0),
    };
  }, [blockDate, blockStart, blockEnd]);
  const conflict = overlapItem(allItems, blockRange.start, blockRange.end);
  const blockInvalid = blockRange.end.getTime() <= blockRange.start.getTime();
  const blockLabel = `${blockStart}–${blockEnd}`;

  const selectedItems = itemsOnDay(allItems, selected);
  const summary = daySummary(selectedItems);
  const summaryText = summary.count
    ? `${summary.count} ${copy.t(summary.count === 1 ? "appointment" : "appointments")} · ${durationText(summary.minutes)} ${copy.t("booked")}`
    : copy.t("Nothing booked");
  const selectedClosed = dayWindows(hours, selected).length === 0;
  const nextFree = nextFreeTime(selected, allItems, (day) => dayWindows(hours, day), clock);

  function openItem(item: TalentAgendaItem, event?: MouseEvent<HTMLElement>) {
    if (phone) {
      if (item.kind !== "block") onOpenRecord?.(item.id);
      return;
    }
    if (event) {
      const rect = event.currentTarget.getBoundingClientRect();
      setPeekAnchor({
        top: Math.min(rect.top, window.innerHeight - 300),
        left: Math.min(rect.right + 8, window.innerWidth - 340),
      });
    } else {
      setPeekAnchor({ top: 120, left: 24 });
    }
    setPeekId(item.id);
  }

  async function handlePeekLabel(item: TalentAgendaItem, label: string) {
    if (label === "Reschedule") {
      setSheet({ kind: "reschedule", item });
      setPeekId(null);
      return;
    }
    if (label === "Collect") {
      setSheet({ kind: "collect", item });
      setPeekId(null);
      return;
    }
    await runPeekLabel(item, label);
  }

  function openBlock(day: Date) {
    setBlockDate(localYmd(day));
    setBlockError(null);
    setOverlay("block");
  }

  async function saveBlock() {
    if (!talentProfileId || conflict || blockInvalid || saving) return;
    setSaving(true);
    setBlockError(null);
    const note = blockNote.trim();
    const result = await createTalentAvailabilityBlock({
      talentProfileId,
      reason: note || "Personal",
      note: note || null,
      startsAt: blockRange.start.toISOString(),
      endsAt: blockRange.end.toISOString(),
      allDay: false,
      visibility: blockAgencyVisible ? "agency_visible" : "private",
    });
    setSaving(false);
    if (!result.ok) {
      setBlockError(result.error);
      return;
    }
    const block: TalentAgendaItem = {
      id: result.id,
      kind: "block",
      ref: { table: "block", id: result.id },
      title: note,
      lines: [],
      startsAt: blockRange.start.toISOString(),
      endsAt: blockRange.end.toISOString(),
      allDay: false,
      tz: hours?.timezone ?? "UTC",
      where: { mode: "studio", label: "" },
      bufferAfterMin: 0,
      booking: "confirmed",
      payment: "none",
      money: { totalCents: 0, paidCents: 0, dueCents: 0, currency: "" },
      source: "manual",
      blocksTime: true,
      history: [],
    };
    setLocalBlocks((rows) => [...rows, block]);
    setSelected(blockRange.start);
    setOverlay(null);
    setBlockNote("");
    setUndo({
      id: result.id,
      label: `${blockRange.start.toLocaleDateString(locale, { weekday: "short", day: "numeric" })} · ${blockLabel}`,
    });
    router.refresh();
  }

  async function undoBlock() {
    if (!undo) return;
    const id = undo.id;
    setUndo(null);
    setLocalBlocks((rows) => rows.filter((row) => row.id !== id));
    await deleteTalentAvailabilityBlock(id);
    router.refresh();
  }

  const rangeLabel =
    view === "month"
      ? selected.toLocaleDateString(locale, { month: "long", year: "numeric" })
      : view === "day"
        ? selected.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" })
        : `${days[0].toLocaleDateString(locale, { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString(locale, {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}`;

  const weekCount = weekItems.filter((i) => isRecord(i) && i.booking !== "requested" && i.kind !== "request").length;
  const subtitle =
    view === "day"
      ? summaryText
      : view === "month"
        ? rangeLabel
        : `${weekSubtitle(days[0], weekCount, copy.locale)}${
            counts.requested ? ` · ${counts.requested} ${copy.t(counts.requested === 1 ? "request" : "requests")}` : ""
          }`;

  const listRows = (
    <CalendarList
      days={days}
      items={allItems}
      clock={clock}
      phone={phone}
      filter={listFilter}
      counts={counts}
      onFilter={setListFilter}
      onOpen={(item) => openItem(item)}
      onOpenRecord={onOpenRecord}
    />
  );

  const emptyDay = (
    <section className="rounded-[16px] border border-[rgba(11,11,13,0.10)] bg-white p-5 text-center">
      <h3 className="text-[16px] font-semibold text-[var(--tc-primary)]">
        {selectedClosed
          ? `${copy.t("Closed on")} ${selected.toLocaleDateString(locale, { weekday: "long" })}`
          : copy.t("Nothing booked")}
      </h3>
      {nextFree ? (
        <p className={`mt-1 text-[14px] ${MUTED}`}>
          {`${copy.t("Next free time")}: ${nextFree.toLocaleDateString(locale, {
            weekday: "short",
            day: "numeric",
            month: "short",
          })} ${toTimeInput(nextFree)}`}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {onOpenAvailability ? (
          <SecondaryButton onClick={onOpenAvailability}>{copy.t("Change hours")}</SecondaryButton>
        ) : null}
        {onNewBooking ? (
          <SecondaryButton onClick={onNewBooking}>
            {copy.t(selectedClosed ? "Book anyway" : "New booking")}
          </SecondaryButton>
        ) : null}
      </div>
    </section>
  );

  const phoneHasContent =
    selectedItems.length > 0 ||
    (!selectedClosed && nextFree != null && sameDay(nextFree, selected));

  return (
    <div style={TALENT_AGENDA_VARS} className="space-y-4">
      <PageHeader
        title={copy.t("Bookings")}
        subtitle={phone ? undefined : subtitle}
        actions={
          phone ? (
            <div className="flex items-center gap-2">
              <SecondaryButton
                onClick={() => {
                  setSelected(clock);
                  setView("week");
                }}
              >
                {copy.t("Today")}
              </SecondaryButton>
              <button
                type="button"
                aria-label={copy.t("Add")}
                aria-expanded={overlay === "add"}
                onClick={() => setOverlay("add")}
                className="min-h-[44px] min-w-[44px] rounded-full bg-[var(--tc-primary)] text-[20px] text-white"
              >
                +
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <SecondaryButton onClick={() => setView(view === "list" ? "week" : "list")}>{copy.t(view === "list" ? "Schedule" : "List")}</SecondaryButton>
              {onOpenAvailability ? (
                <SecondaryButton onClick={onOpenAvailability}>{copy.t("Working hours")}</SecondaryButton>
              ) : null}
              <SecondaryButton onClick={() => openBlock(selected)}>{copy.t("Block time")}</SecondaryButton>
              {onNewBooking ? <PrimaryButton onClick={onNewBooking}>{copy.t("New booking")}</PrimaryButton> : null}
            </div>
          )
        }
      />

      {loadError ? (
        <NowBox
          tone="danger"
          title={copy.t("Could not load your agenda")}
          body={loadError}
          primaryAction={{
            label: copy.t("Refresh"),
            onClick: () => {
              if (typeof window !== "undefined") window.location.reload();
            },
          }}
        />
      ) : null}

      {ctaError ? (
        <NowBox
          tone="danger"
          title={ctaError}
          body={copy.t("Nothing else changed.")}
          primaryAction={{ label: copy.t("Dismiss"), onClick: () => setCtaError(null) }}
        />
      ) : null}

      {phone ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => {
                setPickerMonth(selected);
                setOverlay("picker");
              }}
              className="inline-flex min-h-[44px] flex-1 items-center gap-1.5 text-[16px] font-bold text-[var(--tc-primary)]"
            >
              {selected.toLocaleDateString(locale, { month: "long", year: "numeric" })}
              <span aria-hidden className={`text-[11px] ${MUTED}`}>▾</span>
            </button>
            <Segmented
              label={copy.t("Calendar view")}
              value={view === "day" ? "day" : view === "list" ? "list" : "week"}
              onChange={(id) => setView(id)}
              options={[
                { id: "week", label: copy.t("Agenda") },
                { id: "day", label: copy.t("Day") },
                { id: "list", label: copy.t("List") },
              ]}
            />
          </div>
          <WeekStrip days={days} selected={selected} clock={clock} items={allItems} onPick={setSelected} />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <SecondaryButton
            onClick={() => {
              setSelected(clock);
            }}
          >
            {copy.t("Today")}
          </SecondaryButton>
          {([-1, 1] as const).map((dir) => (
            <button
              key={dir}
              type="button"
              aria-label={copy.t(dir < 0 ? "Previous" : "Next")}
              onClick={() => setSelected(stepDate(selected, view, dir))}
              className="min-h-[44px] min-w-[44px] rounded-[10px] border border-[rgba(11,11,13,0.12)] bg-white text-[17px]"
            >
              {dir < 0 ? "‹" : "›"}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setView("month")}
            aria-live="polite"
            className="inline-flex min-h-[44px] items-center gap-2 px-2 text-[16px] font-bold text-[var(--tc-primary)]"
          >
            {rangeLabel}
            <span aria-hidden className={`text-[11px] ${MUTED}`}>▾</span>
          </button>
          {hours?.timezone ? <span className={`text-[13px] ${MUTED}`}>{hours.timezone}</span> : null}
          <span className="flex-1" />
          {view !== "list" ? (
            <Segmented
              label={copy.t("Calendar view")}
              value={view}
              onChange={(id) => setView(id)}
              options={[
                { id: "day", label: copy.t("Day") },
                { id: "week", label: copy.t("Week") },
                { id: "month", label: copy.t("Month") },
              ]}
            />
          ) : null}
          <SecondaryButton onClick={() => setOverlay("sync")}>
            <span aria-hidden>⟳</span> {copy.t("Calendar sync")}
          </SecondaryButton>
        </div>
      )}

      {undo ? (
        <div
          role="status"
          className="flex items-center justify-between rounded-[16px] bg-[var(--tc-primary)] px-4 py-1 text-white"
        >
          <span className="text-[13px]">{`${undo.label} ${copy.t("blocked")}`}</span>
          <button type="button" className="min-h-[44px] px-2 text-[13px] font-semibold" onClick={() => void undoBlock()}>
            {copy.t("Undo")}
          </button>
        </div>
      ) : null}

      {view === "list" ? listRows : null}

      {phone && view === "week" ? (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[16px] font-semibold text-[var(--tc-primary)]">
              {selected.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })}
              {sameDay(selected, clock) ? ` · ${copy.t("today")}` : ""}
            </h2>
            <span className={`text-[13px] ${MUTED}`}>{summaryText}</span>
          </div>
          {phoneHasContent ? (
            <PhoneDayAgenda
              day={selected}
              items={selectedItems}
              allItems={allItems}
              clock={clock}
              hours={hours}
              onOpen={(item) => openItem(item)}
              onGap={() => onNewBooking?.()}
            />
          ) : (
            emptyDay
          )}
        </section>
      ) : null}

      {view === "day" ? (
        <DayTimeline
          day={selected}
          items={allItems}
          clock={clock}
          hours={hours}
          tradeRules={tradeRules}
          onOpen={openItem}
          onGap={() => onNewBooking?.()}
        />
      ) : null}

      {view === "month" && !phone ? (
        <MonthGrid
          anchor={selected}
          clock={clock}
          items={allItems}
          hours={hours}
          onPick={(day) => {
            setSelected(day);
            setView("week");
          }}
        />
      ) : null}

      {view === "week" && !phone ? (
        <>
          <WeekGrid
            days={days}
            items={allItems}
            clock={clock}
            hours={hours}
            bounds={bounds}
            tradeRules={tradeRules}
            onOpen={openItem}
            onSelectDay={(day) => {
              setSelected(day);
              setView("day");
            }}
            onGap={(day) => {
              setSelected(day);
              onNewBooking?.();
            }}
          />
          <WeekLegend />
        </>
      ) : null}

      {overlay === "add" ? (
        <Overlay
          phone={phone}
          closeLabel={copy.t("Close")}
          title={`${copy.t("Add to")} ${selected.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })}`}
          onClose={() => setOverlay(null)}
        >
          <AddMenu
            options={[
              {
                id: "booking",
                title: copy.t("New booking"),
                body: copy.t("A client, a service and a time"),
                run: () => {
                  setOverlay(null);
                  onNewBooking?.();
                },
              },
              {
                id: "block",
                title: copy.t("Block time"),
                body: copy.t("Time off, personal things, travel"),
                // Replace the + menu with the block form: never a sheet on a sheet.
                run: () => openBlock(selected),
              },
              {
                id: "sync",
                title: copy.t("Calendar sync"),
                body: copy.t("Google, Apple, Outlook, import and download"),
                // Replaces the + menu: never a sheet on a sheet.
                run: () => setOverlay("sync"),
              },
            ]}
          />
        </Overlay>
      ) : null}

      {overlay === "block" ? (
        <Overlay
          phone={phone}
          closeLabel={copy.t("Close")}
          title={copy.t("Block time")}
          onClose={() => setOverlay(null)}
          footer={
            <>
              {!phone ? <SecondaryButton onClick={() => setOverlay(null)}>{copy.t("Cancel")}</SecondaryButton> : null}
              <PrimaryButton
                onClick={() => void saveBlock()}
                disabled={Boolean(conflict) || blockInvalid || saving || !talentProfileId}
              >
                {saving ? copy.t("Working…") : `${copy.t("Block")} ${blockLabel}`}
              </PrimaryButton>
            </>
          }
        >
          <BlockTimeForm
            date={blockDate}
            start={blockStart}
            end={blockEnd}
            note={blockNote}
            agencyVisible={blockAgencyVisible}
            onDate={setBlockDate}
            onStart={setBlockStart}
            onEnd={setBlockEnd}
            onNote={setBlockNote}
            onAgencyVisible={setBlockAgencyVisible}
            invalid={blockInvalid}
            conflict={conflict}
            error={blockError}
            label={blockLabel}
            onSubmit={() => void saveBlock()}
          />
        </Overlay>
      ) : null}

      {overlay === "sync" ? (
        <Overlay phone={phone} closeLabel={copy.t("Close")} title={copy.t("Calendar sync")} onClose={() => setOverlay(null)}>
          <AgendaCalendarSync copy={copy} items={allItems} anchor={selected} weekStart={days[0]} />
        </Overlay>
      ) : null}

      {overlay === "picker" ? (
        <Overlay
          phone={phone}
          closeLabel={copy.t("Close")}
          title={copy.t("Choose a date")}
          onClose={() => setOverlay(null)}
          footer={
            <SecondaryButton
              onClick={() => {
                setSelected(clock);
                setView("week");
                setOverlay(null);
              }}
            >
              {copy.t("Go to today")}
            </SecondaryButton>
          }
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label={copy.t("Previous month")}
              onClick={() => setPickerMonth(shiftMonth(pickerMonth, -1))}
              className="min-h-[44px] min-w-[44px] text-[17px]"
            >
              ‹
            </button>
            <b className="text-[15px]">{pickerMonth.toLocaleDateString(locale, { month: "long", year: "numeric" })}</b>
            <button
              type="button"
              aria-label={copy.t("Next month")}
              onClick={() => setPickerMonth(shiftMonth(pickerMonth, 1))}
              className="min-h-[44px] min-w-[44px] text-[17px]"
            >
              ›
            </button>
          </div>
          <CompactMonth
            anchor={pickerMonth}
            selected={selected}
            clock={clock}
            items={allItems}
            onPick={(day) => {
              setSelected(day);
              setOverlay(null);
            }}
          />
        </Overlay>
      ) : null}

      {peek && !phone ? (
        <EventPeek
          item={peek}
          anchor={peekAnchor}
          clock={clock}
          busy={busyId === peek.id}
          onClose={() => {
            setPeekId(null);
            setPeekAnchor(null);
          }}
          onOpenRecord={() => onOpenRecord?.(peek.id)}
          onLabel={(label) => void handlePeekLabel(peek, label)}
        />
      ) : null}

      {sheet?.kind === "reschedule" ? (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-white/95 p-4">
          <AgendaRescheduleSheet
            bookingId={sheet.item.ref?.id || sheet.item.id}
            currentStartsAt={sheet.item.startsAt}
            currentEndsAt={sheet.item.endsAt}
            onClose={() => setSheet(null)}
            onProposed={() => {
              setAgendaAttentionConfirm(whoLabel(sheet.item));
              setSheet(null);
              router.refresh();
            }}
          />
        </div>
      ) : null}

      {sheet?.kind === "deposit" ? (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-white/95 p-4">
          <AgendaPayRequest
            orderId={sheet.item.orderId}
            onClose={() => {
              setSheet(null);
              router.refresh();
            }}
          />
        </div>
      ) : null}

      {sheet?.kind === "collect" ? (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-white/95 p-4">
          <AgendaPayRequest
            orderId={sheet.item.ref?.id || sheet.item.id}
            onClose={() => setSheet(null)}
            onLinkCreated={() => {
              setAgendaAttentionConfirm(whoLabel(sheet.item));
              setSheet(null);
              router.refresh();
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
