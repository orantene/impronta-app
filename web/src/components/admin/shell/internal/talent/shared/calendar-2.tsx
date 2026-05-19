"use client";

import { type ReactNode } from "react";
import { Icon, SecondaryButton } from "../../primitives";
import { COLORS, FONTS, TRANSITION, useAdminShell } from "../../state";
import { type CalendarEvent, type CalendarEventKind } from "./calendar-1";
import { DateBlock, KindChip } from "./today-1";



// ─── Calendar helpers ────────────────────────────────────────────────

/** Parse "May 14" / "Tue · May 6" / "May 14–15" → numeric day-of-month.
 *  Returns the START day unless `endOfRange` is true. */
/**
 * Lightweight payout-speed compute. Returns "Nd after work" given a
 * work date + payout date. Best-effort string parse — production should
 * subtract real Date objects.
 */
export function computePayoutSpeed(workDate: string, payoutDate: string): string | null {
  const workMatch = workDate.match(/([A-Za-z]+)\s+(\d{1,2})/);
  const payoutMatch = payoutDate.match(/([A-Za-z]+)\s+(\d{1,2})/);
  if (!workMatch || !payoutMatch) return null;
  const monthIdx: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  const wMonth = monthIdx[workMatch[1]!] ?? -1;
  const pMonth = monthIdx[payoutMatch[1]!] ?? -1;
  if (wMonth === -1 || pMonth === -1) return null;
  const wDay = parseInt(workMatch[2]!, 10);
  const pDay = parseInt(payoutMatch[2]!, 10);
  // Approximate — assume same year, 30 days per month
  const diff = (pMonth - wMonth) * 30 + (pDay - wDay);
  if (diff <= 0) return null;
  if (diff <= 7) return `paid ${diff}d after work`;
  if (diff <= 21) return `paid ${diff}d later`;
  return `paid ${Math.round(diff / 7)}w later`;
}


export function parseMayDay(s: string | null | undefined, endOfRange = false): number | null {
  if (!s) return null;
  const matches = s.match(/May\s*(\d{1,2})(?:\s*[–-]\s*(\d{1,2}))?/);
  if (!matches) return null;
  const start = parseInt(matches[1]!, 10);
  const end = matches[2] ? parseInt(matches[2], 10) : start;
  return endOfRange ? end : start;
}


