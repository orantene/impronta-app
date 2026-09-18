/**
 * pos-continuity.ts (L10, D-MSG-172) — pure helpers proving what survives a
 * Workspace ⇄ POS switch while a thread and a sale are both open: the
 * inquiry id, the open order id, and the unsent draft (already keyed by
 * tenant+location+inquiry in `draftStorageKey`, so it needs no new key here —
 * it is the SAME key regardless of which route reads it).
 *
 * Nothing here is a writer. `findConversationForOrder` reads the same
 * `InboxRow.recordChips` the shell already loaded (sourced from
 * `conversation_records`, S2) rather than adding a new reader — Principle 0.
 */

import type { InboxRow } from "@/lib/messaging/types";

/** `?inquiry=<id>&order=<id>`, only the params that are present. */
export function continuityParams(input: { readonly inquiryId?: string | null; readonly orderId?: string | null }): URLSearchParams {
  const params = new URLSearchParams();
  if (input.inquiryId) params.set("inquiry", input.inquiryId);
  if (input.orderId) params.set("order", input.orderId);
  return params;
}

/** Appends continuity params to an existing href, respecting a `?` already there. */
export function appendContinuity(href: string, input: { readonly inquiryId?: string | null; readonly orderId?: string | null }): string {
  const qs = continuityParams(input).toString();
  if (!qs) return href;
  return href + (href.includes("?") ? "&" : "?") + qs;
}

/** The POS Messages dock's own URL: `<posPath>?view=messages&mode=<mode>[&order=][&inquiry=]`. */
export function posMessagesDockHref(input: { readonly posPath: string; readonly mode: string; readonly orderId?: string | null; readonly inquiryId?: string | null }): string {
  return appendContinuity(`${input.posPath}?view=messages&mode=${input.mode}`, { orderId: input.orderId, inquiryId: input.inquiryId });
}

/** The workspace Messages surface's own URL: `<adminBasePath>/messages[?inquiry=]`. */
export function workspaceMessagesHref(input: { readonly adminBasePath: string; readonly inquiryId?: string | null }): string {
  return appendContinuity(`${input.adminBasePath}/messages`, { inquiryId: input.inquiryId });
}

/** `openMode` (PosModeSwitch, workspace → POS): carries the thread the person is on into the counter's dock. */
export function posSwitchHref(input: { readonly adminBasePath: string; readonly mode: string; readonly inquiryId?: string | null; readonly orderId?: string | null }): string {
  const base = `${input.adminBasePath}/pos?mode=${input.mode}`;
  return appendContinuity(base, { inquiryId: input.inquiryId, orderId: input.orderId });
}

/** `goWorkspace` (PosModeSwitch, POS → workspace): carries the thread back out, landing on Messages when one was open. */
export function workspaceSwitchHref(input: { readonly adminBasePath: string; readonly inquiryId?: string | null }): string {
  if (!input.inquiryId) return input.adminBasePath;
  return workspaceMessagesHref({ adminBasePath: input.adminBasePath, inquiryId: input.inquiryId });
}

/** D-MSG-172: ≥1100 the dock sits beside the sale; below it, Messages is a drawer over the sale. */
export const POS_DOCK_MIN_WIDTH = 1100;

export function shouldDockBesideSale(width: number): boolean {
  return width >= POS_DOCK_MIN_WIDTH;
}

/**
 * "This customer": the conversation already linked to the open sale's order,
 * read off `InboxRow.recordChips` (an `order` chip whose `recordId` is the
 * sale's order id) rather than a new `conversation_records` reader.
 */
export function findConversationForOrder(rows: readonly InboxRow[], orderId: string | null): string | null {
  if (!orderId) return null;
  const hit = rows.find((row) => row.recordChips.some((chip) => chip.kind === "order" && chip.recordId === orderId));
  return hit?.id ?? null;
}

/**
 * Falls back to the customer's own open conversation (by contact match) when
 * the order itself carries no chip yet (a brand-new sale with no messages).
 * `contactPhone`/`contactEmail` come from the SAME inbox rows already loaded;
 * this compares digits-only phone and lower-cased email, like the shell's own
 * `sameContact` (`MessagesV5Shell.tsx`).
 */
export function findOpenConversationForCustomer(rows: readonly InboxRow[], customer: { readonly phone?: string | null; readonly email?: string | null }): string | null {
  const phoneDigits = (customer.phone ?? "").replace(/\D/g, "");
  const email = (customer.email ?? "").trim().toLowerCase();
  if (!phoneDigits && !email) return null;
  const hit = rows.find((row) => {
    if (row.conversationState === "resolved") return false;
    if (phoneDigits && (row.contactPhone ?? "").replace(/\D/g, "") === phoneDigits) return true;
    return !!email && (row.contactEmail ?? "").trim().toLowerCase() === email;
  });
  return hit?.id ?? null;
}
