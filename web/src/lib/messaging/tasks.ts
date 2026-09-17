import type { ConversationState, DerivedTask, IdentityLevel, OpportunityState, RecordChip } from "./types";

/**
 * S4 / owner decision 7: "Tasks are derived from state; no free-text tasks in
 * v1." `deriveTasks` is the single place that turns the three state
 * families + a few record-level facts into the ordered "what next" list a
 * thread shows. Pure — no admin client, no I/O — so every situation is a
 * plain object in and an array out.
 */
export type DeriveTasksInput = {
  conversationState: ConversationState;
  opportunityState: OpportunityState | null;
  recordChips: readonly Pick<RecordChip, "kind" | "paymentState" | "fulfilmentState">[];
  /** Essentials.customer.identityLevel — needed to catch "a hold exists but
   * nobody has confirmed who this is" before the hold silently expires. */
  identityLevel: IdentityLevel;
  unanswered: boolean;
  talentConfirmationsPending: number;
  /** ISO timestamp, or null if nothing is owed. */
  balanceDueAt: string | null;
  /** ISO timestamp of a due (or overdue) scheduled reminder, or null. */
  reminderDueAt: string | null;
  /** ISO timestamp a capacity/time hold expires, or null. */
  holdExpiresAt: string | null;
  paymentIssue: "failed" | "expired" | "declined" | null;
  /** Injectable clock for tests; defaults to `new Date().toISOString()`. */
  now?: string;
};

type Candidate = { key: string; title: string; why: string };

/**
 * Priority-ordered: the first candidate pushed is the most urgent, and
 * `finish` marks exactly that one `primary: true`. A closed conversation
 * (resolved, or lost) short-circuits to a single task — nothing else is
 * "next" on a thread that is over.
 */
export function deriveTasks(input: DeriveTasksInput): DerivedTask[] {
  const now = input.now ?? new Date().toISOString();
  const candidates: Candidate[] = [];

  const closed = input.conversationState === "resolved" || input.opportunityState === "lost";
  if (closed) {
    candidates.push(
      input.opportunityState === "lost"
        ? { key: "closed", title: "Lost", why: "Marked as lost. Reopen if the client comes back." }
        : { key: "closed", title: "Resolved", why: "This conversation is resolved." },
    );
    return finish(candidates);
  }

  if (input.paymentIssue) {
    candidates.push({ key: "payment_issue", title: "Payment issue", why: paymentIssueWhy(input.paymentIssue) });
  }

  if (input.holdExpiresAt && input.holdExpiresAt < now) {
    candidates.push({
      key: "expired_hold",
      title: "Hold expired",
      why: "The held time or seat is no longer guaranteed. Offer a new time.",
    });
  }

  if (input.unanswered || input.conversationState === "needs_reply") {
    candidates.push({ key: "reply", title: "Reply to the client", why: "The client is waiting on a reply." });
  }

  const hasLiveHold = input.recordChips.some((chip) => chip.fulfilmentState === "hold");
  if (hasLiveHold && input.identityLevel === "none") {
    candidates.push({
      key: "confirm_identity",
      title: "Confirm who you're talking to",
      why: "A hold is in place but identity is not confirmed yet.",
    });
  }

  if (input.opportunityState === "awaiting_acceptance") {
    candidates.push({
      key: "await_offer",
      title: "Follow up on the offer",
      why: "The offer was sent and is awaiting the client's acceptance.",
    });
  }

  if (input.opportunityState === "accepted_awaiting_deposit") {
    candidates.push({
      key: "collect_deposit",
      title: "Collect the deposit",
      why: "The offer was accepted; a deposit has not been paid yet.",
    });
  }

  const preparingPaidOrder = input.recordChips.some(
    (chip) => chip.kind === "order" && chip.paymentState === "paid" && chip.fulfilmentState !== "fulfilled",
  );
  if (preparingPaidOrder) {
    candidates.push({ key: "prepare_order", title: "Prepare the order", why: "The order is paid and waiting to be prepared." });
  }

  if (input.balanceDueAt) {
    candidates.push({
      key: "collect_balance",
      title: "Collect the balance",
      why: `The remaining balance is due ${input.balanceDueAt < now ? "now" : "soon"}.`,
    });
  }

  if (input.reminderDueAt && input.reminderDueAt <= now) {
    candidates.push({ key: "send_reminder", title: "Send the reminder", why: "A scheduled reminder is due." });
  }

  if (input.talentConfirmationsPending > 0) {
    candidates.push({
      key: "confirm_talent",
      title: "Confirm with talent",
      why: `${input.talentConfirmationsPending} talent confirmation${input.talentConfirmationsPending === 1 ? "" : "s"} pending.`,
    });
  }

  if (candidates.length === 0) {
    candidates.push({ key: "all_clear", title: "Nothing to do", why: "No action is needed right now." });
  }

  return finish(candidates);
}

function finish(list: Candidate[]): DerivedTask[] {
  return list.map((task, i) => ({ ...task, primary: i === 0 }));
}

function paymentIssueWhy(kind: "failed" | "expired" | "declined"): string {
  if (kind === "failed") return "The last payment attempt failed.";
  if (kind === "expired") return "The payment link expired before it was paid.";
  return "The payment was declined.";
}
