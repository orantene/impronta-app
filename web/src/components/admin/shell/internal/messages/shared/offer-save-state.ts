/**
 * offer-save-state — W0-1 pure core for the offer editor's save-state surface.
 *
 * WHY: a coordinator building a priced offer must know, at every second, whether
 * the server has their work. The old surfacing was a 4-second toast plus a tiny
 * "Save failed" label — the wrong severity for "your work is NOT saved." During
 * the 2026-07-11 prod audit an expired session silently ate a $5,000 offer.
 *
 * This module is DOM-free + i18n-free so it is unit-testable: it classifies the
 * raw error string a save action returns into a stable `kind` + a translation
 * key, so the banner (offer-save-banner.tsx) renders the right severity and the
 * editor can react (auth → recovery, conflict → reload, validation → highlight).
 *
 * The classifier keys off the SUBSTRINGS the pipeline actions + engine actually
 * return (see admin-scope.ts "You must be signed in.", inquiry-engine-offers.ts
 * "line_item_talent_required" / "version_conflict" / rate-limit / etc.). We match
 * loosely (includes, case-insensitive) so a wrapped/prefixed message still lands
 * in the right bucket rather than falling through to a bare string.
 */

export type SaveErrorKind =
  | "auth" // session expired / not signed in — recoverable via refresh + local snapshot
  | "conflict" // someone else edited this offer — must reload
  | "rate_limited" // too many saves in the window
  | "line_talent_required" // a priced line has no talent assigned
  | "not_editable" // offer already sent / booking immutable
  | "empty" // nothing to save/send
  | "not_found" // offer/inquiry vanished
  | "unknown"; // anything else — generic retryable failure

export type SaveErrorClass = {
  kind: SaveErrorKind;
  /** i18n key under dashboard.adminTabs.lineup.saveErr.* for the human sentence. */
  messageKey: string;
  /** Whether "Reintentar" (retry) is the right primary affordance. */
  retryable: boolean;
};

const K = "dashboard.adminTabs.lineup.saveErr.";

/**
 * Classify a raw save-action error string. Order matters — most specific first.
 * Never throws; an empty/undefined input classifies as `unknown`.
 */
export function classifySaveError(raw: string | null | undefined): SaveErrorClass {
  const s = (raw ?? "").toLowerCase();

  if (!s) return { kind: "unknown", messageKey: K + "unknown", retryable: true };

  // Auth — the highest-value case: recoverable without data loss (W0-2).
  if (s.includes("signed in") || s.includes("not authenticated") || s.includes("unauthorized")) {
    return { kind: "auth", messageKey: K + "auth", retryable: true };
  }
  // Optimistic-concurrency: a stale editor vs a newer server offer.
  if (s.includes("version_conflict") || s.includes("conflict")) {
    return { kind: "conflict", messageKey: K + "conflict", retryable: false };
  }
  if (s.includes("rate_limited") || s.includes("too many") || s.includes("rate limit")) {
    return { kind: "rate_limited", messageKey: K + "rateLimited", retryable: true };
  }
  // Money-integrity guard: every priced line must name a talent (commission
  // snapshot is resolved per participant). This is the one validation the
  // coordinator can fix inline, so it gets its own bucket + row highlight.
  if (s.includes("line_item_talent_required") || s.includes("talent_required")) {
    return { kind: "line_talent_required", messageKey: K + "lineTalentRequired", retryable: false };
  }
  if (
    s.includes("not_editable") ||
    s.includes("offer_not_editable") ||
    s.includes("post_booking_immutable") ||
    s.includes("frozen")
  ) {
    return { kind: "not_editable", messageKey: K + "notEditable", retryable: false };
  }
  if (s.includes("empty_offer") || s.includes("empty")) {
    return { kind: "empty", messageKey: K + "empty", retryable: false };
  }
  if (s.includes("not_found") || s.includes("not found")) {
    return { kind: "not_found", messageKey: K + "notFound", retryable: false };
  }
  return { kind: "unknown", messageKey: K + "unknown", retryable: true };
}

/** The editor's live save-state. `saved` carries the epoch ms of the last success. */
export type OfferSaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; at: number }
  | { status: "error"; cls: SaveErrorClass; rawError: string };

/**
 * Result of the send gate. When blocked, `reasonKey` is an i18n key under
 * `dashboard.adminTabs.lineup.saveErr.*` naming the human reason so the Send
 * button can surface it in a tooltip (W0-3 cross-component wiring).
 */
export type SendGateResult = { ok: true } | { ok: false; reasonKey: string };

/**
 * Whether the "Send to client" action must be blocked. Sending an offer whose
 * lines are unsaved or failed would transmit a $0 / stale offer — the worst
 * surprise for both the client and the agency (W0-3). Send is allowed ONLY from
 * a clean `saved` state where the last-saved line count + total match what the
 * editor currently shows.
 */
export function canSendOffer(args: {
  state: OfferSaveState;
  editorLineCount: number;
  editorTotal: number;
  lastSavedLineCount: number | null;
  lastSavedTotal: number | null;
}): SendGateResult {
  if (args.state.status === "saving") {
    return { ok: false, reasonKey: K + "sendBlockedSaving" };
  }
  if (args.state.status === "error") {
    return { ok: false, reasonKey: K + "sendBlockedError" };
  }
  if (args.editorLineCount === 0) {
    return { ok: false, reasonKey: K + "sendBlockedEmpty" };
  }
  // Editor drifted from the last successful save (edited-but-not-saved).
  if (
    args.lastSavedLineCount !== args.editorLineCount ||
    args.lastSavedTotal !== args.editorTotal
  ) {
    return { ok: false, reasonKey: K + "sendBlockedUnsaved" };
  }
  return { ok: true };
}
