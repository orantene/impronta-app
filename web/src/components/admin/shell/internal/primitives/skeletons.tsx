"use client";

// ─── WS-6.10 Skeleton states per surface — 8 most-used pages/drawers ─
//
// Extracted from primitives.tsx — Phase 1f decomposition.

import { COLORS, RADIUS } from "../state";
import { Skeleton } from "./interactions";

// ─────────────────────────────────────────────────────────────────────────────
// WS-6.10  Skeleton states per surface — 8 most-used pages / drawers
// ─────────────────────────────────────────────────────────────────────────────

function SkRow({ label = true, action = false }: { label?: boolean; action?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${COLORS.border}` }}>
      <Skeleton width={36} height={36} radius={18} />
      <div className="flex-1">
        {label && <Skeleton height={13} width="55%" style={{ marginBottom: 5 }} />}
        <Skeleton height={11} width="35%" />
      </div>
      {action && <Skeleton height={28} width={72} radius={6} />}
    </div>
  );
}

/** Skeleton for the inbox/messages list */
export function InboxSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div data-tulala-skeleton="inbox" style={{ padding: "0 16px" }}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkRow key={i} label action={i === 0} />
      ))}
    </div>
  );
}

/** Skeleton for the inquiries list */
export function InquiriesSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div data-tulala-skeleton="inquiries" style={{ padding: "0 16px" }}>
      <Skeleton height={32} width={220} radius={999} style={{ marginBottom: 12, marginTop: 4 }} />
      {Array.from({ length: rows }).map((_, i) => (
        <SkRow key={i} action />
      ))}
    </div>
  );
}

/** Skeleton for the talent roster */
export function TalentRosterSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div data-tulala-skeleton="talent-roster" style={{ padding: "0 16px" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, marginTop: 4 }}>
        <Skeleton height={32} width={120} radius={999} />
        <Skeleton height={32} width={80}  radius={999} />
        <Skeleton height={32} width={96}  radius={999} />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <SkRow key={i} action />
      ))}
    </div>
  );
}

/** Loading skeleton for the talent profile editor drawer — mirrors the
 *  real layout (section header + a grid of click-to-open field cards on
 *  the faint cool ground) so loading previews the actual content instead
 *  of a generic message-thread shape. Sole consumer is the talent
 *  editor's hydration overlay. */
export function DrawerDetailSkeleton() {
  const cards: { full: boolean }[] = [
    { full: true }, { full: false }, { full: false },
    { full: false }, { full: false }, { full: true },
    { full: false }, { full: false },
  ];
  return (
    <div data-tulala-skeleton="talent-editor" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Section header — bold title + muted sub (matches the real
          ProfileAccordionSection header). */}
      <div style={{ display: "flex", flexDirection: "column", gap: 7, padding: "2px 2px 0" }}>
        <Skeleton height={15} width={150} radius={5} />
        <Skeleton height={11} width={230} radius={5} />
      </div>
      {/* Field-card grid on the faint cool ground — same border / radius /
          lift / 2-up auto layout as the live cards, so the skeleton is a
          true preview, not a placeholder of a different thing. */}
      <div style={{
        background: "rgba(11,11,13,0.028)", borderRadius: 14, padding: 14,
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 12px",
      }}>
        {cards.map((c, i) => (
          <div key={i} style={{
            gridColumn: c.full ? "1 / -1" : "auto",
            background: "#fff",
            border: "1px solid rgba(24,24,27,0.10)",
            borderRadius: 9,
            boxShadow: "0 1px 2px rgba(11,11,13,0.05)",
            padding: "12px 14px",
            display: "flex", flexDirection: "column", gap: 8,
          }}>
            <Skeleton height={12} width={i % 2 === 0 ? 120 : 90} radius={4} />
            <Skeleton height={10} width={i % 3 === 0 ? "68%" : "44%"} radius={4} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Skeleton for the calendar page */
export function CalendarSkeleton() {
  return (
    <div data-tulala-skeleton="calendar" style={{ padding: "16px" }}>
      {/* Month header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Skeleton height={20} width={120} />
        <div className="flex gap-2">
          <Skeleton height={32} width={32} radius={8} />
          <Skeleton height={32} width={32} radius={8} />
        </div>
      </div>
      {/* Day-of-week labels */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 8 }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} height={10} width="80%" style={{ margin: "0 auto" }} />
        ))}
      </div>
      {/* Calendar grid */}
      {Array.from({ length: 5 }).map((_, row) => (
        <div key={row} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
          {Array.from({ length: 7 }).map((_, col) => (
            <Skeleton key={col} height={52} width="100%" radius={6} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Skeleton for an overview / dashboard page */
export function OverviewSkeleton() {
  return (
    <div data-tulala-skeleton="overview" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Stat tiles row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ background: COLORS.surfaceAlt, borderRadius: RADIUS.lg, padding: "16px", border: `1px solid ${COLORS.border}` }}>
            <Skeleton height={10} width="60%" style={{ marginBottom: 10 }} />
            <Skeleton height={28} width="45%" style={{ marginBottom: 6 }} />
            <Skeleton height={9}  width="40%" />
          </div>
        ))}
      </div>
      {/* Recent activity */}
      <div style={{ padding: "16px", border: `1px solid ${COLORS.border}` }} className="bg-admin-surface-alt rounded-admin-lg">
        <Skeleton height={14} width={120} style={{ marginBottom: 14 }} />
        {[0, 1, 2, 3, 4].map((i) => (
          <SkRow key={i} />
        ))}
      </div>
    </div>
  );
}

/** Skeleton for the talent Today page */
export function TalentTodaySkeleton() {
  return (
    <div data-tulala-skeleton="talent-today" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Greeting */}
      <div>
        <Skeleton height={22} width="40%" style={{ marginBottom: 8 }} />
        <Skeleton height={13} width="60%" />
      </div>
      {/* Checklist card */}
      <div style={{ padding: 16, border: `1px solid ${COLORS.border}` }} className="bg-admin-surface-alt rounded-admin-lg">
        <Skeleton height={14} width={140} style={{ marginBottom: 12 }} />
        {[80, 90, 75].map((w, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
            <Skeleton width={16} height={16} radius={4} />
            <Skeleton height={12} width={`${w}%`} />
          </div>
        ))}
      </div>
      {/* Week strip */}
      <div className="flex gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} width={36} height={56} radius={8} style={{ flex: 1 }} />
        ))}
      </div>
      {/* Earnings grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ padding: 16, border: `1px solid ${COLORS.border}` }} className="bg-admin-surface-alt rounded-admin-lg">
          <Skeleton height={10} width="50%" style={{ marginBottom: 10 }} />
          <Skeleton height={28} width="55%" style={{ marginBottom: 8 }} />
          <Skeleton height={36} width="100%" radius={4} />
        </div>
        <div style={{ padding: 16, border: `1px solid ${COLORS.border}` }} className="bg-admin-surface-alt rounded-admin-lg">
          <Skeleton height={10} width="50%" style={{ marginBottom: 10 }} />
          {[90, 70, 80].map((w, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <Skeleton height={11} width={`${w * 0.7}%`} />
              <Skeleton height={11} width="20%" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Skeleton for the client discover/search page */
export function DiscoverSkeleton({ cards = 9 }: { cards?: number }) {
  return (
    <div data-tulala-skeleton="discover" style={{ padding: "16px" }}>
      {/* Search bar */}
      <Skeleton height={40} width="100%" radius={999} style={{ marginBottom: 16 }} />
      {/* Filter chips */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, overflowX: "auto" }}>
        {[60, 80, 70, 90, 65].map((w, i) => (
          <Skeleton key={i} height={28} width={w} radius={999} />
        ))}
      </div>
      {/* Card grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} style={{ borderRadius: RADIUS.lg, overflow: "hidden", border: `1px solid ${COLORS.border}` }}>
            <Skeleton height={180} width="100%" radius={0} />
            <div className="p-3">
              <Skeleton height={14} width="65%" style={{ marginBottom: 6 }} />
              <Skeleton height={11} width="45%" style={{ marginBottom: 8 }} />
              <Skeleton height={24} width={80} radius={999} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WS-10.2  Inline file preview — PDF / image / video / audio in message threads
// ─────────────────────────────────────────────────────────────────────────────

