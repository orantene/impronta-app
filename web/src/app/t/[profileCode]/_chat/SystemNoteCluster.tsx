"use client";

/**
 * SystemNoteCluster — W1-1 render of a folded run of system notes as ONE quiet
 * caption instead of a stack of bubbles. Collapsed by default for bursts (≥3):
 * shows the newest note + "· N more", tap to expand the full run in place. A
 * short run (≤2) renders expanded with no expander. Never a bubble — system
 * notes are whispers, not messages.
 */

import { useState } from "react";
import { ChevronRight } from "lucide-react";

import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";

import type { StreamRow } from "./MiniChatMessageBubble";
import { clusterDefaultCollapsed, clusterCaption } from "./cluster-system-rows";
import { FONT, type Palette } from "./mini-chat-styles";

export function SystemNoteCluster({
  rows,
  C,
  t,
}: {
  rows: StreamRow[];
  C: Palette;
  t: Translator;
}) {
  const [collapsed, setCollapsed] = useState(() => clusterDefaultCollapsed(rows.length));
  if (rows.length === 0) return null;

  const bodyOf = (r: StreamRow) => (r.isDeleted ? t("public.guestChat.messageRemoved") : r.body);
  const captionStyle = {
    alignSelf: "center",
    textAlign: "center" as const,
    maxWidth: "92%",
    fontSize: 10.5,
    color: C.inkDim,
    fontFamily: FONT,
    lineHeight: 1.4,
    padding: "1px 4px",
  };

  // Short run (≤2): render each note as its own quiet caption line, no expander.
  if (rows.length <= 2 || !collapsed) {
    return (
      <div style={{ alignSelf: "center", display: "flex", flexDirection: "column", gap: 2, maxWidth: "92%", width: "100%" }}>
        {rows.map((r) => (
          <div key={r.id} style={captionStyle}>
            {bodyOf(r)}
          </div>
        ))}
        {rows.length > 2 ? (
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            style={{ ...captionStyle, background: "transparent", border: "none", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}
          >
            {t("public.guestChat.systemClusterCollapse")}
          </button>
        ) : null}
      </div>
    );
  }

  // Collapsed burst: one caption with the newest note + "· N more", tap expands.
  const { latest, hiddenCount } = clusterCaption(rows);
  return (
    <button
      type="button"
      onClick={() => setCollapsed(false)}
      aria-expanded={false}
      style={{
        ...captionStyle,
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        background: "transparent",
        border: "none",
        cursor: "pointer",
      }}
    >
      <span>
        {latest}
        {hiddenCount > 0 ? (
          <span style={{ opacity: 0.85 }}>
            {" · "}
            {interpolate(t("public.guestChat.systemClusterMore"), { count: hiddenCount })}
          </span>
        ) : null}
      </span>
      <ChevronRight size={11} strokeWidth={2.2} aria-hidden style={{ flexShrink: 0, opacity: 0.7 }} />
    </button>
  );
}
