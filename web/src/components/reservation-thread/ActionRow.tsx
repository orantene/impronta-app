/**
 * ActionRow — composer-area action pills (Accept / Hold / Decline for talent;
 * Approve / Decline / Counter for client). Lives directly above the composer.
 *
 * The single most-impactful UX move in the consolidation: action you owe
 * is in the thing you're typing, never as a banner above. Disappears
 * after answered.
 */

"use client";
import { useState, type CSSProperties } from "react";
import type { ActionPill as ActionPillData, ReservationPov } from "./types";
import { Pill } from "./Pill";
import { DENSITY, MOBILE_BP_PX, PALETTES, TYPE } from "./tokens";

interface ActionRowProps {
  pov: ReservationPov;
  actions: ActionPillData[];
}

export function ActionRow({ pov, actions }: ActionRowProps) {
  const palette = PALETTES[pov];
  const [pendingId, setPendingId] = useState<string | null>(null);
  if (!actions.length) return null;

  // Preamble = the first action's preamble (we expect all actions in a set
  // to share the same preamble; if not, the first one wins).
  const preamble = actions.find((a) => a.preamble)?.preamble;

  const handleClick = async (a: ActionPillData) => {
    if (a.disabled || pendingId) return;
    setPendingId(a.id);
    try {
      await a.onClick();
    } finally {
      // Leave pending visible briefly so the user sees acknowledgement
      // even on a fast response. Parent typically removes the action row
      // immediately by updating actions to [] once server confirms.
      setTimeout(() => setPendingId((prev) => (prev === a.id ? null : prev)), 200);
    }
  };

  const wrapStyle: CSSProperties = {
    padding: "8px 14px",
    borderTop: `1px solid ${palette.borderSoft}`,
    background: palette.surface,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    flexShrink: 0,
  };

  return (
    <div data-reservation-action-row style={wrapStyle}>
      {preamble && (
        <div
          style={{
            fontSize: 11.5,
            color: palette.inkMuted,
            fontFamily: TYPE.bodyFamily,
            letterSpacing: 0.1,
          }}
        >
          {preamble}
        </div>
      )}
      <div
        data-reservation-action-row-pills
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        {actions.map((a) => (
          <Pill
            key={a.id}
            pov={pov}
            variant="action"
            label={a.label}
            emphasis={a.emphasis ?? "secondary"}
            disabled={a.disabled}
            pending={pendingId === a.id}
            onClick={() => void handleClick(a)}
            dataTestid={`action-${a.id}`}
          />
        ))}
      </div>
      <style jsx>{`
        @media (max-width: ${MOBILE_BP_PX}px) {
          [data-reservation-action-row] {
            padding-left: 12px;
            padding-right: 12px;
          }
          [data-reservation-action-row-pills] {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
            gap: 8px;
          }
        }
      `}</style>
    </div>
  );
}
