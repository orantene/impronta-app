"use client";

import { useT } from "@/i18n/use-t";

import type { IntegrationStatusVisual } from "./integration-status";

/** Compact status pill — coloured dot + label. Used on card + drawer header. */
export function IntegrationStatusPill({ visual }: { visual: IntegrationStatusVisual }) {
  const t = useT();
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 9px",
        borderRadius: 999,
        background: visual.bg,
        color: visual.fg,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1.2,
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: visual.dot,
          flexShrink: 0,
        }}
      />
      {t(visual.labelKey)}
    </span>
  );
}
