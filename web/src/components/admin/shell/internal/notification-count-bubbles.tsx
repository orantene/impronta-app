/**
 * TUL-385 design-first: floating count bubbles for the top-bar icons.
 *
 * Presentational only in slice 1 — no data wiring. Spec:
 *   - Messages: orange circle, unread count
 *   - Money: green circle
 *   - Approvals / attention: amber/ink circle
 * Max 3 bubbles; hide when count is 0; 99+ cap. No gold/rust accents.
 */

import type { CSSProperties, ReactNode } from "react";

import { COLORS, FONTS } from "./state";

export type NotificationBubbleKind = "messages" | "money" | "attention";

export type NotificationBubbleCount = {
  kind: NotificationBubbleKind;
  count: number;
};

/** Brand fills — coral / forest / slate (no gold or rust; see COLORS memo). */
const BUBBLE_FILL: Record<NotificationBubbleKind, string> = {
  messages: COLORS.coral,
  money: COLORS.green,
  attention: COLORS.amber,
};

export function formatBubbleCount(count: number): string {
  if (count <= 0) return "";
  if (count > 99) return "99+";
  return String(count);
}

/** Which of the three bubbles should render (count > 0), order stable. */
export function visibleNotificationBubbles(
  counts: ReadonlyArray<NotificationBubbleCount>,
): NotificationBubbleCount[] {
  const order: NotificationBubbleKind[] = ["messages", "money", "attention"];
  const byKind = new Map(counts.map((c) => [c.kind, c.count] as const));
  const out: NotificationBubbleCount[] = [];
  for (const kind of order) {
    const count = byKind.get(kind) ?? 0;
    if (count > 0) out.push({ kind, count });
  }
  return out.slice(0, 3);
}

export function NotificationCountBubble({
  kind,
  count,
  size = 18,
}: {
  kind: NotificationBubbleKind;
  count: number;
  size?: number;
}): ReactNode {
  const label = formatBubbleCount(count);
  if (!label) return null;
  const style: CSSProperties = {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: size,
    height: size,
    padding: "0 4px",
    boxSizing: "border-box",
    borderRadius: 999,
    border: "2px solid #fff",
    background: BUBBLE_FILL[kind],
    color: "#fff",
    fontSize: size <= 16 ? 9 : 10,
    fontWeight: 700,
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: FONTS.body,
    boxShadow: "0 1px 2px rgba(11,11,13,0.18)",
    pointerEvents: "none",
  };
  return (
    <span
      data-notif-bubble={kind}
      aria-hidden="true"
      style={style}
    >
      {label}
    </span>
  );
}

/**
 * Anchor wrapper: relative container so a bubble sits on the top-right of
 * an icon button. Used by the design review before engine wiring.
 */
export function NotificationBubbleAnchor({
  children,
  bubble,
}: {
  children: ReactNode;
  bubble?: NotificationBubbleCount | null;
}): ReactNode {
  return (
    <span className="relative inline-flex">
      {children}
      {bubble && bubble.count > 0 ? (
        <NotificationCountBubble kind={bubble.kind} count={bubble.count} />
      ) : null}
    </span>
  );
}

/** Design tokens exported for PM review / Theme Studio notes. */
export const NOTIFICATION_BUBBLE_DESIGN = {
  fills: BUBBLE_FILL,
  maxBubbles: 3,
  cap: 99,
  inkMuted: COLORS.inkMuted,
} as const;
