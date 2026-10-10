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

/**
 * MsgStage derived from raw DB `inquiry_status` on `TalentInquiryRow.status`.
 * Shared with `adaptTalentInquiry` so inbox stage chips, attention bubble,
 * and Hoy "Needs attention" cannot drift. There is no DB status named
 * `inquiry` — that is a MsgStage.
 *
 * Active pipeline: `new` / submitted / coordination (and other non-terminal)
 * → inquiry; offer_pending / approved → hold. TalentJobShell badges
 * inquiry|hold as "awaiting you" / "esperando tu respuesta".
 *
 * Do not maintain a second status allowlist — awaiting = stage inquiry|hold
 * after this map (same predicate the inbox chip uses).
 */
export type TalentInquiryMsgStage =
  | "inquiry"
  | "hold"
  | "booked"
  | "cancelled";

export function talentInquiryMsgStageFromStatus(
  status: string,
): TalentInquiryMsgStage {
  if (status === "booked" || status === "converted") return "booked";
  if (
    status === "rejected" ||
    status === "expired" ||
    status === "cancelled" ||
    status === "closed" ||
    status === "closed_lost" ||
    status === "archived"
  ) {
    return "cancelled";
  }
  if (status === "approved" || status === "offer_pending") return "hold";
  // new, submitted, coordination, and other non-terminal → inquiry stage
  return "inquiry";
}

/** Same stage check TalentJobShell uses for the "awaiting you" chip. */
export function isTalentAwaitingYouStage(stage: string): boolean {
  return stage === "inquiry" || stage === "hold";
}

/**
 * True when a bridge `TalentInquiryRow` should count toward the attention
 * bubble / Hoy card / match inbox "esperando tu respuesta". One predicate:
 * map status → MsgStage, then `isTalentAwaitingYouStage` (no status Set).
 */
export function isTalentInquiryAwaitingYou(row: {
  status: string;
}): boolean {
  return isTalentAwaitingYouStage(talentInquiryMsgStageFromStatus(row.status));
}

/**
 * Pure: how many talent inquiries still need the talent's response.
 * Used for the talent-shell Attention bubble and Hoy "Needs attention"
 * (TUL-519 / card 385). Same awaiting-you predicate as the inbox chip.
 */
export function countTalentAwaitingInquiries(
  rows: ReadonlyArray<{ status: string }>,
): number {
  let n = 0;
  for (const row of rows) {
    if (isTalentInquiryAwaitingYou(row)) n += 1;
  }
  return n;
}

/**
 * Hover / first-time meaning for the attention bubble. English source strings
 * are catalog keys; pass `copy.t` so Spanish dashboards get the ES rows.
 */
export function shellAttentionTooltip(
  count: number,
  t: (value: string) => string,
): string {
  if (count === 1) return t("1 conversation awaits your reply");
  return t("{n} conversations await your reply").replace("{n}", String(count));
}
