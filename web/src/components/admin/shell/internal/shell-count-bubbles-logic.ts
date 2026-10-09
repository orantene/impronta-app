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
 * Shared with `adaptTalentInquiry` so inbox stage chips and bubble counts
 * cannot drift. There is no DB status named `inquiry` — that is a MsgStage.
 *
 * Active pipeline: submitted / coordination → inquiry; offer_pending /
 * approved → hold. TalentJobShell badges inquiry|hold as "awaiting you" /
 * "esperando tu respuesta".
 */
export type TalentInquiryMsgStage =
  | "inquiry"
  | "hold"
  | "booked"
  | "cancelled";

/** Real `inquiry_status` values that map to awaiting-you (inquiry|hold). */
export const TALENT_AWAITING_YOU_STATUSES: ReadonlySet<string> = new Set([
  "submitted",
  "coordination",
  "offer_pending",
  "approved",
]);

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
  // submitted, coordination, and other non-terminal → inquiry stage
  return "inquiry";
}

/** Same stage check TalentJobShell uses for the "awaiting you" chip. */
export function isTalentAwaitingYouStage(stage: string): boolean {
  return stage === "inquiry" || stage === "hold";
}

/**
 * True when a bridge `TalentInquiryRow` should count toward the attention
 * bubble / match inbox "esperando tu respuesta". Uses real DB statuses
 * (not MsgStage names); equivalent to stage inquiry|hold for the active
 * pipeline set above.
 */
export function isTalentInquiryAwaitingYou(row: {
  status: string;
}): boolean {
  if (!TALENT_AWAITING_YOU_STATUSES.has(row.status)) return false;
  return isTalentAwaitingYouStage(talentInquiryMsgStageFromStatus(row.status));
}

/**
 * Pure: how many talent inquiries still need the talent's response.
 * Used for the talent-shell Attention bubble when bridge attention is 0
 * (TUL-519 / card 385). Counts via the same awaiting-you predicate as the
 * inbox list so bubble and list cannot disagree.
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
