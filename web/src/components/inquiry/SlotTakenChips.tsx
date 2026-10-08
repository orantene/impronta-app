"use client";

import type { CSSProperties } from "react";

import { endForStart } from "@/lib/inquiry/reserve-slot-taken";

type Slot = { startsAt: string; endsAt: string; timezone: string };

/** Next free times offered after the chosen one was taken (Reserve a time drawer). */
export function SlotTakenChips({
  times,
  timezone,
  durationMinutes,
  borderColor,
  background,
  buttonStyle,
  onPick,
}: {
  times: readonly string[];
  timezone: string;
  durationMinutes: number;
  borderColor: string;
  background: string;
  buttonStyle: CSSProperties;
  onPick: (slot: Slot) => void;
}) {
  if (times.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "10px 22px", borderTop: `1px solid ${borderColor}`, background }}>
      {times.map((iso) => (
        <button
          key={iso}
          type="button"
          onClick={() => onPick({ startsAt: iso, endsAt: endForStart(iso, durationMinutes), timezone })}
          style={buttonStyle}
        >
          {formatSlotChip(iso, timezone)}
        </button>
      ))}
    </div>
  );
}

function formatSlotChip(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
