/**
 * Pure rules for the guest dock's first message (TUL-401). No React, no I/O, so
 * each rule has a fixture test.
 *
 * Three defects made "type a first message, press Enter or send" a silent no-op
 * on a fresh talent host:
 *   1. The composer only submitted on Cmd/Ctrl+Enter; a plain Enter did nothing.
 *   2. The first send of a guest with no identity raises the contact gate by
 *      setting stage "gate", but the thread-load effect (which runs whenever an
 *      early inquiry row exists) then forced the stage back to "thread", so the
 *      gate was swallowed and nothing visible happened.
 *   3. (Server, unchanged) the inquiry needs first name + email, so the gate is
 *      the only way a fresh guest can send; it must stay on screen.
 */

export type DockStage = "intro" | "gate" | "thread";

/** Keyboard fields the composer needs; matches a React KeyboardEvent. */
export type ComposerKey = {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  /** True while an IME is composing (Enter confirms the candidate, not the send). */
  isComposing: boolean;
};

/** Enter sends, Shift+Enter is a newline, Cmd/Ctrl+Enter still sends. */
export function composerKeyAction(e: ComposerKey): "submit" | "none" {
  if (e.key !== "Enter" || e.isComposing) return "none";
  if (e.metaKey || e.ctrlKey) return "submit";
  return e.shiftKey ? "none" : "submit";
}

/**
 * Stage after a thread load finishes. An open contact gate belongs to the
 * guest who is typing their details; a background load must not close it.
 */
export function stageAfterThreadLoad(current: DockStage): DockStage {
  return current === "gate" ? "gate" : "thread";
}

export type FirstSendRoute =
  | "noop"
  | "answer"
  | "gate"
  | "reply"
  | "continue"
  | "start";

/**
 * Where the composer's submit goes. `gate` means: show the contact form and keep
 * the draft; it is never a silent return for a non-empty draft.
 */
export function firstSendRoute(input: {
  draft: string;
  hasContact: boolean;
  inquiryId: string | null;
  contactPromoted: boolean;
  hasInstantAnswer: boolean;
}): FirstSendRoute {
  if (!input.draft.trim()) return "noop";
  if (!input.hasContact) {
    return !input.inquiryId && input.hasInstantAnswer ? "answer" : "gate";
  }
  if (input.inquiryId && input.contactPromoted) return "reply";
  return input.inquiryId ? "continue" : "start";
}
