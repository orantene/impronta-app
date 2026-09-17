"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { interpolate } from "@/i18n/interpolate";
import { useT } from "@/i18n/use-t";
import { rescheduleInquiry } from "@/app/(workspace)/[tenantSlug]/admin/_pipeline-actions";
import { pinNextConversation as pinNextConversationP } from "../messages/conversation-pending";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { addUtcDays } from "@/lib/scheduling/tz";
import { Icon, StatusStrip } from "../primitives";
import { COLORS, FONTS, RICH_INQUIRIES, TRANSITION, useAdminShell } from "../state";
import { parseInquiryDays } from "./InboxPage";
import { CalendarListViews } from "@/components/workspace-calendar/CalendarListViews";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, Segmented } from "./appointments-classes-ui";
import { CalendarResources, type CalendarClock } from "./CalendarResources";

type CalendarView = "month" | "agenda" | "day" | "resources";
const R = "dashboard.adminCalendar.resources";

/**
 * The board's 34px square nav button. Not `BUTTON_SECONDARY` + `px-0`: the
 * kit's `px-[14px]` wins the cascade and squeezes the chevron to 4px.
 */
const NAV_BUTTON =
  "inline-flex h-[34px] w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-[9px] border border-admin-border bg-admin-card text-admin-ink hover:border-admin-border-strong [transition:border-color_var(--transition-admin-micro)]";

function localYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "Tue 8 Sep": the board's day title, on the venue's clock (the ymd is civil, so UTC keeps it). */
function dayTitle(ymd: string, locale: string): string {
  try {
    const parts = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).formatToParts(new Date(`${ymd}T12:00:00.000Z`));
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    // Day-first in every locale ("Tue 8 Sep"), the kit's date order.
    return `${part("weekday")} ${part("day")} ${part("month")}`.replace(/\.\s/g, " ").trim();
  } catch {
    return ymd;
  }
}


