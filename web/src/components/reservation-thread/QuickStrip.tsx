/**
 * QuickStrip — horizontal pill row directly under the thread header.
 *
 * Per audit §4.1: pills carry status, taps open sheets. On mobile the
 * row scrolls horizontally with snap-to. On desktop the row fits in one
 * line on a normal viewport (5 pills max).
 */

"use client";
import type { PillDescriptor, PillKind, ReservationPov } from "./types";
import { Pill } from "./Pill";
import { DENSITY, MOBILE_BP_PX, PALETTES } from "./tokens";

interface QuickStripProps {
  pov: ReservationPov;
  pills: PillDescriptor[];
  openKind: PillKind | null;
  onOpen: (kind: PillKind) => void;
}

export function QuickStrip({ pov, pills, openKind, onOpen }: QuickStripProps) {
  const palette = PALETTES[pov];
  if (!pills.length) return null;

  return (
    <div
      data-reservation-quickstrip
      role="tablist"
      aria-label="Reservation details"
      style={{
        display: "flex",
        alignItems: "center",
        gap: DENSITY.pillGap,
        padding: "8px 14px",
        height: DENSITY.quickStripHeight + 16,
        background: palette.surface,
        borderBottom: `1px solid ${palette.borderSoft}`,
        overflowX: "auto",
        scrollSnapType: "x proximity",
        scrollbarWidth: "none",          // Firefox
        msOverflowStyle: "none",         // IE/Edge legacy
        flexShrink: 0,
      }}
    >
      {pills.map((p) => (
        <span
          key={p.kind}
          style={{ scrollSnapAlign: "start", flexShrink: 0 }}
        >
          <Pill
            pov={pov}
            variant="strip"
            label={p.label}
            status={p.status}
            tone={p.tone}
            badge={p.badge}
            active={openKind === p.kind}
            disabled={p.enabled === false}
            onClick={() => onOpen(p.kind)}
            dataTestid={`pill-${p.kind}`}
          />
        </span>
      ))}
      {/* Hide WebKit scrollbar — we keep horizontal scroll but invisibly. */}
      <style jsx>{`
        [data-reservation-quickstrip]::-webkit-scrollbar { display: none; }
        @media (max-width: ${MOBILE_BP_PX}px) {
          [data-reservation-quickstrip] {
            padding-left: 12px;
            padding-right: 12px;
          }
        }
      `}</style>
    </div>
  );
}
