"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { blocksTime, weekCounts } from "@/lib/talent-agenda/derive";
import type { TalentAgendaItem } from "@/lib/talent-agenda/types";
import type { BookingHours } from "@/lib/scheduling/hours-types";
import {
  createTalentAvailabilityBlock,
  deleteTalentAvailabilityBlock,
} from "@/lib/talent-calendar/actions";
import type { TalentCalendarEntry } from "../../data-bridge";
import { PageHeader } from "../shared/page-chrome-1";
import { PrimaryButton, SecondaryButton } from "../../primitives";
import { AgendaRow, NowBox, TALENT_AGENDA_VARS } from "./primitives";
import {
  agendaItemFromCalendarEntry,
  itemsOnDay,
  rowFromAgendaItem,
  weekDays,
} from "./present";
import { peekActionLabels, whoLabel } from "@/lib/talent-agenda/attention-cta";
import type { TradeCalendarRule } from "@/lib/talent-agenda/trade-calendar";
import { useAgendaCta } from "./use-agenda-cta";
import { useAgendaCopy } from "./use-agenda-copy";
import { AgendaRescheduleSheet } from "./AgendaRescheduleSheet";
import { AgendaPayRequest } from "./AgendaPayRequest";
import { setAgendaAttentionConfirm } from "./attention-confirm";
import {
  DayAgenda,
  MonthGrid,
  WeekGrid,
  gridBounds,
  localYmd,
  sameDay,
} from "./AgendaCalendarViews";

type ViewMode = "week" | "month" | "day" | "list";

