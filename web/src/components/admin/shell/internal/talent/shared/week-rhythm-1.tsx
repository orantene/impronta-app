"use client";

import { useMemo } from "react";
import { useDashboardText } from "../../dashboard-i18n";
import { pinNextConversation as pinNextConversationT, pinNextThreadTab as pinNextThreadTabT } from "../../messages";
import { COLORS, FONTS, RADIUS, TRANSITION, useAdminShell } from "../../state";
import { useTalentConversations } from "./conversation-adapter-1";

// Real "today", isolated in a module helper so the argless `new Date()` call
// stays out of the component body (react-hooks/purity). Pinned once at mount
// via useMemo so the strip doesn't drift across re-renders.
function todayLocal(): Date {
  return new Date();
}

// ════════════════════════════════════════════════════════════════════
// WS-8.4 This-week rhythm strip — booked/hold cells map to real (bridge)
// conversations the talent can click into, anchored to the real current week.
// ════════════════════════════════════════════════════════════════════

const DAY_COLORS: Record<string, { bg: string; label: string; border: string }> = {
  booked:    { bg: COLORS.accentSoft, label: COLORS.accent,    border: COLORS.accent },
  hold:      { bg: "rgba(217,119,6,0.08)", label: "rgba(180,100,0,1)", border: "rgba(217,119,6,0.3)" },
  available: { bg: COLORS.surfaceAlt, label: COLORS.inkMuted, border: COLORS.borderSoft },
  blocked:   { bg: COLORS.card,       label: COLORS.inkDim,   border: COLORS.borderSoft },
  today:     { bg: COLORS.accent,    label: "#fff",          border: COLORS.accent },
};


// Parse a conversation date label into the day-of-month it covers.
// Handles "Wed, May 14" / "May 14–15" / "Sat, Jun 21" / "Jul 4–5" etc.
// Returns the *first* day of the range when multi-day; null if unparsed.
function convFirstDay(label?: string): { month: string; day: number } | null {
  if (!label) return null;
  const m = label.match(/([A-Za-z]+)\s+(\d{1,2})/);
  if (!m) return null;
  const day = parseInt(m[2]!, 10);
  return isNaN(day) ? null : { month: m[1]!, day };
}


