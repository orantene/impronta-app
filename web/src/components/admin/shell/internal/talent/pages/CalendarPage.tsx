"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useDashboardText } from "../../dashboard-i18n";
import { CapsLabel, EmptyState, SecondaryButton } from "../../primitives";
import { AVAILABILITY_BLOCKS, COLORS, EARNINGS_ROWS, FONTS, MY_TALENT_PROFILE, PAYMENT_METHOD_META, RICH_INQUIRIES, TALENT_BOOKINGS, TALENT_REQUESTS, TRANSITION, useAdminShell } from "../../state";
import { ICalSubscribeCard } from "../../wave2";
import { createTalentAvailabilityBlock } from "@/lib/talent-calendar/actions";
import { CalendarDayView, CalendarMonthGrid, CalendarWeekView, parseDateForCalMonth, type CalendarEvent, type CalendarEventKind } from "../shared/calendar-1";
import { CalendarEventRow, ConflictBanner, FilterChipStrip, computePayoutSpeed, parseMayDay } from "../shared/calendar-2";
import { useTalentConversations } from "../shared/conversation-adapter-1";
import { PageHeader } from "../shared/page-chrome-1";
import { TalentAgencyFilterChips } from "../shared/TalentAgencyFilterChips";
import { BookingHoursCard } from "@/components/appointments/BookingHoursCard";