export function CalendarPage() {
  const t = useT();
  const locale = useDashboardLocale();
  const { openDrawer, setPage, effectiveCalendarEvents, toast, effectiveTenant, bridgeTenantIdentity } = useAdminShell();
  const tenantId = bridgeTenantIdentity?.tenantId ?? null;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const today = new Date();
  const [displayYear, setDisplayYear] = useState(today.getFullYear());
  const [displayMonth, setDisplayMonth] = useState(today.getMonth());
  // WS006 is the Resources view; the desktop opens on it. The month grid, the
  // day list and the agenda stay one tab away.
  const [view, setView] = useState<CalendarView>(tenantId ? "resources" : "month");
  // MW13: the phone opens on the agenda, not a month grid too small to read.
  // Set after mount so the first client render matches the server's.
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth <= 720) setView("agenda");
  }, []);
  // The day the header owns, on the venue's clock once the Resources reader
  // has said what that clock is; the browser's today until then.
  const [clock, setClock] = useState<CalendarClock | null>(null);
  const [pickedYmd, setPickedYmd] = useState<string | null>(null);
  const todayYmd = clock?.todayYmd ?? localYmd(today);
  const dayYmd = pickedYmd ?? todayYmd;
  const timeZone = clock?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
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
        ev.status === "booked" ||
        ev.status === "converted" ||
        ev.status === "approved" ||
        ev.status === "confirmed"
          ? "green"
        : ev.status === "rejected" || ev.status === "expired" ? "red"
        : ev.status === "submitted" ? "amber"
        : "ink";
      const kindPrefix =
        ev.kind === "hold" ? `${t("dashboard.adminCalendar.holdLabel")}: `
        : ev.kind === "order" ? `${t("dashboard.adminCalendar.orderLabel")}: `
        : ev.kind === "booking" ? `${t("dashboard.adminCalendar.bookingLabel")}: `
        // Sessions & Classes P1.3. Without this arm a session still appears —
        // the chain falls through to "" — but unlabelled, indistinguishable
        // from an inquiry. The customer-facing word for an occurrence comes
        // from the words table (`events.session`); this is the STAFF rail label.
        : ev.kind === "session" ? `${t("dashboard.adminCalendar.sessionLabel")}: `
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

  const goPrev = () => (view === "month" ? goToPrev() : setPickedYmd(addUtcDays(dayYmd, -1) ?? dayYmd));
  const goNext = () => (view === "month" ? goToNext() : setPickedYmd(addUtcDays(dayYmd, 1) ?? dayYmd));
  const onToday = view === "month" ? isCurrentMonth : dayYmd === todayYmd;
  const goToday = () => { goToToday(); setPickedYmd(null); };
  const views: ReadonlyArray<{ id: CalendarView | "week"; label: string; reason?: string | null }> = [
    { id: "day", label: t("dashboard.adminCalendar.viewDay") },
    { id: "week", label: t(`${R}.viewWeek`), reason: t(`${R}.viewWeekOff`) },
    { id: "agenda", label: t("dashboard.adminCalendar.viewAgenda") },
    { id: "resources", label: t(`${R}.viewResources`) },
    { id: "month", label: t("dashboard.adminCalendar.viewMonth") },
  ];

  return (
    <div className="flex flex-col gap-[16px] font-admin-body leading-[1.2]" data-testid="calendar-page">
      {/* WS006's header: prev / next, "Tue 8 Sep" over "zone · location", the
          view tabs as the board's segmented control, "+ Add" as the primary.
          Today appears only when the shown day (or month) is not today. */}
      <div className="flex flex-wrap items-start justify-between gap-[12px]">
        <div className="flex min-w-0 items-start gap-[10px]">
          <button type="button" aria-label={view === "month" ? t("dashboard.adminCalendar.prevMonth") : t(`${R}.prevDay`)} className={NAV_BUTTON} onClick={goPrev}>
            <span className="inline-block rotate-180"><Icon name="chevron-right" size={14} stroke={1.75} /></span>
          </button>
          <button type="button" aria-label={view === "month" ? t("dashboard.adminCalendar.nextMonth") : t(`${R}.nextDay`)} className={NAV_BUTTON} onClick={goNext}>
            <Icon name="chevron-right" size={14} stroke={1.75} />
          </button>
          {onToday ? null : (
            <button type="button" className={`${BUTTON_SECONDARY} shrink-0`} onClick={goToday}>
              {t("dashboard.adminCalendar.today")}
            </button>
          )}
          <div className="min-w-0 pl-[6px]">
            <h1 className="m-0 text-[22px]! font-semibold leading-[1.15] tracking-[-0.02em] text-admin-ink" data-testid="calendar-title">
              {view === "month" ? monthLabel : dayTitle(dayYmd, locale)}
            </h1>
            <p className="m-0 mt-[4px] text-admin-13 leading-[1.2] text-admin-ink-muted" title={t("dashboard.adminCalendar.timezoneTip")}>
              {timeZone} · {effectiveTenant.name}
            </p>
          </div>
        </div>
        {/* MW13: on the phone the tabs take their own row and scroll; Add is the Create menu's. */}
        <div className="flex shrink-0 flex-wrap items-center gap-[10px] max-[720px]:w-full max-[720px]:flex-nowrap max-[720px]:overflow-x-auto max-[720px]:[scrollbar-width:none]">
          <Segmented<CalendarView | "week">
            label={t("dashboard.adminCalendar.title")}
            value={view}
            options={views}
            onChange={(id) => { if (id !== "week") setView(id); }}
          />
          <button type="button" className={`${BUTTON_PRIMARY} max-[720px]:hidden`} onClick={() => openDrawer("new-booking")} data-testid="calendar-add">
            <Icon name="plus" size={14} stroke={1.75} />
            {t(`${R}.add`)}
          </button>
        </div>
      </div>

      {view === "month" ? (
        <StatusStrip
          ariaLabel={interpolate(t("dashboard.adminCalendar.overviewAria"), { month: monthLabel })}
          items={[
            { id: "confirmed",  label: t("dashboard.adminCalendar.confirmed"),   value: monthCounts.confirmed,  tone: "green" },
            { id: "submitted",  label: t("dashboard.adminCalendar.submitted"),   value: monthCounts.submitted,  tone: "amber" },
            { id: "inProgress", label: t("dashboard.adminCalendar.inProgress"), value: monthCounts.inProgress, tone: "ink" },
            { id: "expired",    label: t("dashboard.adminCalendar.expired"),     value: monthCounts.expired,    tone: "red" },
          ]}
        />
      ) : null}

      <div
        className={view === "month" ? undefined : "hidden"}
        style={{
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 12,
          overflow: "hidden",
          fontFamily: FONTS.body,
        }}
      >
        <div>
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
            // Formatted in UTC: on a browser west of Greenwich the local read of
            // that midnight is the day before, and the header started on "Sat"
            // over a grid whose padding is Sunday-first.
            new Intl.DateTimeFormat(t("dashboard.adminCalendar.dateLocale"), { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(1970, 0, 4 + i))),
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
      {tenantId ? (
        <div className={view === "resources" ? undefined : "hidden"}>
          <CalendarResources tenantId={tenantId} holds={effectiveCalendarEvents ?? []} day={clock ? dayYmd : null} onClock={setClock} />
        </div>
      ) : null}
      {view !== "month" && view !== "resources" && effectiveCalendarEvents != null ? (
        <CalendarListViews
          events={effectiveCalendarEvents}
          view={view}
          dayIso={dayYmd}
          onOpen={(id) => { pinNextConversationP(id); setPage("messages"); }}
        />
      ) : null}
    </div>
  );
}
