"use client";

import { useState } from "react";
import { useT } from "@/i18n/use-t";

export type CalendarListEvent = {
  id: string;
  contact_name: string;
  company: string | null;
  event_date: string;
  status: string;
  starts_at?: string | null;
  timezone?: string | null;
  /**
   * DUPLICATED FROM `_data-bridge/calendar.ts`'s `CalendarEventKind`, and it
   * has to be: that module is `server-only`, so a client component cannot
   * import from it even for a type. The two are hand-maintained copies of one
   * union, which is why adding a kind on the server side reddened the build
   * here rather than at the source — the assignment at CalendarPage.tsx is the
   * only thing holding them together. Add to both, or neither.
   */
  kind?: "inquiry" | "booking" | "hold" | "order" | "session";
};

function eventDayKey(ev: CalendarListEvent): string {
  if (ev.starts_at) return ev.starts_at.slice(0, 10);
  return ev.event_date.slice(0, 10);
}

function eventTimeLabel(ev: CalendarListEvent): string | null {
  if (!ev.starts_at) return null;
  try {
    return new Date(ev.starts_at).toLocaleTimeString(undefined, {
      timeStyle: "short",
      timeZone: ev.timezone || undefined,
    });
  } catch {
    return ev.starts_at.slice(11, 16);
  }
}

export function CalendarListViews({
  events,
  onOpen,
  view: viewProp,
}: {
  events: CalendarListEvent[];
  onOpen: (id: string) => void;
  view?: "agenda" | "day";
}) {
  const t = useT();
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const [localView, setLocalView] = useState<"agenda" | "day">("agenda");
  const view = viewProp ?? localView;
  const [dayIso, setDayIso] = useState(todayIso);

  const rows = events
    .filter((ev) => (view === "day" ? eventDayKey(ev) === dayIso : eventDayKey(ev) >= todayIso))
    .sort((a, b) => (a.starts_at ?? a.event_date).localeCompare(b.starts_at ?? b.event_date))
    .slice(0, 80);

  return (
    <section className="mt-4 rounded-[14px] border border-admin-border bg-admin-card max-[720px]:mt-3">
      <div className="flex flex-wrap items-center gap-2 px-3.5 py-3">
        {viewProp ? null : (
          <>
            <button
              type="button"
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${view === "agenda" ? "bg-admin-brand text-white" : "text-admin-ink-muted"}`}
              onClick={() => setLocalView("agenda")}
            >
              {t("dashboard.adminCalendar.viewAgenda")}
            </button>
            <button
              type="button"
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${view === "day" ? "bg-admin-brand text-white" : "text-admin-ink-muted"}`}
              onClick={() => setLocalView("day")}
            >
              {t("dashboard.adminCalendar.viewDay")}
            </button>
          </>
        )}
        {view === "day" ? (
          <input
            type="date"
            className="h-[36px] rounded-[9px] border border-admin-border bg-admin-card px-3 text-[13px] text-admin-ink"
            value={dayIso}
            onChange={(e) => setDayIso(e.target.value)}
          />
        ) : (
          <span className="text-[12.5px] text-admin-ink-muted">{t("dashboard.adminCalendar.viewAgenda")}</span>
        )}
      </div>
      {/* MW13: rows — time · who · kind, the state as a pill, a hairline between. */}
      <div className="flex flex-col">
        {rows.map((ev) => {
          const time = eventTimeLabel(ev);
          const kindLabel =
            ev.kind === "hold"
              ? t("dashboard.adminCalendar.holdLabel")
              : ev.kind === "order"
                ? t("dashboard.adminCalendar.orderLabel")
              : ev.kind === "booking"
                ? t("dashboard.adminCalendar.bookingLabel")
                : ev.status;
          const tone =
            ev.status === "booked" || ev.status === "converted" || ev.status === "approved" || ev.status === "confirmed"
              ? "bg-admin-success-soft text-admin-green"
              : ev.status === "rejected" || ev.status === "expired"
                ? "bg-admin-critical-soft text-admin-red"
                : ev.status === "submitted"
                  ? "bg-admin-coral-soft text-admin-coral-deep"
                  : "bg-admin-amber-soft text-admin-amber";
          return (
            <button
              key={`${ev.kind ?? "inquiry"}-${ev.id}-${ev.starts_at ?? ev.event_date}`}
              type="button"
              className="flex w-full cursor-pointer items-center gap-2.5 border-t border-admin-border-soft bg-transparent px-3.5 py-3 text-left"
              onClick={() => onOpen(ev.id)}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-semibold text-admin-ink">
                  {time ? <span className="tabular-nums">{time} · </span> : null}
                  {ev.company ?? ev.contact_name}
                </span>
                <span className="mt-0.5 block truncate text-[12.5px] text-admin-ink-muted">
                  {eventDayKey(ev)}
                  {" · "}
                  {kindLabel}
                </span>
              </span>
              <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
                {ev.status}
              </span>
            </button>
          );
        })}
        {rows.length === 0 ? (
          <div className="border-t border-admin-border-soft px-3.5 py-3 text-[13px] text-admin-ink-muted">{t("dashboard.adminCalendar.noEventsDay")}</div>
        ) : null}
      </div>
    </section>
  );
}