export function FilterChipStrip({
  filter,
  onChange,
  counts,
}: {
  filter: "booked" | "pending" | "inquiry" | "past" | "cancelled" | "all";
  onChange: (f: "booked" | "pending" | "inquiry" | "past" | "cancelled" | "all") => void;
  counts: { booked: number; pending: number; inquiry: number; past: number; cancelled: number; all: number };
}) {
  const chips: { key: typeof filter; label: string; count: number; tone: string }[] = [
    { key: "booked", label: "Booked", count: counts.booked, tone: COLORS.green },
    { key: "pending", label: "Pending", count: counts.pending, tone: COLORS.coral },
    { key: "inquiry", label: "Inquiry", count: counts.inquiry, tone: COLORS.indigo },
    { key: "cancelled", label: "Cancelled", count: counts.cancelled, tone: COLORS.critical },
    { key: "past", label: "Past", count: counts.past, tone: COLORS.inkDim },
    { key: "all", label: "All", count: counts.all, tone: COLORS.ink },
  ];
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        marginTop: 4,
        flexWrap: "wrap",
      }}
    >
      {chips.map((c) => {
        const active = filter === c.key;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onChange(c.key)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 11px",
              borderRadius: 999,
              background: active ? COLORS.fill : "#fff",
              border: `1px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
              cursor: "pointer",
              fontFamily: FONTS.body,
              fontSize: 12.5,
              fontWeight: 500,
              color: active ? "#fff" : COLORS.ink,
              transition: `background ${TRANSITION.micro}, border-color ${TRANSITION.micro}`,
            }}
          >
            {!active && (
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: c.tone,
                }}
              />
            )}
            <span>{c.label}</span>
            <span
              style={{
                fontVariantNumeric: "tabular-nums",
                color: active ? "rgba(255,255,255,0.6)" : COLORS.inkDim,
                fontSize: 11.5,
              }}
            >
              {c.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}


export function ConflictBanner({
  conflicts,
  onResolve,
}: {
  conflicts: { a: CalendarEvent; b: CalendarEvent }[];
  onResolve: (action: "decline" | "talk" | "reschedule", target: CalendarEvent) => void;
}) {
  const { openDrawer } = useAdminShell();
  // Severity escalates with conflict count: 1–2 is warning, 3+ is critical.
  const severe = conflicts.length >= 3;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "12px 16px",
        marginBottom: 16,
        background: severe ? COLORS.criticalSoft : COLORS.coralSoft,
        border: `1px solid ${severe ? "rgba(176,48,58,0.25)" : "rgba(194,106,69,0.25)"}`,
        borderLeft: `3px solid ${severe ? COLORS.critical : COLORS.coral}`,
        borderRadius: 10,
        fontFamily: FONTS.body,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          fontWeight: 600,
          color: severe ? COLORS.criticalDeep : COLORS.coralDeep,
        }}
      >
        <Icon name="bolt" size={13} stroke={1.7} />
        {conflicts.length === 1
          ? "1 date conflict needs your attention"
          : `${conflicts.length} date conflicts need your attention`}
      </div>
      {conflicts.map((c, i) => {
        // The "pending" or "inquiry" side is the resolvable one — you can
        // decline a hold or talk to a coordinator. A confirmed booking is
        // already committed; resolution lives on the other side.
        const resolvable = c.a.kind === "pending" || c.a.kind === "inquiry" ? c.a : c.b;
        return (
          <div
            key={`${c.a.id}-${c.b.id}-${i}`}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: "8px 0 6px 22px",
              borderTop: i === 0 ? "none" : `1px solid ${severe ? "rgba(176,48,58,0.18)" : "rgba(194,106,69,0.18)"}`,
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: severe ? COLORS.criticalDeep : COLORS.coralDeep,
                opacity: 0.95,
                lineHeight: 1.5,
              }}
            >
              <strong style={{ fontWeight: 600 }}>
                {c.a.client} {c.a.dateLabel}
              </strong>
              {" "}({kindToLabel(c.a.kind)}) overlaps with{" "}
              <strong style={{ fontWeight: 600 }}>
                {c.b.client} {c.b.dateLabel}
              </strong>
              {" "}({kindToLabel(c.b.kind)}).
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <ConflictActionChip
                label="✨ Smart resolve"
                onClick={() => openDrawer("talent-conflict-resolve")}
                severe={severe}
              />
              <ConflictActionChip
                label={`Decline ${resolvable.client}`}
                onClick={() => onResolve("decline", resolvable)}
                severe={severe}
              />
              <ConflictActionChip
                label="Talk to coordinator"
                onClick={() => onResolve("talk", resolvable)}
                severe={severe}
              />
              <ConflictActionChip
                label="Ask to reschedule"
                onClick={() => onResolve("reschedule", resolvable)}
                severe={severe}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}


function ConflictActionChip({
  label,
  onClick,
  severe,
}: {
  label: string;
  onClick: () => void;
  severe: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "#fff",
        border: `1px solid ${severe ? "rgba(176,48,58,0.30)" : "rgba(194,106,69,0.30)"}`,
        borderRadius: 7,
        padding: "4px 10px",
        cursor: "pointer",
        fontFamily: FONTS.body,
        fontSize: 11.5,
        fontWeight: 500,
        color: severe ? COLORS.criticalDeep : COLORS.coralDeep,
      }}
    >
      {label}
    </button>
  );
}


function kindToLabel(kind: CalendarEventKind): string {
  return {
    booked: "confirmed booking",
    pending: "pending hold",
    inquiry: "open inquiry",
    past: "past",
    cancelled: "cancelled",
  }[kind];
}


/** Uniform row format across all event kinds. Coral edge when conflicted. */
export function CalendarEventRow({
  event,
  conflicted,
  onOpen,
  first,
}: {
  event: CalendarEvent;
  conflicted: boolean;
  onOpen: () => void;
  first: boolean;
}) {
  const kindToTone: Record<CalendarEventKind, "success" | "coral" | "indigo" | "amber"> = {
    booked: "success",
    pending: "coral",
    inquiry: "indigo",
    past: "amber",
    cancelled: "amber", // slate — drained, not urgent
  };
  const kindLabel = {
    booked: "Booked",
    pending: "Pending",
    inquiry: "Inquiry",
    past: event.status.startsWith("Paid") ? "Paid" : "Wrapped",
    cancelled: "Cancelled",
  }[event.kind];
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "14px 18px",
        paddingLeft: conflicted ? 22 : 18,
        borderTop: first ? "none" : `1px solid ${COLORS.borderSoft}`,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: FONTS.body,
        transition: `background ${TRANSITION.micro}`,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.02)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {/* Conflict edge marker */}
      {conflicted && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 12,
            bottom: 12,
            left: 0,
            width: 3,
            background: COLORS.coral,
            borderRadius: "0 3px 3px 0",
          }}
        />
      )}

      {/* Shared date block — same primitive used on Today's Earning rows
          and Calendar peek section. One row pattern across surfaces. */}
      <DateBlock day={event.startDay ?? "—"} month="May" />

      {/* Title + status */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13.5,
            fontWeight: 500,
            color: COLORS.ink,
          }}
        >
          <span>{event.client}</span>
          <span style={{ color: COLORS.inkMuted, fontWeight: 400 }}>· {event.brief}</span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 2,
            fontSize: 11.5,
          }}
        >
          <KindChip label={kindLabel} tone={kindToTone[event.kind]} />
          {conflicted && <KindChip label="Conflict" tone="coral" />}
          <span style={{ color: COLORS.inkMuted }}>{event.status}</span>
        </div>
      </div>

      {event.amount && (
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: COLORS.ink,
            fontVariantNumeric: "tabular-nums",
            flexShrink: 0,
          }}
        >
          {event.amount}
        </span>
      )}
      <Icon name="chevron-right" size={13} color={COLORS.inkDim} />
    </button>
  );
}


// ─── Reach helpers ───────────────────────────────────────────────────

/**
 * Reusable confirm modal. Used when an action has a real trade-off the
 * user should see before committing (e.g., Maximum exposure).
 */
export function ModalConfirm({
  title,
  body,
  confirmLabel,
  confirmTone = "ink",
  onConfirm,
  onCancel,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  confirmTone?: "ink" | "critical";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div
        onClick={onCancel}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(11,11,13,0.40)",
          zIndex: 200,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 440,
          maxWidth: "calc(100vw - 32px)",
          background: "#fff",
          borderRadius: 14,
          boxShadow: "0 20px 50px rgba(11,11,13,0.18)",
          padding: "22px 24px",
          fontFamily: FONTS.body,
          zIndex: 201,
        }}
      >
        <h2
          style={{
            fontFamily: FONTS.display,
            fontSize: 20,
            fontWeight: 500,
            letterSpacing: -0.3,
            color: COLORS.ink,
            margin: "0 0 10px",
          }}
        >
          {title}
        </h2>
        <div
          style={{
            fontSize: 13,
            color: COLORS.ink,
            lineHeight: 1.55,
            marginBottom: 18,
          }}
        >
          {body}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              background: confirmTone === "critical" ? COLORS.critical : COLORS.fill,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "9px 14px",
              fontFamily: FONTS.body,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}


export function ReachStat({
  label,
  value,
  caption,
  captionTone = "default",
  tone = "ink",
}: {
  label: string;
  value: string;
  caption?: string;
  captionTone?: "default" | "success" | "coral" | "indigo";
  tone?: "ink" | "indigo" | "success";
}) {
  const fg = tone === "indigo" ? COLORS.indigo : tone === "success" ? COLORS.green : COLORS.ink;
  const captionColor =
    captionTone === "success"
      ? COLORS.green
      : captionTone === "coral"
        ? COLORS.coral
        : captionTone === "indigo"
          ? COLORS.indigo
          : COLORS.inkDim;
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontFamily: FONTS.body,
          fontSize: 10.5,
          fontWeight: 600,
                    color: COLORS.inkMuted,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span
          style={{
            fontFamily: FONTS.display,
            fontSize: 18,
            fontWeight: 500,
            color: fg,
            letterSpacing: -0.2,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </span>
        {caption && (
          <span
            style={{
              fontFamily: FONTS.body,
              fontSize: 11.5,
              color: captionColor,
              fontWeight: captionTone !== "default" ? 500 : 400,
            }}
          >
            {caption}
          </span>
        )}
      </div>
    </div>
  );
}


export function ReachStatDivider() {
  return (
    <span
      aria-hidden
      data-tulala-stat-divider
      style={{
        width: 1,
        height: 28,
        background: COLORS.borderSoft,
        margin: "0 14px",
        flexShrink: 0,
      }}
    />
  );
}