export function WeekRhythmStrip() {
  const copy = useDashboardText();
  const { setTalentPage } = useAdminShell();
  const conversations = useTalentConversations();
  // Build a Mon–Sun strip for the REAL current week. `todayDate` is pinned
  // once at mount (module helper keeps the argless new Date() out of the
  // render body for react-hooks/purity); the strip then runs from the most
  // recent Monday on/before today through the following Sunday.
  const todayDate = useMemo(() => todayLocal(), []);
  const todayDow = todayDate.getDay(); // 0=Sun..6=Sat
  const offsetToMon = todayDow === 0 ? -6 : 1 - todayDow;
  const weekStart = new Date(todayDate);
  weekStart.setDate(todayDate.getDate() + offsetToMon);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  // For each day in the strip, find the first booked/hold conversation
  // whose date covers it. Returns the first match — multi-talent days
  // are rare and a single chip + click is cleaner than stacking.
  const cellFor = (date: Date) => {
    const dayNum = date.getDate();
    const monthShort = date.toLocaleString("en-US", { month: "short" });
    for (const c of conversations) {
      if (c.stage !== "booked" && c.stage !== "hold") continue;
      const parsed = convFirstDay(c.date);
      if (!parsed) continue;
      // Match if the conversation's month + day equals the cell's
      // month + day. Multi-day shoots are matched on their first day
      // only; future improvement: span dashes across all matching cells.
      if (parsed.month.slice(0, 3).toLowerCase() === monthShort.toLowerCase() && parsed.day === dayNum) {
        return c;
      }
      // Multi-day range — match if the cell's day falls inside the
      // start–end span (same month).
      const range = c.date?.match(/([A-Za-z]+)\s+(\d{1,2})[–-](\d{1,2})/);
      if (range) {
        const rangeMonth = range[1]!.slice(0, 3).toLowerCase();
        const startDay = parseInt(range[2]!, 10);
        const endDay = parseInt(range[3]!, 10);
        if (rangeMonth === monthShort.toLowerCase() && dayNum >= startDay && dayNum <= endDay) {
          return c;
        }
      }
    }
    return null;
  };

  // Pin + open the conversation in the messages shell on the Booking tab.
  const openConv = (convId: string) => {
    pinNextConversationT(convId);
    pinNextThreadTabT("booking");
    setTalentPage("messages");
  };

  return (
    <section style={{ background: "#fff", border:     `1px solid ${COLORS.borderSoft}`, padding:    "14px 18px", marginBottom: 0 }} className="rounded-admin-lg">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, fontFamily: FONTS.body }} className="text-admin-ink">
            {copy.t("This week")}
          </div>
          <div style={{ fontSize: 10.5, fontFamily: FONTS.body, marginTop: 1 }} className="text-admin-ink-muted">
            {weekDays[0]!.toLocaleString("en-US", { month: "short", day: "numeric" })} – {weekDays[6]!.toLocaleString("en-US", { month: "short", day: "numeric" })}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setTalentPage("calendar")}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: COLORS.inkMuted, fontFamily: FONTS.body }}
        >
          {copy.t("Open calendar →")}
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {weekDays.map((date, i) => {
          const conv = cellFor(date);
          const isToday = date.toDateString() === todayDate.toDateString();
          const status: keyof typeof DAY_COLORS =
            isToday ? "today"
            : conv?.stage === "booked" ? "booked"
            : conv?.stage === "hold" ? "hold"
            : "available";
          const theme = DAY_COLORS[status]!;
          const dayShort = date.toLocaleString("en-US", { weekday: "short" });
          const dayNum = date.getDate();
          const label = conv ? `${conv.client.split(" ")[0]} · ${conv.brief.split(" ").slice(0, 3).join(" ")}` : null;
          const Tag = conv ? "button" : "div";
          return (
            <Tag
              key={i}
              {...(conv ? {
                onClick: () => openConv(conv.id),
                title: `${conv.client} · ${conv.brief}`,
                "aria-label": `${dayShort} ${dayNum} — ${conv.client}, ${copy.t("open booking")}`,
                type: "button" as const,
              } : { title: status })}
              style={{
                background:   theme.bg,
                border:       `1px solid ${theme.border}`,
                borderRadius: RADIUS.sm,
                padding:      "6px 4px",
                textAlign:    "center",
                minHeight:    52,
                cursor:       conv ? "pointer" : "default",
                fontFamily:   FONTS.body,
                transition:   `transform ${TRANSITION.micro}, box-shadow ${TRANSITION.micro}`,
                ...(conv ? {
                  // Subtle lift on hover — signals interactivity without
                  // being noisy. Touch devices ignore the hover.
                } : {}),
              }}
              {...(conv ? {
                onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
                  e.currentTarget.style.boxShadow = "0 2px 6px rgba(11,11,13,0.10)";
                },
                onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
                  e.currentTarget.style.boxShadow = "none";
                },
              } : {})}
            >
              <div style={{
                fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
                textTransform: "uppercase", color: theme.label,
                fontFamily: FONTS.body, marginBottom: 1,
              }}>
                {dayShort}
              </div>
              <div style={{
                fontSize: 13, fontWeight: 700, color: theme.label,
                fontFamily: FONTS.body, lineHeight: 1, marginBottom: 3,
                fontVariantNumeric: "tabular-nums",
              }}>
                {dayNum}
              </div>
              {label ? (
                <div style={{
                  fontSize: 9, color: theme.label, fontFamily: FONTS.body,
                  lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis",
                  wordBreak: "break-word",
                  display: "-webkit-box",
                  WebkitLineClamp: 2 as unknown as string,
                  WebkitBoxOrient: "vertical",
                }}>
                  {label}
                </div>
              ) : (
                <div style={{
                  fontSize: 9, color: theme.label, fontFamily: FONTS.body,
                  opacity: 0.6,
                }}>
                  {isToday ? copy.t("Today") : copy.t("Free")}
                </div>
              )}
            </Tag>
          );
        })}
      </div>
    </section>
  );
}
