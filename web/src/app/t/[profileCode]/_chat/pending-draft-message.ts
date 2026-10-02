"use client";

/**
 * Pending draft message: free text an on-page app (e.g. the Nail Designer)
 * hands to the front-door chat through `tulala:ask-question` (`detail.message`).
 * The launcher stashes it here and opens the panel; the panel takes it once as
 * the composer's starting text. It is only a pre-fill: the visitor can edit or
 * clear it, and nothing is sent until they press send. Module scope on purpose:
 * the app and the chat are separate React trees on the same page.
 */

/** Hard cap so a stray event can never preload a huge composer. */
export const PENDING_DRAFT_MAX = 500;

let pending: string | null = null;

export function setPendingDraftMessage(next: string | null | undefined): void {
  const text = typeof next === "string" ? next.trim().slice(0, PENDING_DRAFT_MAX) : "";
  pending = text.length > 0 ? text : null;
}

export function takePendingDraftMessage(): string | null {
  const cur = pending;
  pending = null;
  return cur;
}
