"use client";

/**
 * TUL-388 (Notifications 2/6) — ShellCountBubbles.
 *
 * Up to three floating count bubbles (Messages / Money / Attention) for the
 * top bar. Hide at zero; 99+ cap; stable order. Built on `CountBadge` with
 * class fills (coral / forest / slate) — no gold or rust, no inline styles.
 *
 * Click opens the notifications center filtered by category (drawer payload
 * for TUL-390 tabs). Counts come from the shell bridge: messages via
 * `totalUnread` today; money / attention stay 0 until TUL-387/389 land
 * `shellCounts` on the bridge.
 */

import { CountBadge } from "@/components/ui/count-badge";
import { cn } from "@/lib/utils";

import { useDashboardText } from "./dashboard-i18n";
import { Icon, type AdminShellIconName } from "./primitives";
import {
  formatShellBubbleCount,
  SHELL_BUBBLE_FILL_CLASS,
  visibleShellCountBubbles,
  type ShellBubbleCount,
  type ShellBubbleKind,
} from "./shell-count-bubbles-logic";
import { useAdminShell } from "./state";

export type { ShellBubbleCount, ShellBubbleKind };
export {
  formatShellBubbleCount,
  SHELL_BUBBLE_FILL_CLASS,
  shellBubbleFillsAvoidGoldRust,
  visibleShellCountBubbles,
} from "./shell-count-bubbles-logic";

const ICON_FOR: Record<ShellBubbleKind, AdminShellIconName> = {
  messages: "mail",
  money: "credit",
  attention: "info",
};

const LABEL_KEY: Record<ShellBubbleKind, string> = {
  messages: "Messages",
  money: "Money",
  attention: "Attention",
};

type ShellCountBubblesProps = {
  size?: "sm" | "md";
  /** Override counts (tests / story). Defaults to bridge-derived. */
  counts?: ReadonlyArray<ShellBubbleCount>;
  className?: string;
};

/**
 * Icon cluster with corner CountBadges. Renders nothing when every count is 0.
 */
export function ShellCountBubbles({
  size = "md",
  counts: countsProp,
  className,
}: ShellCountBubblesProps) {
  const { state, openDrawer, totalUnread, bridgeTalentUnread } = useAdminShell();
  const copy = useDashboardText();
  const inWorkspace = state.surface === "workspace";

  const messages =
    countsProp?.find((c) => c.kind === "messages")?.count ??
    (inWorkspace
      ? totalUnread
      : (bridgeTalentUnread !== undefined ? bridgeTalentUnread : totalUnread));
  const money = countsProp?.find((c) => c.kind === "money")?.count ?? 0;
  const attention =
    countsProp?.find((c) => c.kind === "attention")?.count ?? 0;

  const visible = visibleShellCountBubbles([
    { kind: "messages", count: messages },
    { kind: "money", count: money },
    { kind: "attention", count: attention },
  ]);

  if (visible.length === 0) return null;

  const iconSize = size === "sm" ? 14 : 15;
  const drawerId = inWorkspace ? "notifications" : "talent-notifications";

  return (
    <div
      data-tulala-shell-count-bubbles
      className={cn("inline-flex items-center gap-[6px]", className)}
    >
      {visible.map(({ kind, count }) => {
        const label = copy.t(LABEL_KEY[kind]);
        return (
          <button
            key={kind}
            type="button"
            data-shell-count-bubble={kind}
            aria-label={`${label} · ${formatShellBubbleCount(count)}`}
            onClick={() => openDrawer(drawerId, { category: kind })}
            className={cn(
              "relative inline-flex shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-admin-border-soft bg-white text-admin-ink-muted outline-none hover:border-admin-border hover:text-admin-ink [transition:border-color_var(--transition-admin-micro),color_var(--transition-admin-micro)]",
              size === "sm" ? "h-[28px] w-[28px]" : "h-[32px] w-[32px]",
            )}
          >
            <Icon name={ICON_FOR[kind]} size={iconSize} stroke={1.75} color="currentColor" />
            <CountBadge
              count={count}
              accentClassName="border-white"
              className={cn(
                "h-[18px] min-w-[18px] px-1 text-[9.5px] font-bold shadow-[0_1px_2px_rgba(11,11,13,0.18)]",
                SHELL_BUBBLE_FILL_CLASS[kind],
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