function overlapTitle(items: readonly TalentAgendaItem[], start: Date, end: Date): string | null {
  for (const item of items) {
    if (item.booking !== "confirmed" || !blocksTime(item)) continue;
    const a = Date.parse(item.startsAt);
    const b = Date.parse(item.endsAt);
    if (start.getTime() < b && end.getTime() > a) return item.title;
  }
  return null;
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
  const agenda = useMemo(
    () => items ?? (entries ?? []).map(agendaItemFromCalendarEntry),
    [items, entries],
  );
  const ctaNav = useMemo(
    () => ({ onOpenBooking: onOpenRecord, onOpenMessages }),
    [onOpenRecord, onOpenMessages],
  );
  const { runPeekLabel, busyId, error: ctaError, setError: setCtaError } = useAgendaCta(ctaNav);
  const days = weekDays(clock);
  const [view, setView] = useState<ViewMode>("week");
  const [selected, setSelected] = useState(clock);
  const [phone, setPhone] = useState(false);
  const [peekId, setPeekId] = useState<string | null>(null);
  const [peekAnchor, setPeekAnchor] = useState<{ top: number; left: number } | null>(null);
  const [sheet, setSheet] = useState<
    | null
    | { kind: "reschedule"; item: TalentAgendaItem }
    | { kind: "collect"; item: TalentAgendaItem }
  >(null);
  const [addOpen, setAddOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockStart, setBlockStart] = useState("13:45");
  const [blockEnd, setBlockEnd] = useState("14:45");
  const [blockReason, setBlockReason] = useState("Personal");
  const [blockError, setBlockError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [undo, setUndo] = useState<{ id: string } | null>(null);
  const [localBlocks, setLocalBlocks] = useState<TalentAgendaItem[]>([]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 720px)");
    const apply = () => setPhone(media.matches);
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
  const counts = weekCounts(allItems);
  const peek = allItems.find((item) => item.id === peekId) ?? null;
  const bounds = (() => {
    const base = gridBounds(hours, days);
    if (overnightToHour != null && overnightToHour > 24) {
      return { ...base, endMin: Math.max(base.endMin, overnightToHour * 60) };
    }
    return base;
  })();

  const blockRange = useMemo(() => {
    const [sh, sm] = blockStart.split(":").map(Number);
    const [eh, em] = blockEnd.split(":").map(Number);
    const start = new Date(selected);
    start.setHours(sh || 0, sm || 0, 0, 0);
    const end = new Date(selected);
    end.setHours(eh || 0, em || 0, 0, 0);
    return { start, end };
  }, [blockStart, blockEnd, selected]);
  const conflict = overlapTitle(allItems, blockRange.start, blockRange.end);

  function openItem(item: TalentAgendaItem, event?: MouseEvent<HTMLElement>) {
    if (phone) {
      onOpenRecord?.(item.id);
      return;
    }
    if (event) {
      const rect = event.currentTarget.getBoundingClientRect();
      setPeekAnchor({
        top: Math.min(rect.bottom + 8, window.innerHeight - 220),
        left: Math.min(Math.max(12, rect.left), window.innerWidth - 320),
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

  async function saveBlock() {
    if (!talentProfileId || conflict || saving) return;
    setSaving(true);
    setBlockError(null);
    const result = await createTalentAvailabilityBlock({
      talentProfileId,
      reason: blockReason,
      startsAt: blockRange.start.toISOString(),
      endsAt: blockRange.end.toISOString(),
      allDay: false,
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
      title: blockReason,
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
    setBlockOpen(false);
    setUndo({ id: result.id });
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

  return (
    <div style={TALENT_AGENDA_VARS} className="space-y-4">
      <PageHeader
        title={copy.t("Calendar")}
        subtitle={copy.t("This week")}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-label={copy.t("Add event or block")}
              aria-expanded={addOpen}
              onClick={() => setAddOpen((o) => !o)}
              className="min-h-[44px] min-w-[44px] rounded-full bg-[var(--tc-primary)] px-4 text-[13px] font-medium text-white"
            >
              +
            </button>
            {onOpenAvailability ? (
              <SecondaryButton onClick={onOpenAvailability}>{copy.t("Availability")}</SecondaryButton>
            ) : null}
            <SecondaryButton onClick={onOpenToday}>{copy.t("Today")}</SecondaryButton>
          </div>
        )}
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

      {addOpen ? (
        <div role="menu" aria-label={copy.t("Add event or block")} className="flex flex-wrap gap-2">
          <SecondaryButton
            onClick={() => {
              setAddOpen(false);
              onNewBooking?.();
            }}
          >
            {copy.t("New booking")}
          </SecondaryButton>
          <SecondaryButton
            onClick={() => {
              setAddOpen(false);
              setBlockOpen(true);
            }}
          >
            {copy.t("Block time")}
          </SecondaryButton>
        </div>
      ) : null}

      {blockOpen ? (
        <form
          className="space-y-3 rounded-[16px] border border-[rgba(11,11,13,0.10)] bg-white p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void saveBlock();
          }}
        >
          <h2 className="text-[15px] font-semibold">{copy.t("Block time")}</h2>
          <p className="text-[13px] text-[#5F6368]">{localYmd(selected)}</p>
          <div className="flex flex-wrap gap-2">
            <input className="min-h-[44px] rounded-lg border px-2" type="time" value={blockStart} onChange={(e) => setBlockStart(e.target.value)} />
            <input className="min-h-[44px] rounded-lg border px-2" type="time" value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)} />
            <input className="min-h-[44px] flex-1 rounded-lg border px-2" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} />
          </div>
          {conflict ? <p className="text-[13px] text-[#8A1F1F]">{copy.t("Overlaps")} {conflict}</p> : null}
          {blockError ? <p className="text-[13px] text-[#8A1F1F]">{blockError}</p> : null}
          <PrimaryButton type="submit" disabled={Boolean(conflict) || saving || !talentProfileId}>
            {copy.t("Save")}
          </PrimaryButton>
        </form>
      ) : null}

      {undo ? (
        <div className="flex items-center justify-between rounded-[16px] bg-[var(--tc-primary)] px-4 py-3 text-white">
          <span className="text-[13px]">{copy.t("Time blocked")}</span>
          <button type="button" className="min-h-[44px] text-[13px] font-semibold" onClick={() => void undoBlock()}>
            {copy.t("Undo")}
          </button>
        </div>
      ) : null}

      <div
        role="tablist"
        aria-label={copy.t("Calendar view")}
        className="flex flex-wrap gap-2"
      >
        {(["week", "day", "month", "list"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={`min-h-[44px] rounded-full px-3 text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tc-accent)] ${view === id ? "bg-[var(--tc-primary)] text-white" : "bg-white text-[var(--tc-primary)]"}`}
          >
            {copy.t(id === "week" ? "Week" : id === "day" ? "Day" : id === "month" ? "Month" : "List")}
          </button>
        ))}
      </div>

      {phone ? (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-[13px] font-medium text-[var(--tc-primary)]">
            <span>{copy.t("Month")}</span>
            <select
              className="min-h-[44px] flex-1 rounded-xl border border-black/10 bg-white px-3"
              value={`${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, "0")}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split("-").map(Number);
                const next = new Date(selected);
                next.setFullYear(y, m - 1, 1);
                setSelected(next);
              }}
            >
              {Array.from({ length: 12 }, (_, i) => {
                const d = new Date(clock.getFullYear(), clock.getMonth() - 3 + i, 1);
                const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                return (
                  <option key={value} value={value}>
                    {d.toLocaleDateString([], { month: "long", year: "numeric" })}
                  </option>
                );
              })}
            </select>
          </label>
          <div className="flex gap-2 overflow-x-auto">
            {days.map((day) => {
              const dots = itemsOnDay(allItems, day).length;
              return (
                <button
                  key={localYmd(day)}
                  type="button"
                  onClick={() => setSelected(day)}
                  className={`min-h-[44px] min-w-[48px] rounded-full px-2 text-[12px] ${sameDay(day, selected) ? "bg-[var(--tc-accent)] text-white" : "bg-white"}`}
                >
                  <div>{day.toLocaleDateString([], { weekday: "short", day: "numeric" })}</div>
                  {dots > 0 ? <div className="mx-auto mt-0.5 h-1.5 w-1.5 rounded-full bg-current opacity-70" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {view === "list" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-[12px]">
            <span className="rounded-full border px-2 py-1">All {counts.all}</span>
            <span className="rounded-full border px-2 py-1">Requests {counts.requests}</span>
            <span className="rounded-full border px-2 py-1">On hold {counts.onHold}</span>
            <span className="rounded-full border px-2 py-1">Confirmed {counts.confirmed}</span>
            <span className="rounded-full border px-2 py-1">Completed {counts.completed}</span>
            <span className="rounded-full border px-2 py-1">Cancelled {counts.cancelled}</span>
            <span className="rounded-full border px-2 py-1">No-show {counts.noShow}</span>
          </div>
          {days.map((day) => {
            const dayItems = itemsOnDay(allItems, day);
            if (dayItems.length === 0) return null;
            return (
              <section key={localYmd(day)} className="space-y-2">
                <h2 className="text-[13px] font-semibold text-[var(--tc-primary)]">
                  {day.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}
                </h2>
                {dayItems.map((item) => (
                  <AgendaRow key={item.id} item={rowFromAgendaItem(item, clock, () => openItem(item))} />
                ))}
              </section>
            );
          })}
        </div>
      ) : null}

      {view === "month" ? <MonthGrid clock={clock} items={allItems} onPick={setSelected} /> : null}

      {view === "day" || (phone && view === "week") ? (
        <DayAgenda
          day={selected}
          items={itemsOnDay(allItems, selected)}
          clock={clock}
          hours={hours}
          onOpen={openItem}
          onGap={() => onNewBooking?.()}
        />
      ) : null}

      {view === "week" && !phone ? (
        <WeekGrid
          days={days}
          items={allItems}
          clock={clock}
          hours={hours}
          bounds={bounds}
          tradeRules={tradeRules}
          onOpen={openItem}
          onSelectDay={setSelected}
          onGap={(day) => {
            setSelected(day);
            onNewBooking?.();
          }}
        />
      ) : null}

      {peek && !phone ? (
        <>
          <button
            type="button"
            aria-label={copy.t("Close")}
            className="fixed inset-0 z-40 bg-black/10"
            onClick={() => {
              setPeekId(null);
              setPeekAnchor(null);
            }}
          />
          <div
            role="dialog"
            aria-label={peek.title}
            className="fixed z-50 w-[min(320px,calc(100vw-24px))] space-y-3 rounded-[16px] border border-[rgba(11,11,13,0.12)] bg-white p-4 shadow-lg top-[var(--peek-top)] left-[var(--peek-left)]"
            style={{
              "--peek-top": `${peekAnchor?.top ?? 120}px`,
              "--peek-left": `${peekAnchor?.left ?? 24}px`,
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold">{peek.title}</h2>
                <p className="text-[13px] text-[#5F6368]">{peek.client?.name}</p>
              </div>
              <button
                type="button"
                className="min-h-[44px] px-2"
                onClick={() => {
                  setPeekId(null);
                  setPeekAnchor(null);
                }}
              >
                {copy.t("Close")}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {peekActionLabels(peek).map((label) => (
                <SecondaryButton
                  key={label}
                  disabled={busyId === peek.id}
                  onClick={() => {
                    void handlePeekLabel(peek, label);
                  }}
                >
                  {busyId === peek.id && label === peekActionLabels(peek)[0]
                    ? copy.t("Working…")
                    : copy.t(label)}
                </SecondaryButton>
              ))}
              <PrimaryButton onClick={() => onOpenRecord?.(peek.id)}>{copy.t("Open booking")}</PrimaryButton>
            </div>
          </div>
        </>
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
