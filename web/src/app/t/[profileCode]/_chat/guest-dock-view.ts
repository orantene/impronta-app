/**
 * guest-dock-view.ts — Wave 2 (W2-A) 3-view dock model for the guest panel.
 *
 * The panel body is one of three views — Chat (the conversation, unchanged),
 * Lineup (the inquiry cart + saved favorites, two shelves), Projects (the
 * guest's inquiries as distinguishable project cards). This module holds the
 * pure, dependency-free pieces: the view union and the honest project-phase
 * derivation the Projects cards key their status chip on.
 *
 * PURE: no DOM, no i18n catalog, no server code — unit-testable with node:test.
 */

import type { GuestThreadStatus } from "@/lib/inquiry/guest-chat-contract";

/**
 * The dock views. DOCK v2 adds "home" — the friendly landing hub (agency hero +
 * a few big action cards) that the panel opens into for a fresh visitor. "chat"
 * renders the conversation; "lineup" and "projects" are the two roster/inquiry
 * surfaces.
 */
export type GuestDockView = "home" | "chat" | "lineup" | "projects";

/**
 * A project's honest lifecycle phase for the status chip:
 *   draft    — private, only the guest can see it
 *   awaiting — sent, no agency response yet
 *   replied  — the agency has responded (a coordinator message landed, or the
 *              thread advanced to an agency-driven status)
 */
export type GuestProjectPhase = "draft" | "awaiting" | "replied";

/**
 * Derive the phase from the SAME status spine listGuestInquiries returns
 * (`isDraft` mirrors status="draft"; threadStatus is the guest-facing mapping;
 * `lastMessageAuthor` is the newest private-thread message's author). A draft
 * must read as a draft and a sent as sent — never the reverse.
 */
export function deriveProjectPhase(inq: {
  isDraft: boolean;
  threadStatus: GuestThreadStatus;
  lastMessageAuthor?: "guest" | "agency" | null;
}): GuestProjectPhase {
  if (inq.isDraft || inq.threadStatus === "draft") return "draft";
  if (
    inq.lastMessageAuthor === "agency" ||
    inq.threadStatus === "offer_pending" ||
    inq.threadStatus === "approved" ||
    inq.threadStatus === "booked"
  ) {
    return "replied";
  }
  return "awaiting";
}
