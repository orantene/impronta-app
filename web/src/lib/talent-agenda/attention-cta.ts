/**
 * Pure attention CTA resolver — shared by Today Attention page and Calendar peek.
 */

import type { TalentAgendaItem } from "./types";

export type AttentionCtaKind =
  | "reply"
  | "release_hold"
  | "collect"
  | "complete"
  | "open";

export type AttentionCta = {
  kind: AttentionCtaKind;
  label: string;
  /** True when this CTA mutates server state (not just navigation). */
  mutates: boolean;
};

export function resolveAttentionCta(item: TalentAgendaItem): AttentionCta {
  if (item.kind === "request" || item.booking === "requested") {
    return { kind: "reply", label: "Reply", mutates: false };
  }
  if (item.booking === "hold" || item.kind === "hold") {
    // Confirm/convert is staff/record path; talent-owned mutation here is release.
    return { kind: "release_hold", label: "Release hold", mutates: true };
  }
  if (item.payment === "overdue" || item.payment === "due" || item.payment === "partial") {
    return { kind: "collect", label: "Collect", mutates: false };
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
  if (primary.kind === "collect") return ["Collect", "Reschedule", "Open booking"];
  if (primary.kind === "complete") return ["Mark finished", "Reschedule", "Open booking"];
  return ["Message", "Open booking", "Reschedule"];
}