export function CalendarPage() {
  const { openDrawer, toast, bridgeTalentSelfProfile, bridgeTalentCalendarEntries } = useAdminShell();
  const copy = useDashboardText();
  // Bridge-aware conversations — same source as TalentTodayPage and
  // TalentJobShell. When the bridge has real data, use it for the calendar.
  const conversations = useTalentConversations();
  const isBridgeMode = !!bridgeTalentSelfProfile;
  // B.3 — real calendar data from talent_bookings + talent_holds +
  // talent_availability_blocks. Adapted to the UI's CalendarEvent shape so
  // existing rendering / filtering / month nav works unchanged. Blocks
  // (talent OOO) are skipped for v1 — the calendar UI doesn't render them
  // yet; talent_availability_blocks UI lands in a follow-up.
  const bridgeEvents = useMemo<CalendarEvent[] | null>(() => {
    if (!bridgeTalentCalendarEntries) return null;
    const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return bridgeTalentCalendarEntries
      .filter((entry) => entry.kind !== "block")
      .map((entry): CalendarEvent => {
        const startDate = new Date(entry.startsAt);
        const endDate = new Date(entry.endsAt);
        const startDay = startDate.getDate();
        const endDay = endDate.getDate();
        const dateLabel = startDay === endDay
          ? `${copy.t(MONTH_SHORT[startDate.getMonth()])} ${startDay}`
          : `${copy.t(MONTH_SHORT[startDate.getMonth()])} ${startDay}–${endDay}`;
        const uiKind: CalendarEventKind =
          entry.kind === "booking" && entry.status === "confirmed" ? "booked"
          : entry.kind === "booking" && entry.status === "completed" ? "past"
          : entry.kind === "hold" ? "pending"
          : "inquiry";
        return {
          id: entry.id,
          kind: uiKind,
          client: entry.title,
          brief: entry.subLabel ?? "",
          startDay,
          endDay,
          dateLabel,
          status: entry.kind === "hold"
            ? copy.t(entry.holdStrength === "firm" ? "Firm hold" : "Soft hold")
            : (entry.status ?? copy.t("Confirmed")),
          drawer: { id: "talent-hub-detail", payload: { id: entry.inquiryId ?? entry.id } },
        };
      });
  }, [bridgeTalentCalendarEntries, copy]);
  const [filter, setFilter] = useState<"booked" | "pending" | "inquiry" | "past" | "cancelled" | "all">("booked");
  // F7: Month / Week / Day view toggle. Bridge mode defaults to "week"
  // (a focused near-term view); all three views — including the now real,
  // date-aware month grid — render live bridge data.
  const [viewMode, setViewMode] = useState<"month" | "week" | "day">(isBridgeMode ? "week" : "month");

  // T3 — "Block dates" form state for talent_availability_blocks creation.
  // Reason is required (server validates). Dates are HTML date-input format
  // (YYYY-MM-DD) and converted to ISO at submit. router.refresh() pulls
  // freshly inserted blocks back into bridgeTalentCalendarEntries.
  const router = useRouter();
  const [blockFormOpen, setBlockFormOpen] = useState(false);
  const [blockSaving, startBlockTransition] = useTransition();
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [blockError, setBlockError] = useState<string | null>(null);
  const handleSaveBlock = () => {
    setBlockError(null);
    const talentProfileId = bridgeTalentSelfProfile?.id;
    if (!talentProfileId) {
      setBlockError(copy.t("Profile not loaded — refresh and try again."));
      return;
    }
    if (!blockStart || !blockEnd) {
      setBlockError(copy.t("Pick a start and end date."));
      return;
    }
    if (!blockReason.trim()) {
      setBlockError(copy.t("Add a short reason (e.g. Vacation, Personal)."));
      return;
    }
    const startIso = new Date(`${blockStart}T00:00:00`).toISOString();
    const endIso = new Date(`${blockEnd}T23:59:59`).toISOString();
    if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
      setBlockError(copy.t("End must be after start."));
      return;
    }
    startBlockTransition(async () => {
      const res = await createTalentAvailabilityBlock({
        talentProfileId,
        reason: blockReason.trim(),
        startsAt: startIso,
        endsAt: endIso,
        allDay: true,
        visibility: "agency_visible",
      });
      if (!res.ok) {
        setBlockError(res.error);
        return;
      }
      toast(copy.t("Block saved"));
      setBlockFormOpen(false);
      setBlockStart("");
      setBlockEnd("");
      setBlockReason("");
      router.refresh();
    });
  };

  // Real month navigation — starts on today's actual month in bridge mode,
  // May 2026 in prototype mode so existing mock fixtures align correctly.
  const _today = new Date();
  const [calYear, setCalYear] = useState(isBridgeMode ? _today.getFullYear() : 2026);
  const [calMonth, setCalMonth] = useState(isBridgeMode ? _today.getMonth() + 1 : 5);

  // Deterministic format — avoids server/client ICU space-character mismatch
  // that caused React hydration error #418 (narrow no-break vs regular space).
  const MONTH_NAMES_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const monthLabel = `${copy.t(MONTH_NAMES_LONG[calMonth - 1])} ${calYear}`;
  const stepMonth = (dir: 1 | -1) => {
    setCalMonth((m) => {
      const next = m + dir;
      if (next > 12) { setCalYear((y) => y + 1); return 1; }
      if (next < 1)  { setCalYear((y) => y - 1); return 12; }
      return next;
    });
  };

  // Build a unified event list from the existing data fixtures.
  // Days are parsed loosely — May references stay numeric.
  const confirmedBookings = TALENT_BOOKINGS.filter((b) => b.status === "confirmed");
  // Set of client names that already have confirmed bookings — used to
  // dedupe TALENT_REQUESTS entries that are essentially the same gig
  // already in `confirmed` state. Without this, the calendar shows the
  // same Vogue Italia job as both "Confirmed booking" AND "Offer" (since
  // the prototype fixtures keep both representations).
  const confirmedClients = new Set(confirmedBookings.map((b) => b.client));
  const confirmedInquiryIds = new Set(
    RICH_INQUIRIES.filter((i) => i.stage === "approved" || i.stage === "booked").map((i) => i.id),
  );

  // B.3 — when bridge has live entries, use them as the source of truth
  // (replacing the mock fixture composition below). Empty arrays from the
  // bridge still take precedence so users see a real empty state instead
  // of mock data.
  const events: CalendarEvent[] = bridgeEvents ?? [
    // Confirmed bookings
    ...confirmedBookings.map((b): CalendarEvent => ({
      id: b.id,
      kind: "booked",
      client: b.client,
      brief: b.brief,
      startDay: parseMayDay(b.startDate),
      endDay: parseMayDay(b.endDate ?? b.startDate),
      dateLabel: b.endDate ? `${b.startDate}–${b.endDate.replace(/^[A-Za-z, ]+/, "")}` : b.startDate,
      amount: b.amount,
      status: `${copy.t("Confirmed")} · ${b.location}`,
      drawer: { id: "talent-booking-detail", payload: { id: b.id } },
    })),
    // Pending: holds + offers awaiting reply. Skip when the same client
    // is already confirmed (deduplicates the prototype's overlap fixtures).
    ...TALENT_REQUESTS.filter(
      (r) =>
        (r.status === "needs-answer" || r.status === "accepted") &&
        !confirmedClients.has(r.client),
    ).map(
      (r): CalendarEvent => ({
        id: r.id,
        kind: "pending",
        client: r.client,
        brief: r.brief,
        startDay: parseMayDay(r.date),
        endDay: parseMayDay(r.date, true),
        dateLabel: r.date ?? copy.t("Date TBC"),
        amount: r.amount,
        status:
          r.kind === "hold"
            ? copy.t("Hold · awaiting your reply")
            : r.kind === "offer" && r.status === "accepted"
              ? copy.t("Offer with client")
              : `${r.kind.charAt(0).toUpperCase() + r.kind.slice(1)} · ${copy.t("awaiting your reply")}`,
        drawer: { id: "talent-offer-detail", payload: { id: r.id } },
      }),
    ),
    // Inquiries — coordination/submitted stages. Skip when already booked.
    ...RICH_INQUIRIES.filter(
      (i) =>
        (i.stage === "coordination" || i.stage === "submitted") &&
        !confirmedInquiryIds.has(i.id) &&
        !confirmedClients.has(i.clientName),
    )
      .slice(0, 2)
      .map((i): CalendarEvent => ({
        id: i.id,
        kind: "inquiry",
        client: i.clientName,
        brief: i.brief,
        startDay: parseMayDay(i.date),
        endDay: parseMayDay(i.date, true),
        dateLabel: i.date ?? copy.t("Date TBC"),
        status: copy.t("Coordinator picking talent"),
        drawer: { id: "inquiry-workspace", payload: { inquiryId: i.id, pov: "talent" } },
      })),
    // Past bookings — append payment method to status microcopy when
    // we can find a matching earnings row. "Paid · Transfer · 7d after work"
    // gives the talent immediate insight into client payout speed + method.
    ...TALENT_BOOKINGS.filter((b) => b.status === "wrapped" || b.status === "paid").map(
      (b): CalendarEvent => {
        const earning = EARNINGS_ROWS.find((e) => e.client === b.client && e.amount === b.amount);
        const methodShort = earning ? PAYMENT_METHOD_META[earning.paymentMethod].short : null;
        const payoutSpeed = earning ? computePayoutSpeed(b.startDate, earning.payoutDate) : null;
        const statusBits: string[] = [copy.t(b.status === "paid" ? "Paid" : "Wrapped")];
        if (methodShort) statusBits.push(methodShort);
        if (payoutSpeed) statusBits.push(payoutSpeed);
        return {
          id: b.id,
          kind: "past",
          client: b.client,
          brief: b.brief,
          startDay: parseMayDay(b.startDate),
          endDay: parseMayDay(b.endDate ?? b.startDate),
          dateLabel: b.endDate ? `${b.startDate}–${b.endDate}` : b.startDate,
          amount: b.amount,
          status: statusBits.join(" · "),
          drawer: { id: "talent-booking-detail", payload: { id: b.id } },
        };
      },
    ),
    // Cancelled bookings — talent has a record of what fell through.
    // Status microcopy names who cancelled + when, so the talent can see
    // patterns over time (which clients flake, what timing predicts cancels).
    ...TALENT_BOOKINGS.filter((b) => b.status === "cancelled").map(
      (b): CalendarEvent => {
        const who = b.cancelledBy === "client"
          ? copy.t("Client cancelled")
          : b.cancelledBy === "talent"
            ? copy.t("You cancelled")
            : b.cancelledBy === "agency"
              ? copy.t("Agency cancelled")
              : copy.t("Cancelled");
        const microcopy = [who];
        if (b.cancelTiming) microcopy.push(b.cancelTiming);
        if (b.cancelReason) microcopy.push(b.cancelReason);
        return {
          id: b.id,
          kind: "cancelled",
          client: b.client,
          brief: b.brief,
          startDay: parseMayDay(b.startDate),
          endDay: parseMayDay(b.endDate ?? b.startDate),
          dateLabel: b.endDate ? `${b.startDate}–${b.endDate}` : b.startDate,
          amount: b.amount,
          status: microcopy.join(" · "),
          drawer: { id: "talent-booking-detail", payload: { id: b.id } },
        };
      },
    ),
    // Cancelled inquiries — declined offers + expired requests count too.
    ...TALENT_REQUESTS.filter((r) => r.status === "declined" || r.status === "expired").map(
      (r): CalendarEvent => ({
        id: r.id,
        kind: "cancelled",
        client: r.client,
        brief: r.brief,
        startDay: parseMayDay(r.date),
        endDay: parseMayDay(r.date, true),
        dateLabel: r.date ?? copy.t("Date TBC"),
        amount: r.amount,
        status:
          r.status === "declined"
            ? copy.t("You declined")
            : copy.t("Expired · no response in window"),
        drawer: { id: "talent-offer-detail", payload: { id: r.id } },
      }),
    ),
  ];

  // Bridge mode: replace the mock event list with real inquiry data.
  // `conversations` is bridge-adapted when bridgeTalentSelfProfile is set,
  // falls back to MOCK_CONVERSATIONS otherwise (handled by useTalentConversations).
  // We only override when the bridge is actually live to avoid clobbering the
  // demo with an empty list in standalone prototype mode.
  const effectiveEvents: CalendarEvent[] = isBridgeMode
    ? conversations.map((c): CalendarEvent => {
        const kind: CalendarEventKind =
          c.stage === "booked"    ? "booked"
          : c.stage === "hold"   ? "pending"
          : c.stage === "inquiry" ? "inquiry"
          : c.stage === "cancelled" ? "cancelled"
          : "past";
        // Use year/month-aware parser so month navigation positions events correctly.
        const startDay = parseDateForCalMonth(c.date, calYear, calMonth);
        const endDay   = parseDateForCalMonth(c.date, calYear, calMonth, true);
        // Deterministic short date — avoids ICU space mismatch (hydration error #418).
        const MONTH_NAMES_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        const dateLabel = c.date
          ? (c.date.match(/^\d{4}-\d{2}-\d{2}/)
              ? (() => { const d = new Date(c.date + "T00:00:00"); return `${d.getDate()} ${copy.t(MONTH_NAMES_SHORT[d.getMonth()])}`; })()
              : c.date)
          : copy.t("Date TBC");
        return {
          id: c.id,
          kind,
          client: c.client,
          brief: c.brief,
          startDay,
          endDay,
          dateLabel,
          status:
            kind === "booked"    ? `${copy.t("Booked")}${c.location ? ` · ${c.location}` : ""}`
            : kind === "pending"  ? copy.t("Awaiting your response")
            : kind === "inquiry"  ? copy.t("Coordinator in touch")
            : kind === "cancelled" ? copy.t("Cancelled")
            : copy.t("Completed"),
          drawer: { id: "inquiry-workspace", payload: { inquiryId: c.id, pov: "talent" } },
        };
      })
    : events;

  // Conflict detection — pairs of events that share at least one day.
  // Reported as "{a} overlaps with {b}" so the talent can resolve before
  // either party expects a commitment.
  const conflicts: { a: CalendarEvent; b: CalendarEvent }[] = [];
  for (let i = 0; i < effectiveEvents.length; i++) {
    for (let j = i + 1; j < effectiveEvents.length; j++) {
      const a = effectiveEvents[i]!;
      const b = effectiveEvents[j]!;
      // Past events don't conflict with anything (already happened).
      if (a.kind === "past" || b.kind === "past") continue;
      if (a.startDay === null || b.startDay === null) continue;
      const aEnd = a.endDay ?? a.startDay;
      const bEnd = b.endDay ?? b.startDay;
      const overlap = a.startDay <= bEnd && b.startDay <= aEnd;
      if (overlap) conflicts.push({ a, b });
    }
  }

  // Set of event IDs that participate in any conflict — drives the
  // coral edge marker on the row.
  const conflictedIds = new Set<string>();
  for (const { a, b } of conflicts) {
    conflictedIds.add(a.id);
    conflictedIds.add(b.id);
  }

  const filteredEvents = effectiveEvents.filter((e) => filter === "all" || e.kind === filter);

  const counts = {
    booked: effectiveEvents.filter((e) => e.kind === "booked").length,
    pending: effectiveEvents.filter((e) => e.kind === "pending").length,
    inquiry: effectiveEvents.filter((e) => e.kind === "inquiry").length,
    past: effectiveEvents.filter((e) => e.kind === "past").length,
    cancelled: effectiveEvents.filter((e) => e.kind === "cancelled").length,
    all: effectiveEvents.length,
  };

  return (
    <>
      <PageHeader
        title={copy.t("Calendar")}
        subtitle={copy.t("Bookings, holds & availability")}
        actions={
          // "+ Add" (the talent-add-event drawer) is hidden until off-platform
          // work-logging / calendar-blocking is actually built — both drawer modes
          // are unpersisted "coming soon" stubs, so the button was a dead CTA.
          <SecondaryButton onClick={() => openDrawer("talent-block-dates")}>
            {copy.t("Availability")}
          </SecondaryButton>
        }
      />

      <TalentAgencyFilterChips />

      {/* Conflict alert — coral banner when overlaps exist. Renders one
          line per conflict pair with three resolution actions so the
          talent can act without leaving the calendar. Severity escalates
          to red when 3+ conflicts (rare; signals broken availability). */}
      {conflicts.length > 0 && (
        <ConflictBanner
          conflicts={conflicts}
          onResolve={() => undefined}
        />
      )}

      {/* Filter chip strip — Booked is default since "calendar" mentally
          maps to "what's confirmed". Counts visible per chip. */}
      <FilterChipStrip
        filter={filter}
        onChange={setFilter}
        counts={counts}
      />

      <div style={{ height: 16 }} />

      {/* Month navigation + view toggle row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {/* Month nav — shown in bridge mode so real-date events can be browsed */}
        {isBridgeMode && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginRight: 8 }}>
            <button
              type="button"
              onClick={() => stepMonth(-1)}
              aria-label={copy.t("Previous month")}
              style={{ background: "transparent", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontFamily: FONTS.body, color: COLORS.ink }}
            >‹</button>
            <span style={{ fontSize: 13, fontWeight: 600, fontFamily: FONTS.body, minWidth: 120, textAlign: "center" }} className="text-admin-ink">
              {monthLabel}
            </span>
            <button
              type="button"
              onClick={() => stepMonth(1)}
              aria-label={copy.t("Next month")}
              style={{ background: "transparent", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontFamily: FONTS.body, color: COLORS.ink }}
            >›</button>
          </div>
        )}

        {/* View mode toggle — Month / Week / Day. Month hidden in bridge mode (grid is static). */}
        <div
          role="tablist"
          aria-label={copy.t("Calendar view")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 2,
            background: "rgba(11,11,13,0.05)",
            borderRadius: 999,
            padding: 3,
            fontFamily: FONTS.body,
          }}
        >
          {(["month", "week", "day"] as const).map((m) => {
            const active = viewMode === m;
            return (
              <button
                key={m}
                role="tab"
                aria-selected={active}
                onClick={() => setViewMode(m)}
                style={{
                  background: active ? COLORS.fill : "transparent",
                  color: active ? "#fff" : COLORS.inkMuted,
                  border: "none",
                  borderRadius: 999,
                  padding: "5px 12px",
                  cursor: active ? "default" : "pointer",
                  fontFamily: FONTS.body,
                  fontSize: 11.5,
                  fontWeight: active ? 600 : 500,
                  letterSpacing: 0.1,
                  textTransform: "capitalize",
                }}
              >
                {copy.t(m)}
              </button>
            );
          })}
        </div>
      </div>

      {/* T3 — Block dates affordance. Talent-authored OOO/personal blocks
          write to talent_availability_blocks via createTalentAvailabilityBlock.
          Bridge-mode only — the prototype mock has no insert path. */}
      {isBridgeMode && (
        <div style={{
          marginTop: 12, marginBottom: 12,
          padding: blockFormOpen ? 14 : 0,
          background: blockFormOpen ? "#fff" : "transparent",
          border: blockFormOpen ? `1px solid ${COLORS.borderSoft}` : "none",
          borderRadius: 12,
          fontFamily: FONTS.body,
        }}>
          {!blockFormOpen ? (
            <button
              type="button"
              onClick={() => { setBlockFormOpen(true); setBlockError(null); }}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 999,
                background: "transparent", border: `1px dashed ${COLORS.border}`,
                color: COLORS.inkMuted, fontFamily: FONTS.body,
                fontSize: 12, fontWeight: 500, cursor: "pointer",
                transition: `border-color ${TRANSITION.micro}, color ${TRANSITION.micro}`,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.ink; e.currentTarget.style.color = COLORS.ink; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.color = COLORS.inkMuted; }}
            >
              <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>＋</span>
              {copy.t("Block dates")}
            </button>
          ) : (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 10 }} className="text-admin-ink-muted">
                {copy.t("Mark yourself unavailable")}
              </div>
              <div style={{
                display: "grid", gap: 10,
                gridTemplateColumns: "1fr 1fr", marginBottom: 10,
              }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5 }} className="text-admin-ink-muted">
                  {copy.t("From")}
                  <input
                    type="date"
                    value={blockStart}
                    onChange={(e) => setBlockStart(e.target.value)}
                    style={{
                      padding: "8px 10px", borderRadius: 8,
                      border: `1px solid ${COLORS.border}`,
                      fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink,
                    }}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5 }} className="text-admin-ink-muted">
                  {copy.t("To")}
                  <input
                    type="date"
                    value={blockEnd}
                    onChange={(e) => setBlockEnd(e.target.value)}
                    style={{
                      padding: "8px 10px", borderRadius: 8,
                      border: `1px solid ${COLORS.border}`,
                      fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink,
                    }}
                  />
                </label>
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, marginBottom: 10 }} className="text-admin-ink-muted">
                {copy.t("Reason")}
                <input
                  type="text"
                  placeholder={copy.t("e.g. Vacation, personal, travel")}
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  maxLength={80}
                  style={{
                    padding: "8px 10px", borderRadius: 8,
                    border: `1px solid ${COLORS.border}`,
                    fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink,
                  }}
                />
              </label>
              {blockError && (
                <div style={{
                  fontSize: 12, color: COLORS.coralDeep ?? "#b0303a",
                  background: "rgba(176,48,58,0.06)", border: `1px solid rgba(176,48,58,0.18)`,
                  padding: "6px 10px", borderRadius: 8, marginBottom: 10,
                }}>
                  {blockError}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => {
                    setBlockFormOpen(false);
                    setBlockError(null);
                  }}
                  disabled={blockSaving}
                  style={{
                    padding: "8px 14px", borderRadius: 8,
                    background: "transparent", border: `1px solid ${COLORS.border}`,
                    color: COLORS.inkMuted, fontFamily: FONTS.body,
                    fontSize: 12.5, fontWeight: 500, cursor: blockSaving ? "not-allowed" : "pointer",
                  }}
                >
                  {copy.t("Cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleSaveBlock}
                  disabled={blockSaving}
                  style={{
                    padding: "8px 14px", borderRadius: 8,
                    background: blockSaving ? "rgba(11,11,13,0.4)" : COLORS.fill,
                    border: "none", color: "#fff", fontFamily: FONTS.body,
                    fontSize: 12.5, fontWeight: 600, cursor: blockSaving ? "not-allowed" : "pointer",
                  }}
                >
                  {blockSaving ? copy.t("Saving…") : copy.t("Save block")}
                </button>
              </div>
              <div style={{ marginTop: 10, fontSize: 11, fontStyle: "italic", lineHeight: 1.45 }} className="text-admin-ink-dim">
                {copy.t("Blocks are visible to your agency but private to clients. They keep your calendar accurate so coordinators don't pitch you for dates you can't take.")}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Month grid. Bridge mode renders the real, date-aware grid from
          bridgeTalentCalendarEntries (bookings/holds/blocks on the actual
          current month, clicks → talent-hub-detail). Prototype/standalone
          mode keeps the static May-2026 fixture grid. */}
      {viewMode === "month" && (
        isBridgeMode ? (
          <CalendarMonthGrid
            entries={bridgeTalentCalendarEntries ?? []}
            onOpen={(e) => openDrawer("talent-hub-detail", { id: e.inquiryId ?? e.id })}
          />
        ) : (
          <CalendarMonthGrid />
        )
      )}

      {/* Week view — 7-row stack with day labels. Same row format as
          the list below but explicitly grouped by day. */}
      {viewMode === "week" && (
        <CalendarWeekView events={effectiveEvents} onOpen={(d) => openDrawer(d.id, d.payload)} year={calYear} month={calMonth} />
      )}

      {/* Day view — single-day timeline with morning/afternoon/evening
          buckets. Uses the same event source. */}
      {viewMode === "day" && (
        <CalendarDayView events={effectiveEvents} onOpen={(d) => openDrawer(d.id, d.payload)} />
      )}

      <div style={{ height: 24 }} />

      {/* Filtered event list — uniform row format across all kinds. */}
      <section>
        <CapsLabel>
          {filter === "all"
            ? `${copy.t("All events")} · ${filteredEvents.length}`
            : filter === "booked"
              ? `${copy.t("Confirmed")} · ${filteredEvents.length}`
              : filter === "pending"
                ? `${copy.t("Pending replies")} · ${filteredEvents.length}`
                : filter === "inquiry"
                  ? `${copy.t("Open inquiries")} · ${filteredEvents.length}`
                  : filter === "cancelled"
                    ? `${copy.t("Cancelled")} · ${filteredEvents.length}`
                    : `${copy.t("Past")} · ${filteredEvents.length}`}
        </CapsLabel>
        <div
          style={{
            marginTop: 10,
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {filteredEvents.length === 0 ? (
            <EmptyState
              icon="calendar"
              title={
                filter === "booked"
                  ? copy.t("Calendar's clear")
                  : filter === "pending"
                    ? copy.t("Nothing pending — you're caught up")
                    : filter === "inquiry"
                      ? copy.t("No live inquiries")
                      : copy.t("Archive's empty for now")
              }
              body={
                filter === "booked"
                  ? copy.t("No confirmed bookings on the books. The first one always lands faster than you think.")
                  : filter === "pending"
                    ? copy.t("Every hold has been confirmed or released. Nice.")
                    : filter === "inquiry"
                      ? copy.t("Open inquiries will surface here so they don't get lost in the inbox.")
                      : copy.t("Past bookings will collect here once the first one wraps.")
              }
              compact
            />
          ) : (
            filteredEvents.map((e, idx) => (
              <CalendarEventRow
                key={e.id}
                event={e}
                conflicted={conflictedIds.has(e.id)}
                onOpen={() => openDrawer(e.drawer.id, e.drawer.payload)}
                first={idx === 0}
              />
            ))
          )}
        </div>
      </section>

      <div style={{ height: 16 }} />

      {/* Blocked dates — secondary section, kept compact.
          BRIDGE MODE renders the talent's REAL blocks (the same rows the
          block-dates form above writes). It used to render the mock
          AVAILABILITY_BLOCKS fixture unconditionally, so a real talent saw
          demo blocks while their own saved blocks never appeared here. */}
      {(() => {
        const realBlocks = (bridgeTalentCalendarEntries ?? [])
          .filter((e) => e.kind === "block")
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
        const fmtRange = (startsAt: string, endsAt: string): string => {
          const loc = copy.isSpanish ? "es-MX" : "en-US";
          const s = new Date(startsAt);
          const e = new Date(endsAt);
          if (isNaN(s.getTime())) return "";
          const opts = { month: "short", day: "numeric" } as const;
          const startLabel = s.toLocaleDateString(loc, opts);
          if (isNaN(e.getTime())) return startLabel;
          // Half-open [start, end): a midnight end belongs to the previous day.
          const endInclusive = new Date(e);
          if (e.getHours() === 0 && e.getMinutes() === 0 && endInclusive > s) {
            endInclusive.setDate(endInclusive.getDate() - 1);
          }
          const endLabel = endInclusive.toLocaleDateString(loc, opts);
          return endLabel === startLabel ? startLabel : `${startLabel} – ${endLabel}`;
        };
        const rows = isBridgeMode
          ? realBlocks.map((e) => ({
              key: e.id,
              travel: /travel|flight|trip|tour|viaje/iu.test(`${e.title} ${e.subLabel ?? ""}`),
              range: fmtRange(e.startsAt, e.endsAt),
              reason: e.title || e.subLabel || copy.t("Unavailable"),
            }))
          : AVAILABILITY_BLOCKS.map((a) => ({
              key: a.id,
              travel: a.type === "travel",
              range: `${a.startDate} – ${a.endDate}`,
              reason: a.reason,
            }));
        return (
          <section className="mb-6">
            <CapsLabel>{copy.t("Blocked dates")} · {rows.length}</CapsLabel>
            <div
              style={{
                marginTop: 10,
                background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 12,
                padding: rows.length === 0 ? 0 : "0 14px",
              }}
            >
              {rows.length === 0 ? (
                <EmptyState
                  icon="calendar"
                  title={copy.t("No dates blocked")}
                  body={copy.t("Block unavailable dates so agencies don't pitch you for jobs you can't take.")}
                  compact
                />
              ) : null}
              {rows.map((r) => (
                <div
                  key={r.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 0",
                    borderTop: `1px solid ${COLORS.borderSoft}`,
                    fontFamily: FONTS.body,
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: r.travel ? COLORS.amber : COLORS.inkMuted }} />
                  <span style={{ flex: 1, fontSize: 13.5 }} className="text-admin-ink">
                    {r.range}
                  </span>
                  <span className="text-admin-ink-muted text-xs">{r.reason}</span>
                </div>
              ))}
            </div>
          </section>
        );
      })()}

      {bridgeTalentSelfProfile?.id ? (
        <BookingHoursCard talentProfileId={bridgeTalentSelfProfile.id} showTalentOptIn />
      ) : null}

      <ICalSubscribeCard
        talentName={bridgeTalentSelfProfile?.displayName ?? MY_TALENT_PROFILE.name}
        slug={bridgeTalentSelfProfile?.profileCode ?? "marta-reyes"}
      />
    </>
  );
}
