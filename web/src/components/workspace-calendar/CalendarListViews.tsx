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
  kind?: "inquiry" | "booking" | "hold" | "order";
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
    <section className="mt-4 rounded-xl border border-black/10 bg-white p-3.5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {viewProp ? null : (
          <>
            <button
              type="button"
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${view === "agenda" ? "bg-[#0F4F3E] text-white" : "text-black/55"}`}
              onClick={() => setLocalView("agenda")}
            >
              {t("dashboard.adminCalendar.viewAgenda")}
            </button>
            <button
              type="button"
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${view === "day" ? "bg-[#0F4F3E] text-white" : "text-black/55"}`}
              onClick={() => setLocalView("day")}
            >
              {t("dashboard.adminCalendar.viewDay")}
            </button>
          </>
        )}
        {view === "day" ? (
          <input
            type="date"
            className="text-sm"
            value={dayIso}
            onChange={(e) => setDayIso(e.target.value)}
          />
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
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
          return (
            <button
              key={`${ev.kind ?? "inquiry"}-${ev.id}-${ev.starts_at ?? ev.event_date}`}
              type="button"
              className="rounded-lg border border-black/10 bg-white px-2.5 py-2 text-left"
              onClick={() => onOpen(ev.id)}
            >
              <div className="text-xs font-semibold">{ev.company ?? ev.contact_name}</div>
              <div className="text-[11px] text-black/55">
                {eventDayKey(ev)}
                {time ? ` · ${time}` : ""}
                {" · "}
                {kindLabel}
              </div>
            </button>
          );
        })}
        {rows.length === 0 ? (
          <div className="text-xs text-black/55">{t("dashboard.adminCalendar.noEventsDay")}</div>
        ) : null}
      </div>
    </section>
  );
}
