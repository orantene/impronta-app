/**
 * <ReservationThread> — the single primitive every POV renders through.
 *
 * Layout (per audit §4.1):
 *
 *   ┌─────────────────────────────────────────┐
 *   │ Header (≈ 40px)                          │
 *   ├─────────────────────────────────────────┤
 *   │ QuickStrip pills (32–48px)               │  ← optional
 *   ├─────────────────────────────────────────┤
 *   │ Stream (flex 1, scrolls)                 │  ← parent-supplied
 *   ├─────────────────────────────────────────┤
 *   │ ActionRow pills (44px)                   │  ← optional, only when answer is owed
 *   ├─────────────────────────────────────────┤
 *   │ Composer (≥ 56px)                        │  ← parent-supplied
 *   └─────────────────────────────────────────┘
 *
 * Sheets are absolute-positioned overlays managed by <SheetHost>; they
 * don't take vertical space from this layout.
 */

"use client";
import { useEffect, useState } from "react";
import { Header } from "./Header";
import { QuickStrip } from "./QuickStrip";
import { SheetHost } from "./SheetHost";
import { ActionRow } from "./ActionRow";
import type {
  PillKind,
  ReservationThreadProps,
} from "./types";
import { PALETTES, TYPE } from "./tokens";

export function ReservationThread(props: ReservationThreadProps) {
  const {
    pov,
    header,
    pills,
    sheets,
    stream,
    composer,
    actionRow,
    initialOpenPill = null,
  } = props;

  const [openKind, setOpenKind] = useState<PillKind | null>(initialOpenPill);
  // Sync with parent-driven `initialOpenPill` (deep-link / notification).
  useEffect(() => { setOpenKind(initialOpenPill ?? null); }, [initialOpenPill]);

  const palette = PALETTES[pov];

  return (
    <div
      data-reservation-thread
      data-reservation-pov={pov}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        background: palette.surface,
        color: palette.ink,
        fontFamily: TYPE.bodyFamily,
      }}
    >
      <Header pov={pov} data={header} />

      {pills && pills.length > 0 && (
        <QuickStrip
          pov={pov}
          pills={pills}
          openKind={openKind}
          onOpen={(k) => setOpenKind((cur) => (cur === k ? null : k))}
        />
      )}

      <div
        data-reservation-stream
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          background: palette.surface,
        }}
      >
        {stream}
      </div>

      {actionRow && actionRow.length > 0 && (
        <ActionRow pov={pov} actions={actionRow} />
      )}

      <div
        data-reservation-composer
        style={{
          flexShrink: 0,
          background: palette.surfaceRaised,
          borderTop: `1px solid ${palette.borderSoft}`,
        }}
      >
        {composer}
      </div>

      <SheetHost
        pov={pov}
        sheets={sheets}
        openKind={openKind}
        onOpenChange={setOpenKind}
      />
    </div>
  );
}
