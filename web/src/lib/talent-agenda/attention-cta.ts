/**
 * Pure attention CTA resolver — shared by Today Attention page and Calendar peek.
 */

import type { TalentAgendaItem } from "./types";

export type AttentionCtaKind =
  | "reply"
  | "release_hold"
  | "collect"
  | "complete"
  | "intake"
  | "reschedule"
  | "open";

export type AttentionCta = {
  kind: AttentionCtaKind;
  label: string;
  /** True when this CTA mutates server state (not just navigation). */
  mutates: boolean;
};

function hasPendingReschedule(item: TalentAgendaItem): boolean {
  return Boolean(
    item.tradeSection?.payload?.rescheduleRequestId ||
      item.tradeSection?.payload?.rescheduleStatus === "pending" ||
      item.history.some((h) => /reschedule pending/i.test(h.text)),
  );
}

function hasPendingIntake(item: TalentAgendaItem): boolean {
  return (
    item.tradeSection?.kind === "intake" &&
    item.tradeSection.payload.status === "pending"
  );
}

export function resolveAttentionCta(item: TalentAgendaItem): AttentionCta {
  if (item.kind === "request" || item.booking === "requested") {
    return { kind: "reply", label: "Reply", mutates: false };
  }
  if (item.booking === "hold" || item.kind === "hold") {
    // Confirm/convert is staff/record path; talent-owned mutation here is release.
    return { kind: "release_hold", label: "Release hold", mutates: true };
  }
  if (hasPendingReschedule(item)) {
    return { kind: "reschedule", label: "Respond to reschedule", mutates: false };
  }
  if (hasPendingIntake(item)) {
    return { kind: "intake", label: "Review intake", mutates: false };
  }
  if (item.payment === "overdue" || item.payment === "due" || item.payment === "partial") {
    return { kind: "collect", label: "Collect", mutates: false };
  }
  if (item.payment === "awaiting" && item.paymentMethod === "transfer") {
    return { kind: "collect", label: "Confirm transfer", mutates: true };
  }
  if (item.booking === "confirmed" && item.money.dueCents === 0) {
    return { kind: "complete", label: "Mark finished", mutates: true };
  }
  return { kind: "open", label: "Open", mutates: false };
}

export function whoLabel(item: TalentAgendaItem): string {
  return item.client?.name ?? item.managedBy?.name ?? "them";
}

export function peekActionLabels(item: TalentAgendaItem): string[] {
  const primary = resolveAttentionCta(item);
  if (primary.kind === "reply") return ["Reply", "Open booking", "Decline later"];
  if (primary.kind === "release_hold") return ["Release hold", "Message", "Open booking"];
  if (primary.kind === "reschedule") return ["Respond to reschedule", "Open booking", "Message"];
  if (primary.kind === "intake") return ["Review intake", "Open booking", "Message"];
  if (primary.kind === "collect") return [primary.label, "Reschedule", "Open booking"];
  if (primary.kind === "complete") return ["Mark finished", "Reschedule", "Open booking"];
  return ["Message", "Open booking", "Reschedule"];
}
