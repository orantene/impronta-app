/**
 * Pure inquiry-context CTA resolver (Jon 360 CRO, blocker B3).
 *
 * Given a fully-resolved snapshot of "what does this viewer have going on"
 * (active inquiry, lineup/cart, drafts, other open threads), returns the
 * single CTA STATE the surface should render. This is pure logic: it fetches
 * nothing, knows nothing about React, and carries NO surface-specific labels
 * (each surface maps `kind` -> its own control + copy).
 *
 * The precedence order is the product. It is encoded exactly, in order, in
 * resolveInquiryCta. The load-bearing invariant: a terminal / declined /
 * expired / booked inquiry MUST NEVER yield a forward-motion CTA. That is the
 * regression guard against the dead-CTA class (see the test file).
 *
 * Reuses getWorkflowPhase / isTerminalPhase + the phase model from
 * inquiry-lifecycle.ts. Does NOT fork a parallel status list.
 *
 * Run: npx tsx --test src/lib/inquiry/inquiry-context-resolver.test.ts
 */

import {
  type InquiryWorkflowPhase,
  getWorkflowPhase,
  isTerminalPhase,
} from "./inquiry-lifecycle";

// ─────────────────────────────────────────────────────────────────────────────
// Tunables (named so surfaces + tests can reference the exact threshold).
// ─────────────────────────────────────────────────────────────────────────────

/** A draft is "stale" once its last activity is older than this. */
export const STALE_DRAFT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Phases that mean "the inquiry has been SENT and is live in coordination".
 * Derived from the lifecycle phase model, NOT a hand-maintained status list.
 * Note: terminal phases (booked/rejected/expired/archived) are intentionally
 * excluded here because rule 0 (terminal) runs first and short-circuits.
 */
export const SENT_LIVE_PHASES: ReadonlySet<InquiryWorkflowPhase> = new Set<InquiryWorkflowPhase>([
  "submitted",
  "coordination",
  "offer_pending",
  "approved",
]);

/**
 * Message authors that count as "the ball is in the conversation" (someone on
 * the agency/coordinator side, or the viewer themself, has spoken). When a
 * coordinator is assigned AND the last message is from one of these, the thread
 * reads as a live conversation rather than a one-way "sent, awaiting" airlock.
 */
export const LIVE_CONVERSATION_MESSAGE_ROLES: ReadonlySet<NonNullable<LastMessageRole>> = new Set<
  NonNullable<LastMessageRole>
>(["coordinator", "you"]);

// ─────────────────────────────────────────────────────────────────────────────
// Input
// ─────────────────────────────────────────────────────────────────────────────

export type CtaIdentity = "guest" | "client";

export type LastMessageRole =
  | "coordinator"
  | "client"
  | "you"
  | "system"
  | "talent"
  | null;

export type OtherOpenInquiry = {
  id: string;
  phase: InquiryWorkflowPhase;
  label?: string;
};

