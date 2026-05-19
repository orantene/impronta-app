"use client";

import { MY_TALENT_PROFILE, RICH_INQUIRIES, type RichInquiry } from "../../state";


export function myInquiries(): RichInquiry[] {
  const myName = MY_TALENT_PROFILE.name;
  return RICH_INQUIRIES.filter((i) => {
    const inRoster = i.requirementGroups.some((g) =>
      g.talents.some((t) => t.name === myName),
    );
    const onOffer = i.offer?.lineItems.some((l) => l.talentName === myName) ?? false;
    return inRoster || onOffer;
  });
}


/**
 * My status on an inquiry — the most relevant signal for the talent inbox.
 * Prioritise offer line item status (most concrete), fall back to roster.
 */
export function myStatusOn(inquiry: RichInquiry): "pending" | "accepted" | "declined" | "none" {
  const myName = MY_TALENT_PROFILE.name;
  const line = inquiry.offer?.lineItems.find((l) => l.talentName === myName);
  if (line) {
    if (line.status === "accepted") return "accepted";
    if (line.status === "declined") return "declined";
    if (line.status === "pending") return "pending";
  }
  for (const g of inquiry.requirementGroups) {
    const t = g.talents.find((tt) => tt.name === myName);
    if (t) {
      if (t.status === "accepted") return "accepted";
      if (t.status === "declined") return "declined";
      if (t.status === "pending") return "pending";
    }
  }
  return "none";
}


export function unreadOnInquiry(inquiry: RichInquiry): number {
  // Talent only ever sees the group thread, so private unread is hidden from them.
  return inquiry.unreadGroup;
}
