"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { interpolate } from "@/i18n/interpolate";
import { useT } from "@/i18n/use-t";
import { rescheduleInquiry } from "@/app/(workspace)/[tenantSlug]/admin/_pipeline-actions";
import { pinNextConversation as pinNextConversationP } from "../messages";
import { SecondaryButton, StatusStrip } from "../primitives";
import { COLORS, FONTS, RICH_INQUIRIES, TRANSITION, useAdminShell } from "../state";
import { parseInquiryDays } from "./InboxPage";
import { PageHeader } from "./pages-shared";
import { CalendarListViews } from "@/components/workspace-calendar/CalendarListViews";


export function CalendarPage() {
  const t = useT();
  const { openDrawer, setPage, effectiveCalendarEvents, toast, effectiveTenant } = useAdminShell();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const today = new Date();
  const [displayYear, setDisplayYear] = useState(today.getFullYear());
  const [displayMonth, setDisplayMonth] = useState(today.getMonth());
  const [view, setView] = useState<"month" | "agenda" | "day">("month");
  const year = displayYear;
  const month = displayMonth;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay(); // 0 = Sun

  // Build event map. When bridge calendar events are available, use ISO
  // dates directly. Otherwise fall back to RICH_INQUIRIES + parseInquiryDays.
  const events: Record<number, { id: string; title: string; tone: "ink" | "green" | "amber" | "red" }[]> = {};
  if (effectiveCalendarEvents != null) {
    // Bridge path: ISO date strings, filter to current month/year.
    // Empty array = real workspace with no bookings → calendar stays blank;
    // no RICH_INQUIRIES mock fallback. Previously guarded by `length > 0`,
    // which caused new workspaces to see Mango / Vogue Italia mock events.
    effectiveCalendarEvents.forEach((ev) => {
      const dayKey = ev.starts_at ? ev.starts_at.slice(0, 10) : ev.event_date;
      const d = new Date(dayKey + "T00:00:00");
      if (d.getFullYear() !== year || d.getMonth() !== month) return;
      const day = d.getDate();
      const tone: "ink" | "green" | "amber" | "red" =
        ev.status === "booked" || ev.status === "converted" || ev.status === "approved" ? "green"
        : ev.status === "rejected" || ev.status === "expired" ? "red"
        : ev.status === "submitted" ? "amber"
        : "ink";
      const kindPrefix =
        ev.kind === "hold" ? `${t("dashboard.adminCalendar.holdLabel")}: `
        : ev.kind === "booking" ? `${t("dashboard.adminCalendar.bookingLabel")}: `
        : "";
      const label = `${kindPrefix}${ev.company ?? ev.contact_name}`;
      events[day] = events[day] ?? [];
      events[day].push({ id: ev.id, title: label.slice(0, 24), tone });
    });
  } else {
    // Mock fallback: parse human-readable date strings from RICH_INQUIRIES.
    RICH_INQUIRIES.forEach((inq) => {
      if (!inq.date) return;
      const days = parseInquiryDays(inq.date, month);
      if (days.length === 0) return;
      const tone: "ink" | "green" | "amber" | "red" =
        inq.stage === "booked" || inq.stage === "approved" ? "green"
        : inq.stage === "rejected" || inq.stage === "expired" ? "red"
        : inq.stage === "submitted" ? "amber"
        : "ink";
      days.forEach((d) => {
        events[d] = events[d] ?? [];
        events[d].push({ id: inq.id, title: `${inq.clientName} · ${inq.brief.slice(0, 20)}`, tone });
      });
    });
  }

  const monthLabel = new Date(year, month, 1).toLocaleString(t("dashboard.adminCalendar.dateLocale"), { month: "long", year: "numeric" });
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
  const goToPrev = () => {
    if (month === 0) { setDisplayMonth(11); setDisplayYear((y) => y - 1); }
    else setDisplayMonth((m) => m - 1);
  };
  const goToNext = () => {
    if (month === 11) { setDisplayMonth(0); setDisplayYear((y) => y + 1); }
    else setDisplayMonth((m) => m + 1);
  };
  const goToToday = () => { setDisplayYear(today.getFullYear()); setDisplayMonth(today.getMonth()); };

  // Month-aggregate counts for the StatusStrip.
  const allMonthEvents = Object.values(events).flat();
  const monthCounts = {
    confirmed: allMonthEvents.filter((e) => e.tone === "green").length,
    submitted: allMonthEvents.filter((e) => e.tone === "amber").length,
    inProgress: allMonthEvents.filter((e) => e.tone === "ink").length,
    expired: allMonthEvents.filter((e) => e.tone === "red").length,
  };

  return (
    <>
      <PageHeader
        title={t("dashboard.adminCalendar.title")}
        actions={
          <SecondaryButton onClick={() => openDrawer("new-booking")}>
            {t("dashboard.adminCalendar.newBooking")}
          </SecondaryButton>
        }
      />

      <StatusStrip
        ariaLabel={interpolate(t("dashboard.adminCalendar.overviewAria"), { month: monthLabel })}
        items={[
          { id: "confirmed",  label: t("dashboard.adminCalendar.confirmed"),   value: monthCounts.confirmed,  tone: "green" },
          { id: "submitted",  label: t("dashboard.adminCalendar.submitted"),   value: monthCounts.submitted,  tone: "amber" },
          { id: "inProgress", label: t("dashboard.adminCalendar.inProgress"), value: monthCounts.inProgress, tone: "ink" },
          { id: "expired",    label: t("dashboard.adminCalendar.expired"),     value: monthCounts.expired,    tone: "red" },
        ]}
      />

      <div
        style={{
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 12,
          overflow: "hidden",
          fontFamily: FONTS.body,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 14px",
            borderBottom: `1px solid ${COLORS.borderSoft}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <div className="text-admin-ink text-sm font-semibold">{monthLabel}</div>
            {/* Timezone display (#11) */}
            <div
              title={t("dashboard.adminCalendar.timezoneTip")}
              style={{
                fontSize: 10.5,
                fontWeight: 500,
                color: COLORS.inkMuted,
                background: COLORS.surfaceAlt,
                padding: "2px 6px",
                borderRadius: 5,
                cursor: "default",
              }}
            >
              {Intl.DateTimeFormat().resolvedOptions().timeZone.replace("_", " ")} ·{" "}
              {new Intl.DateTimeFormat("en-US", { timeZoneName: "short" })
                .formatToParts(new Date())
                .find((p) => p.type === "timeZoneName")?.value ?? "local"}
            </div>
          </div>
          <div className="flex gap-1">
            {(["month", "agenda", "day"] as const).map((v) => {
              const viewLabel =
                v === "month"
                  ? t("dashboard.adminCalendar.viewMonth")
                  : v === "agenda"
                    ? t("dashboard.adminCalendar.viewAgenda")
                    : t("dashboard.adminCalendar.viewDay");
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                    view === v ? "bg-admin-accent text-white" : "text-admin-ink-muted"
                  }`}
                >
                  {viewLabel}
                </button>
              );
            })}
            <CalendarNavBtn label="prev" onClick={goToPrev} />
            <CalendarNavBtn label="today" onClick={goToToday} disabled={isCurrentMonth} />
            <CalendarNavBtn label="next" onClick={goToNext} />
          </div>
        </div>
        <div className={view === "month" ? undefined : "hidden"}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            background: "rgba(11,11,13,0.02)",
            borderBottom: `1px solid ${COLORS.borderSoft}`,
          }}
        >
          {Array.from({ length: 7 }, (_, i) =>
            // 1970-01-04 is a Sunday; step through the week for locale-correct short weekday names.
            new Intl.DateTimeFormat(t("dashboard.adminCalendar.dateLocale"), { weekday: "short" }).format(new Date(Date.UTC(1970, 0, 4 + i))),
          ).map((d, i) => (
            <div
              key={i}
              style={{
                padding: "8px 10px",
                fontSize: 11,
                fontWeight: 600,
                                color: COLORS.inkMuted,
              }}
            >
              {d}
            </div>
          ))}
        </div>
        <div
          role="grid"
          aria-label={interpolate(t("dashboard.adminCalendar.gridAria"), { month: monthLabel })}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gridAutoRows: "minmax(96px, auto)",
          }}
        >
          {Array.from({ length: firstWeekday }).map((_, i) => (
            <div key={`pad-${i}`} role="gridcell" aria-hidden style={{ background: "rgba(11,11,13,0.015)" }} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dayEvents = events[day] ?? [];
            const isToday = day === today.getDate();
            const isoDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const eventsSuffix = dayEvents.length > 0
              ? `, ${interpolate(t(dayEvents.length === 1 ? "dashboard.adminCalendar.eventCountOne" : "dashboard.adminCalendar.eventCountOther"), { count: dayEvents.length })}`
              : "";
            const todaySuffix = isToday ? ` ${t("dashboard.adminCalendar.todayParen")}` : "";
            const ariaLabel = `${monthLabel.split(" ")[0]} ${day}${eventsSuffix}${todaySuffix}`;
            return (
              <div
                key={day}
                role="gridcell"
                aria-label={ariaLabel}
                tabIndex={0}
                onClick={() => openDrawer("day-detail", { date: isoDate })}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDrawer("day-detail", { date: isoDate }); } }}
                onDragOver={(e) => {
                  // Accept drops carrying our event payload.
                  if (e.dataTransfer.types.includes("text/x-tulala-inquiry-id")) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    (e.currentTarget as HTMLDivElement).style.background = "rgba(46,125,91,0.10)";
                  }
                }}
                onDragLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = "transparent";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  (e.currentTarget as HTMLDivElement).style.background = "transparent";
                  const inquiryId = e.dataTransfer.getData("text/x-tulala-inquiry-id");
                  const fromDate = e.dataTransfer.getData("text/x-tulala-from-date");
                  if (!inquiryId || isoDate === fromDate) return;
                  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inquiryId)) {
                    toast(t("dashboard.adminCalendar.demoRescheduleBlocked"));
                    return;
                  }
                  startTransition(async () => {
                    const r = await rescheduleInquiry(effectiveTenant.slug, inquiryId, isoDate);
                    if (!r.ok) toast(interpolate(t("dashboard.adminCalendar.rescheduleFailed"), { error: r.error }));
                    else { toast(interpolate(t("dashboard.adminCalendar.movedTo"), { date: isoDate })); router.refresh(); }
                  });
                }}
                style={{
                  padding: "8px 10px",
                  borderTop: `1px solid ${COLORS.borderSoft}`,
                  borderLeft: i % 7 === 0 ? "none" : `1px solid ${COLORS.borderSoft}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  cursor: pending ? "wait" : "pointer",
                  transition: `background ${TRANSITION.micro}`,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.025)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: isToday ? 22 : "auto",
                    height: isToday ? 22 : "auto",
                    background: isToday ? COLORS.accent : "transparent",
                    borderRadius: isToday ? 999 : 0,
                    fontSize: 12,
                    fontWeight: isToday ? 700 : 500,
                    color: isToday ? "#fff" : COLORS.ink,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {day}
                </div>
                {dayEvents.slice(0, 2).map((e, idx) => (
                  <button
                    key={idx}
                    type="button"
                    draggable
                    onDragStart={(ev) => {
                      ev.stopPropagation();
                      ev.dataTransfer.setData("text/x-tulala-inquiry-id", e.id);
                      ev.dataTransfer.setData("text/x-tulala-from-date", isoDate);
                      ev.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={(ev) => { ev.stopPropagation(); pinNextConversationP(e.id); setPage("messages"); }}
                    title={t("dashboard.adminCalendar.eventTip")}
                    style={{
                      fontSize: 10.5,
                      color: e.tone === "green" ? COLORS.green : e.tone === "amber" ? COLORS.amber : e.tone === "red" ? "#c0392b" : COLORS.ink,
                      background:
                        e.tone === "green"  ? "rgba(46,125,91,0.09)"
                        : e.tone === "amber" ? "rgba(184,134,11,0.10)"
                        : e.tone === "red"   ? "rgba(192,57,43,0.08)"
                        : "rgba(11,11,13,0.05)",
                      padding: "2px 6px",
                      borderRadius: 5,
                      border: "none",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      cursor: "grab",
                      fontFamily: FONTS.body,
                      textAlign: "left",
                      width: "100%",
                    }}
                  >
                    {e.title}
                  </button>
                ))}
                {dayEvents.length > 2 && (
                  <span className="text-admin-accent text-admin-10 font-semibold">
                    {interpolate(t("dashboard.adminCalendar.moreCount"), { count: dayEvents.length - 2 })}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        </div>
      </div>
      {view !== "month" && effectiveCalendarEvents != null ? (
        <CalendarListViews
          events={effectiveCalendarEvents}
          view={view}
          onOpen={(id) => { pinNextConversationP(id); setPage("messages"); }}
        />
      ) : null}
    </>
  );
}

function CalendarNavBtn({ label, onClick, disabled }: { label: "prev" | "next" | "today"; onClick?: () => void; disabled?: boolean }) {
  const t = useT();
  const todayLabel = t("dashboard.adminCalendar.today");
  const ariaLabel = label === "prev" ? t("dashboard.adminCalendar.prevMonth") : label === "next" ? t("dashboard.adminCalendar.nextMonth") : todayLabel;
  const content =
    label === "prev" ? (
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 6l-6 6 6 6" />
      </svg>
    ) : label === "next" ? (
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 6l6 6-6 6" />
      </svg>
    ) : (
      todayLabel
    );
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: label === "today" ? "5px 10px" : "5px 8px",
        background: "transparent",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 6,
        cursor: disabled ? "default" : "pointer",
        fontFamily: FONTS.body,
        fontSize: 12,
        color: disabled ? COLORS.inkDim : COLORS.inkMuted,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transition: `border-color ${TRANSITION.micro}, color ${TRANSITION.micro}`,
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.color = COLORS.ink; } }}
      onMouseLeave={(e) => { if (!disabled) { e.currentTarget.style.borderColor = COLORS.borderSoft; e.currentTarget.style.color = COLORS.inkMuted; } }}
    >
      {content}
    </button>
  );
}
