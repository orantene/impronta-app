/**
 * Pure helpers for TUL-388 ShellCountBubbles (no React / shell imports).
 */

export type ShellBubbleKind = "messages" | "money" | "attention";

export type ShellBubbleCount = {
  kind: ShellBubbleKind;
  count: number;
};

const ORDER: readonly ShellBubbleKind[] = ["messages", "money", "attention"];

/** Brand fills — coral / forest / slate via admin tokens (no gold or rust). */
export const SHELL_BUBBLE_FILL_CLASS: Record<ShellBubbleKind, string> = {
  messages: "bg-admin-coral text-white border-white",
  money: "bg-admin-green text-white border-white",
  attention: "bg-admin-amber text-white border-white",
};

export function formatShellBubbleCount(count: number): string {
  if (count <= 0) return "";
  if (count > 99) return "99+";
  return String(count);
}

/** Which of the three bubbles should render (count > 0), order stable. */
export function visibleShellCountBubbles(
  counts: ReadonlyArray<ShellBubbleCount>,
): ShellBubbleCount[] {
  const byKind = new Map(counts.map((c) => [c.kind, c.count] as const));
  const out: ShellBubbleCount[] = [];
  for (const kind of ORDER) {
    const count = byKind.get(kind) ?? 0;
    if (count > 0) out.push({ kind, count });
  }
  return out.slice(0, 3);
}

/** Pure: no gold/rust hex in the fill map (static guard companion). */
export function shellBubbleFillsAvoidGoldRust(): boolean {
  const joined = Object.values(SHELL_BUBBLE_FILL_CLASS).join(" ");
  return !/#[DdEeFf]4[Aa][0-9AaFf]|gold|rust|#[Bb]8[6Bb]|#[Cc]4[5-9Aa]/i.test(
    joined,
  );
}