export type InquiryCtaInput = {
  /** The talent currently in focus (e.g. the card/profile being viewed), or null on a non-talent surface (lineup/cart review). */
  talentProfileId: string | null;
  /** Is the focused talent already in the working lineup/cart? */
  isInLineup: boolean;
  /** How many talents are in the working lineup/cart. */
  lineupCount: number;
  /** Talent ids in the working lineup/cart. */
  lineupTalentIds: string[];
  /** Has the focused talent had contact promoted (guest -> registered etc.). */
  contactPromoted: boolean;
  /** Is there an active draft inquiry the viewer can resume? */
  hasActiveDraft: boolean;
  /** Id of that active draft, if any. */
  draftInquiryId: string | null;
  /** Lifecycle phase of the ACTIVE inquiry (via getWorkflowPhase), or null if none. */
  activePhase: InquiryWorkflowPhase | null;
  /** Raw status of the active inquiry (for terminal detection), or null if none. */
  activeStatus: string | null;
  /** Other open inquiries the viewer could pick instead of starting fresh. */
  otherOpenInquiries: OtherOpenInquiry[];
  /** Viewer identity. */
  identity: CtaIdentity;
  /** ISO timestamp of last activity on the active draft/inquiry, or null. */
  lastActivityAt: string | null;
  /** Coordinator assigned to the active inquiry, or null. */
  coordinatorId: string | null;
  /** Author of the most recent message in the active thread, or null. */
  lastMessageRole: LastMessageRole;
  /**
   * W2-B — the active SENT inquiry has an UNSEEN agency/coordinator reply as its
   * latest message (the ball is with the visitor). Additive + optional: when
   * omitted (undefined/false) the resolver behaves exactly as before. When true
   * on a SENT/live phase it yields the `replied` state ("{agency} replied" +
   * pulse), which is cleared the moment the thread is opened (the caller flips
   * this back to false on open — a false-negative is fine, a stuck true is not).
   */
  hasUnseenAgencyReply?: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Output (discriminated union on `kind`)
// ─────────────────────────────────────────────────────────────────────────────

export type TerminalReason =
  | "declined"
  | "expired"
  | "booked"
  | "closed"
  | "cancelled";

export type InquiryCtaState =
  /** No talent in lineup yet; primary "add the first one" call. */
  | { kind: "add_first" }
  /** Focused talent is NOT in the lineup; offer to add. */
  | { kind: "add_to_lineup"; lineupCount: number }
  /** Focused talent is already in the lineup. */
  | { kind: "in_lineup"; lineupCount: number }
  /** Non-talent surface with a non-empty lineup; review/send it. */
  | { kind: "review_lineup"; lineupCount: number }
  /** Viewer has other open inquiries to jump into instead of starting fresh. */
  | { kind: "pick_inquiry"; otherOpenInquiries: OtherOpenInquiry[] }
  /** A stale draft exists; offer to resume it. */
  | { kind: "resume_draft"; draftInquiryId: string | null }
  /** Inquiry sent, one-way, no coordinator yet / waiting on the agency. */
  | { kind: "sent_awaiting"; phase: InquiryWorkflowPhase }
  /** Inquiry sent AND a live two-way conversation is underway. */
  | { kind: "live_conversation"; phase: InquiryWorkflowPhase; coordinatorId: string }
  /**
   * Inquiry sent AND an UNSEEN agency reply is waiting (W2-B). Distinct from
   * live_conversation (which is the SEEN, two-way state): this is the only state
   * that reads "{agency} replied" and draws the pulse. Opening the thread clears
   * the unseen signal, so it collapses back to live_conversation / sent_awaiting.
   * coordinatorId is nullable because the reply itself proves agency presence
   * even in the (test-only) case where no coordinator id is threaded through.
   */
  | { kind: "replied"; phase: InquiryWorkflowPhase; coordinatorId: string | null }
  /** Inquiry is terminal; render the closed state with the mapped reason. */
  | { kind: "terminal"; reason: TerminalReason };

/** Forward-motion kinds that a terminal inquiry must NEVER produce. */
export const FORWARD_MOTION_KINDS = [
  "add_first",
  "add_to_lineup",
  "in_lineup",
  "review_lineup",
  "resume_draft",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map the active inquiry's terminal phase/status to a CTA-facing reason.
 * Phase is the primary signal (it already folds legacy statuses); the raw
 * status only disambiguates the two flavors of "archived" (closed vs
 * cancelled), which share a phase but read differently to a user.
 */
export function deriveTerminalReason(
  phase: InquiryWorkflowPhase,
  rawStatus: string | null,
): TerminalReason {
  switch (phase) {
    case "rejected":
      return "declined";
    case "expired":
      return "expired";
    case "booked":
      return "booked";
    case "archived":
      // Distinguish an explicit cancellation from a plain close, when the raw
      // status tells us. Default archived reads as "closed".
      if (rawStatus === "cancelled" || rawStatus === "canceled") return "cancelled";
      return "closed";
    default:
      // Not actually terminal; treat as a generic close rather than throw.
      return "closed";
  }
}

/** True when the active inquiry is terminal by phase OR by raw status. */
function activeInquiryIsTerminal(
  activePhase: InquiryWorkflowPhase | null,
  activeStatus: string | null,
): boolean {
  if (activePhase != null && isTerminalPhaseValue(activePhase)) return true;
  if (activeStatus != null && isTerminalPhase(activeStatus)) return true;
  return false;
}

/** Phase-level terminal check (the lifecycle helper takes a status string). */
function isTerminalPhaseValue(phase: InquiryWorkflowPhase): boolean {
  // A canonical phase name is also a valid status string, so reuse the helper
  // rather than forking the terminal set.
  return isTerminalPhase(phase);
}

function isDraftStale(lastActivityAt: string | null, now: number): boolean {
  if (!lastActivityAt) return false;
  const ts = Date.parse(lastActivityAt);
  if (Number.isNaN(ts)) return false;
  return now - ts > STALE_DRAFT_MS;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolver
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the single CTA state for the given inquiry context.
 *
 * `now` is injectable for deterministic tests; defaults to Date.now().
 *
 * Precedence (order is the product; do not reorder):
 *   0. Active inquiry that is terminal           -> terminal
 *   1. Active inquiry in a SENT/live phase        -> replied | live_conversation | sent_awaiting
 *   2. talent focus + other open inquiries        -> pick_inquiry
 *   3. talent focus + already in lineup           -> in_lineup
 *   4. talent focus + active draft (not in lineup)-> add_to_lineup
 *   5. talent focus (no draft)                    -> add_first
 *   6. no talent focus + non-empty lineup         -> review_lineup
 *   7. stale active draft                         -> resume_draft
 *   8. default                                    -> add_first
 */
export function resolveInquiryCta(
  input: InquiryCtaInput,
  now: number = Date.now(),
): InquiryCtaState {
  const {
    talentProfileId,
    isInLineup,
    lineupCount,
    hasActiveDraft,
    draftInquiryId,
    activePhase,
    activeStatus,
    otherOpenInquiries,
    lastActivityAt,
    coordinatorId,
    lastMessageRole,
    hasUnseenAgencyReply = false,
  } = input;

  const hasActiveInquiry = activePhase != null || activeStatus != null;

  // 0. Terminal short-circuits everything. A declined/expired/booked/closed
  //    inquiry must never present a forward-motion CTA.
  if (hasActiveInquiry && activeInquiryIsTerminal(activePhase, activeStatus)) {
    const phaseForReason =
      activePhase ?? (activeStatus != null ? getWorkflowPhase(activeStatus) : "archived");
    return { kind: "terminal", reason: deriveTerminalReason(phaseForReason, activeStatus) };
  }

  // 1. Sent / live phase. sent-vs-live is NOT keyed off phase alone: it is a
  //    live conversation only when a coordinator is assigned AND the last
  //    message came from the coordinator or the viewer ("you"). Otherwise it is
  //    a one-way "sent, awaiting" airlock.
  if (activePhase != null && SENT_LIVE_PHASES.has(activePhase)) {
    // 1a. An UNSEEN agency reply wins within the sent family: it is the only
    //     state that reads "{agency} replied" + pulses. The input flag is
    //     authoritative (the seam already gates it on a seated coordinator whose
    //     line is the latest, unread); the resolver stays pure and just surfaces
    //     it. Opening the thread flips the flag off, collapsing back to 1b/1c.
    if (hasUnseenAgencyReply) {
      return { kind: "replied", phase: activePhase, coordinatorId };
    }
    if (
      coordinatorId != null &&
      lastMessageRole != null &&
      LIVE_CONVERSATION_MESSAGE_ROLES.has(lastMessageRole)
    ) {
      return { kind: "live_conversation", phase: activePhase, coordinatorId };
    }
    return { kind: "sent_awaiting", phase: activePhase };
  }

  // 2. Viewer has other open inquiries to pick from (only meaningful on a
  //    talent-focused surface).
  if (otherOpenInquiries.length > 0 && talentProfileId != null) {
    return { kind: "pick_inquiry", otherOpenInquiries };
  }

  // 3. Focused talent already in the lineup.
  if (talentProfileId != null && isInLineup) {
    return { kind: "in_lineup", lineupCount };
  }

  // 4. Focused talent not in lineup, but a draft exists -> add to it.
  if (talentProfileId != null && hasActiveDraft) {
    return { kind: "add_to_lineup", lineupCount };
  }

  // 5. Focused talent, no draft -> start by adding the first.
  if (talentProfileId != null) {
    return { kind: "add_first" };
  }

  // 6. No talent focus, but a non-empty lineup exists -> review it.
  if (talentProfileId == null && lineupCount > 0) {
    return { kind: "review_lineup", lineupCount };
  }

  // 7. A stale draft exists -> offer to resume.
  if (hasActiveDraft && isDraftStale(lastActivityAt, now)) {
    return { kind: "resume_draft", draftInquiryId };
  }

  // 8. Default.
  return { kind: "add_first" };
}
