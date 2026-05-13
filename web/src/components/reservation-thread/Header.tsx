/**
 * Thread header — 40-px row with title, subtitle, stage strip and an
 * optional ⋯ move-to menu. Admin gets the menu; client/talent do not.
 */

"use client";
import { useEffect, useRef, useState } from "react";
import type { ReservationPov, ReservationThreadHeader, ReservationStage } from "./types";
import { DENSITY, MOBILE_BP_PX, PALETTES, RADII, TYPE } from "./tokens";

const STAGE_ORDER: ReservationStage[] = ["inquiry", "review", "offer", "booked", "wrapped"];

const STAGE_LABELS: Record<ReservationStage, string> = {
  inquiry: "Inquiry",
  review:  "Review",
  offer:   "Offer",
  booked:  "Booked",
  wrapped: "Wrapped",
};

interface HeaderProps {
  pov: ReservationPov;
  data: ReservationThreadHeader;
  onBack?: () => void;
}

export function Header({ pov, data, onBack }: HeaderProps) {
  const palette = PALETTES[pov];
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const stageIdx = STAGE_ORDER.indexOf(data.stage);

  // Click-outside menu close
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  return (
    <div
      data-reservation-header
      style={{
        display: "flex",
        flexDirection: "column",
        background: palette.surfaceRaised,
        borderBottom: `1px solid ${palette.borderSoft}`,
        flexShrink: 0,
        fontFamily: TYPE.bodyFamily,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          minHeight: DENSITY.headerHeight,
        }}
      >
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            style={{
              border: "none",
              background: "transparent",
              padding: 6,
              cursor: "pointer",
              color: palette.inkMuted,
              borderRadius: 6,
              flexShrink: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3l-5 5 5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
          <div
            style={{
              fontSize: 14.5,
              fontWeight: 700,
              color: palette.ink,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {data.title}
          </div>
          {data.subtitle && (
            <div
              style={{
                fontSize: 11.5,
                color: palette.inkMuted,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {data.subtitle}
            </div>
          )}
        </div>
        {/* Stage badge — compact pill (visible on all viewports) */}
        <span
          aria-label={`Stage: ${STAGE_LABELS[data.stage]}`}
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            padding: "3px 8px",
            borderRadius: RADII.pill,
            background: palette.accentSoft,
            color: palette.accentDeep,
            flexShrink: 0,
          }}
        >
          {STAGE_LABELS[data.stage]}
        </span>

        {/* ⋯ menu (admin only — gated by moveToMenu presence) */}
        {data.moveToMenu && data.moveToMenu.length > 0 && (
          <div ref={menuRef} style={{ position: "relative", flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              style={{
                border: `1px solid ${palette.border}`,
                background: palette.surfaceRaised,
                padding: "5px 8px",
                borderRadius: 8,
                color: palette.ink,
                cursor: "pointer",
                fontFamily: TYPE.bodyFamily,
                fontSize: 12,
                fontWeight: 600,
                lineHeight: 1.2,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span>Move to</span>
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
                <path d="M2 3l2.5 2.5L7 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {menuOpen && (
              <div
                role="menu"
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  right: 0,
                  background: palette.surfaceRaised,
                  border: `1px solid ${palette.border}`,
                  borderRadius: 10,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
                  minWidth: 180,
                  zIndex: 50,
                  padding: 4,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {data.moveToMenu.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); item.onClick(); }}
                    style={{
                      border: "none",
                      background: "transparent",
                      textAlign: "left",
                      padding: "8px 10px",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontFamily: TYPE.bodyFamily,
                      fontSize: 12.5,
                      fontWeight: 500,
                      color: item.danger ? palette.alert : palette.ink,
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {/* Stage strip — 5 cells, lit up to current stage. Hidden when
          closedReason is set (we show the closure banner instead). */}
      {!data.closedReason ? (
        <div
          aria-label="Stage progress"
          style={{
            display: "flex",
            gap: 4,
            padding: "0 14px 8px 14px",
          }}
        >
          {STAGE_ORDER.map((s, i) => {
            const filled = i <= stageIdx && stageIdx >= 0;
            return (
              <span
                key={s}
                aria-label={STAGE_LABELS[s]}
                style={{
                  flex: 1,
                  height: 3,
                  borderRadius: 2,
                  background: filled ? palette.accent : palette.borderSoft,
                  transition: "background 200ms",
                }}
              />
            );
          })}
        </div>
      ) : (
        <div
          role="alert"
          style={{
            margin: "0 14px 8px 14px",
            padding: "6px 10px",
            background: palette.alertSoft,
            color: palette.alert,
            borderRadius: 8,
            fontSize: 11.5,
            fontWeight: 500,
          }}
        >
          {data.closedReason}
        </div>
      )}
      <style jsx>{`
        @media (max-width: ${MOBILE_BP_PX}px) {
          [data-reservation-header] > div:first-child { padding-left: 10px; padding-right: 10px; }
        }
      `}</style>
    </div>
  );
}
