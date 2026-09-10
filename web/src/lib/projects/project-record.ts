/**
 * project-record.ts — what a Project IS, and every judgement a Project screen
 * makes. PURE: no database, no clock, no Supabase client.
 *
 * WHY THE JUDGEMENTS ARE HERE AND NOT IN THE PAGE
 * ───────────────────────────────────────────────
 * Three rules on this surface are the sort that ship broken behind a green
 * build because the only way to exercise them is to render a page:
 *
 *   1. Collect is never the offered action while a milestone is waiting on the
 *      client. Money first is the natural ordering for a counter and the wrong
 *      one here: the client is being asked to pay for work they have not been
 *      allowed to look at yet.
 *   2. Close never appears as a bare button. A project with unapproved
 *      deliverables or an unpaid balance shows what is outstanding first.
 *   3. An amendment cannot be proposed while a version is already live with the
 *      client, because `inquiry_offers_one_active_offer` rejects the insert. A
 *      screen that offers the button and lets the database refuse turns a rule
 *      into a stack trace.
 *
 * Each of those is a function below with a test that breaks it on purpose.
 *
 * NO CLOCK. `nextProjectAction` and friends take only the record. Nothing here
 * derives a value from `Date.now()`, so the first render and the second render
 * of the same record are the same render.
 *
 * EVERY DATE ON THIS RECORD IS AN INSTANT, AND `timeZone` SAYS WHOSE CLOCK
 * READS IT. `startsAt`, `endsAt` and a milestone's `dueAt` are timestamptz.
 * Slicing the first ten characters off one of those gives the UTC calendar
 * date, which is a DIFFERENT DAY from the venue's for every job that starts
 * before dawn: a 2026-10-02T03:00Z call time is the evening of 2026-10-01 in
 * America/Mexico_City. The reader resolves one zone per project through
 * `pickTimezone` — the booking's own `timezone`, else the workspace's, else UTC
 * — and the screens render through it and name it.
 *
 * MONEY IS MINOR UNITS, ALWAYS. Every `…Cents` field on these types is minor
 * units of its own `currency`. `inquiry_offers` and `booking_talent` store
 * NUMERIC major units in the database; the reader converts once, on the way in,
 * with `minorUnitDivisor` — never here and never in a page.
 *
 * WHAT IS OWED IS THE ORDERS DESK'S ANSWER, IMPORTED. `isMoneyOwed` and
 * `outstandingCents` come from `lib/orders/orders-list.ts` and are not restated
 * here. Restating half of that rule is what this file shipped first: it summed
 * `total - collected` over EVERY attached order, so a cancelled order and a
 * draft quote were both counted as money to chase. On one project genuinely
 * owing 65000 minor units, a cancelled order took the reported figure to
 * 105000 and a draft to 112000. `ProjectBalance` therefore carries no
 * outstanding field of its own: the only way to get a number out of one is
 * `balanceOwedCents`, which asks the desk.
 */

import { isMoneyOwed, outstandingCents } from "@/lib/orders/orders-list";
import { utcToZonedYmd } from "@/lib/scheduling/tz";

/** `agency_bookings.status`. The commissioned job's own state. */
export type ProjectStatus =
  | "draft"
  | "tentative"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "archived";

/** `inquiry_offers.status`. An agreement version's state. */
export type AgreementStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "rejected"
  | "superseded"
  | "invalidated"
  | "expired";

/** `booking_deliverables.status`. */
export type MilestoneStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "revision_requested"
  | "cancelled";

export type MilestoneKind = "service" | "passthrough_budget";

/**
 * One version of the agreement. A new version SUPERSEDES its predecessor; the
 * predecessor row stays, which is the whole mechanism behind "prior version
 * kept".
 */
export type AgreementVersion = {
  readonly id: string;
  readonly version: number;
  readonly status: AgreementStatus;
  readonly totalClientCents: number;
  readonly coordinatorFeeCents: number;
  readonly currency: string;
  readonly sentAt: string | null;
  readonly acceptedAt: string | null;
  readonly notes: string | null;
};

/** One assigned professional's line: what they cost, what the client is charged. */
export type ProjectAssignment = {
  readonly id: string;
  readonly talentProfileId: string | null;
  /** The snapshot name. Kept when the person is replaced, which is the point. */
  readonly name: string;
  readonly roleLabel: string | null;
  readonly pricingUnit: string;
  readonly units: number;
  readonly talentCostCents: number;
  readonly clientChargeCents: number;
  readonly currency: string;
};

/**
 * A milestone / deliverable / revision round. One table, three words for it,
 * because `booking_deliverables` carries a `due_at` (the milestone), a `title`
 * and `status` (the deliverable) and a `revision` count against a limit.
 */
export type ProjectMilestone = {
  readonly id: string;
  readonly title: string;
  readonly kind: MilestoneKind;
  readonly status: MilestoneStatus;
  readonly revision: number;
  readonly revisionLimit: number;
  readonly dueAt: string | null;
};

/**
 * An order attached to this project.
 *
 * Deliberately NO outstanding field. `status`, `totalCents` and
 * `collectedCents` are exactly the three the orders desk decides on, and the
 * only way to turn them into money is `balanceOwedCents` below — so a screen
 * cannot read a figure that skipped the status half of the rule.
 */
export type ProjectBalance = {
  readonly orderId: string;
  readonly status: string;
  readonly currency: string;
  readonly totalCents: number;
  readonly collectedCents: number;
};

/**
 * Money owed on ONE attached order, by the orders desk's own rule.
 *
 * `isMoneyOwed` is the desk's: only an order awaiting payment is money owed.
 * A draft or a quote is not owed YET, a cancelled order is not a sale, and a
 * refunded one has already been unwound — its charge transitions `paid` ->
 * `refunded`, so `collectedCents` falls back to zero and the naive subtraction
 * would resurrect the whole total as a balance to chase.
 */
export function balanceOwedCents(balance: ProjectBalance): number {
  return isMoneyOwed(balance) ? outstandingCents(balance) : 0;
}

export type ProjectRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly title: string;
  readonly status: ProjectStatus;
  readonly currency: string;
  /** IANA zone every date on this record is READ IN. Never null: see the header. */
  readonly timeZone: string;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  /** The conversation this project came from. Null for a project opened directly. */
  readonly inquiryId: string | null;
  readonly clientName: string | null;
  /** `customers.id` — the record money hangs off. Null when nobody has paid yet. */
  readonly customerId: string | null;
  readonly agreements: readonly AgreementVersion[];
  readonly assignments: readonly ProjectAssignment[];
  readonly milestones: readonly ProjectMilestone[];
  readonly balances: readonly ProjectBalance[];
};

// ── Agreement ────────────────────────────────────────────────────────

/** Statuses `inquiry_offers_one_active_offer` treats as occupying the slot. */
const LIVE_AGREEMENT: readonly AgreementStatus[] = ["draft", "sent", "accepted"];

export function liveAgreement(project: ProjectRecord): AgreementVersion | null {
  const live = project.agreements.filter((a) => LIVE_AGREEMENT.includes(a.status));
  if (live.length === 0) return null;
  // Highest version wins. Two live rows cannot exist (the unique index), so
  // this is a tie-break that should never fire, not a policy.
  return live.reduce((best, a) => (a.version > best.version ? a : best));
}

export function acceptedAgreement(project: ProjectRecord): AgreementVersion | null {
  const accepted = project.agreements.filter((a) => a.status === "accepted");
  if (accepted.length === 0) return null;
  return accepted.reduce((best, a) => (a.version > best.version ? a : best));
}

/** Versions no longer in force, newest first. This is the history W46 shows. */
export function priorAgreements(project: ProjectRecord): AgreementVersion[] {
  return project.agreements
    .filter((a) => !LIVE_AGREEMENT.includes(a.status))
    .slice()
    .sort((a, b) => b.version - a.version);
}

export type AmendmentRefusal =
  | "nothing_to_amend"
  | "version_already_live"
  | "project_closed";

export type AmendmentVerdict =
  | { readonly ok: true; readonly fromVersion: number }
  | { readonly ok: false; readonly reason: AmendmentRefusal };

/**
 * May an amendment be proposed right now.
 *
 * THE DATABASE IS STRICTER THAN THE DESIGN. The spec cites an index called
 * `inquiry_offers_one_live_commercial` over `sent`/`accepted`. That index was
 * dropped in `20260520103600` and replaced by `inquiry_offers_one_active_offer`,
 * which covers `draft` TOO. So a half-written amendment already occupies the
 * slot, and offering the button because "nothing is sent yet" would produce a
 * unique-violation the operator cannot read.
 */
export function amendmentVerdict(project: ProjectRecord): AmendmentVerdict {
  if (project.status === "cancelled" || project.status === "archived") {
    return { ok: false, reason: "project_closed" };
  }
  const accepted = acceptedAgreement(project);
  if (!accepted) return { ok: false, reason: "nothing_to_amend" };
  const live = liveAgreement(project);
  if (live && live.status !== "accepted") {
    return { ok: false, reason: "version_already_live" };
  }
  return { ok: true, fromVersion: accepted.version };
}

// ── Milestones ───────────────────────────────────────────────────────

/** Waiting on the client to look at it. This is what outranks Collect. */
export function milestonesAwaitingApproval(project: ProjectRecord): ProjectMilestone[] {
  return project.milestones.filter((m) => m.status === "submitted");
}

/** Owed by the workspace: not delivered, not approved, not cancelled. */
export function milestonesOutstanding(project: ProjectRecord): ProjectMilestone[] {
  return project.milestones.filter(
    (m) => m.status === "draft" || m.status === "revision_requested",
  );
}

export type RevisionRefusal = "not_submitted" | "limit_reached";

export type RevisionVerdict =
  | { readonly ok: true; readonly roundsLeft: number }
  | { readonly ok: false; readonly reason: RevisionRefusal };

/**
 * May this milestone take another revision round without a new charge.
 *
 * Mirrors `requestRevision` in `lib/bookings/deliverables.ts` so the screen
 * refuses in words before the engine refuses in a reason code. The two must
 * agree; where they cannot, the ENGINE is right and this is the display of it.
 */
export function revisionVerdict(milestone: ProjectMilestone): RevisionVerdict {
  if (milestone.status !== "submitted") return { ok: false, reason: "not_submitted" };
  if (milestone.revision >= milestone.revisionLimit) {
    return { ok: false, reason: "limit_reached" };
  }
  return { ok: true, roundsLeft: milestone.revisionLimit - milestone.revision };
}

// ── Money ────────────────────────────────────────────────────────────

/**
 * A figure that is not available, told apart from a figure that is zero.
 *
 * Earned is the one this exists for. Nothing in the schema attaches an amount
 * to a milestone — `booking_deliverables` has a title, a status and a revision
 * count and no money column at all — so "how much of the quote has been earned"
 * cannot be answered from these tables. A zero there would read as "nothing
 * earned yet", which is a different and false claim.
 */
export type ProjectAmount =
  | { readonly known: true; readonly cents: number }
  | { readonly known: false; readonly reason: "not_recorded" | "not_agreed" };

export type ProjectMoney = {
  readonly currency: string;
  /** What the client agreed to pay. Unknown until a version is accepted. */
  readonly quoted: ProjectAmount;
  /** The live proposal when nothing is accepted yet — a proposal, not a commitment. */
  readonly proposedCents: number | null;
  /** What the assigned professionals are owed, from their own cost lines. */
  readonly payable: ProjectAmount;
  /** Of the quote, how much has been delivered and approved. Not derivable. */
  readonly earned: ProjectAmount;
  /**
   * Owed on the orders attached to this project, by `balanceOwedCents`. An
   * order that is a draft, a quote, cancelled or refunded contributes nothing.
   */
  readonly dueCents: number;
  /** What has actually landed: the sum of PAID transactions on those orders. */
  readonly collectedCents: number;
  /**
   * True when the attached orders are not all in the project's currency. The
   * totals then add different minor units together and must not be shown.
   */
  readonly mixedCurrency: boolean;
};

export function projectMoney(project: ProjectRecord): ProjectMoney {
  const accepted = acceptedAgreement(project);
  const live = liveAgreement(project);

  const currencies = new Set<string>([
    project.currency,
    ...project.balances.map((b) => b.currency),
  ]);
  const mixedCurrency = currencies.size > 1;

  const dueCents = project.balances.reduce((sum, b) => sum + balanceOwedCents(b), 0);
  const collectedCents = project.balances.reduce((sum, b) => sum + b.collectedCents, 0);

  const payableCents = project.assignments.reduce((sum, a) => sum + a.talentCostCents, 0);

  return {
    currency: project.currency,
    quoted: accepted
      ? { known: true, cents: accepted.totalClientCents }
      : { known: false, reason: "not_agreed" },
    proposedCents: !accepted && live ? live.totalClientCents : null,
    payable:
      project.assignments.length > 0
        ? { known: true, cents: payableCents }
        : { known: false, reason: "not_recorded" },
    // Deliberately never a number. See ProjectAmount above.
    earned: { known: false, reason: "not_recorded" },
    dueCents,
    collectedCents,
    mixedCurrency,
  };
}

// ── Closing ──────────────────────────────────────────────────────────

export type CloseBlocker =
  | { readonly kind: "milestone"; readonly milestoneId: string; readonly title: string; readonly status: MilestoneStatus }
  | { readonly kind: "money"; readonly owedCents: number; readonly currency: string }
  | { readonly kind: "already_closed"; readonly status: ProjectStatus };

export type CloseReadiness = {
  readonly closable: boolean;
  readonly blockers: readonly CloseBlocker[];
};

/**
 * What stands between this project and being closed.
 *
 * Never returns a bare yes/no without the list: the screen is required to show
 * the outstanding items rather than a Close button that silently does something
 * larger than the operator expects.
 */
export function closeReadiness(project: ProjectRecord): CloseReadiness {
  const blockers: CloseBlocker[] = [];
  if (project.status === "cancelled" || project.status === "archived" || project.status === "completed") {
    blockers.push({ kind: "already_closed", status: project.status });
    return { closable: false, blockers };
  }
  for (const m of project.milestones) {
    if (m.status === "approved" || m.status === "cancelled") continue;
    blockers.push({ kind: "milestone", milestoneId: m.id, title: m.title, status: m.status });
  }
  const money = projectMoney(project);
  if (money.dueCents > 0) {
    blockers.push({ kind: "money", owedCents: money.dueCents, currency: money.currency });
  }
  return { closable: blockers.length === 0, blockers };
}

// ── The one next action ──────────────────────────────────────────────

export type ProjectActionId =
  | "draft_agreement"
  | "send_agreement"
  | "await_client"
  | "assign_team"
  | "review_milestone"
  | "chase_milestone"
  | "collect_balance"
  | "close_project"
  | "nothing";

export type ProjectAction = {
  readonly id: ProjectActionId;
  /** The milestone the action is about, when it is about one. */
  readonly milestoneId?: string;
  /**
   * Why an action that would otherwise be offered is not. Present only when
   * something WAS suppressed, so the screen can say so instead of the operator
   * wondering where Collect went.
   */
  readonly suppressed?: "collect_blocked_by_approval";
};

/**
 * The single primary action for this project. One, never a row of equals.
 *
 * ORDER IS THE RULE. Review outranks Collect unconditionally: a client asked to
 * settle a balance for work they have not been shown is being asked to pay for
 * something they cannot check. When that suppression happens the verdict says
 * so, so the panel can explain the absence.
 */
export function nextProjectAction(project: ProjectRecord): ProjectAction {
  if (project.status === "cancelled" || project.status === "archived") {
    return { id: "nothing" };
  }

  const awaiting = milestonesAwaitingApproval(project);
  const money = projectMoney(project);

  // 1 — a milestone is with the client. Nothing else is offered.
  if (awaiting.length > 0) {
    return {
      id: "review_milestone",
      milestoneId: awaiting[0]!.id,
      ...(money.dueCents > 0 ? { suppressed: "collect_blocked_by_approval" as const } : {}),
    };
  }

  // 2 — the agreement is not settled yet.
  const live = liveAgreement(project);
  const accepted = acceptedAgreement(project);
  if (!accepted) {
    if (!live) return { id: "draft_agreement" };
    if (live.status === "draft") return { id: "send_agreement" };
    return { id: "await_client" };
  }

  // 3 — agreed, but nobody is doing it.
  if (project.assignments.length === 0) return { id: "assign_team" };

  // 4 — money owed, with nothing waiting on the client.
  if (money.dueCents > 0) return { id: "collect_balance" };

  // 5 — work still owed by us.
  const outstanding = milestonesOutstanding(project);
  if (outstanding.length > 0) {
    return { id: "chase_milestone", milestoneId: outstanding[0]!.id };
  }

  // 6 — nothing outstanding either way.
  return closeReadiness(project).closable ? { id: "close_project" } : { id: "nothing" };
}

// ── Who sees what ────────────────────────────────────────────────────

export type VisibilityAudience = "staff" | "assigned_professional" | "client";

export type VisibilityRow = {
  readonly audience: VisibilityAudience;
  readonly seesMilestones: boolean;
  /** The workspace's own margin: charge minus cost. Staff only, always. */
  readonly seesMargin: boolean;
  /** Only their own fee line, never the other professionals' rates. */
  readonly seesOwnFeeOnly: boolean;
  readonly seesClientOtherPurchases: boolean;
};

/**
 * The visibility rule this project runs under.
 *
 * DERIVED, NOT STORED. There is no per-project visibility table: assignment
 * access is a scoped grant off `booking_talent` and staff access is the general
 * Access model on `agency_memberships`. The screen states the rule it is
 * actually under rather than implying a per-project override exists.
 */
export function visibilityRows(): readonly VisibilityRow[] {
  return [
    {
      audience: "staff",
      seesMilestones: true,
      seesMargin: true,
      seesOwnFeeOnly: false,
      seesClientOtherPurchases: true,
    },
    {
      audience: "assigned_professional",
      seesMilestones: true,
      seesMargin: false,
      seesOwnFeeOnly: true,
      seesClientOtherPurchases: false,
    },
    {
      audience: "client",
      seesMilestones: true,
      seesMargin: false,
      seesOwnFeeOnly: false,
      seesClientOtherPurchases: false,
    },
  ];
}

// ── The list ─────────────────────────────────────────────────────────

export type ProjectListFilter = "all" | "open" | "awaiting_approval" | "owed" | "closed";

export type ProjectListRow = {
  readonly id: string;
  readonly title: string;
  readonly status: ProjectStatus;
  readonly clientName: string | null;
  readonly customerId: string | null;
  readonly timeZone: string;
  readonly startsAt: string | null;
  readonly currency: string;
  readonly dueCents: number;
  readonly awaitingApprovalCount: number;
  readonly assignmentCount: number;
  readonly action: ProjectActionId;
};

const CLOSED_STATUSES: readonly ProjectStatus[] = ["completed", "cancelled", "archived"];

export function projectListRow(project: ProjectRecord): ProjectListRow {
  const money = projectMoney(project);
  return {
    id: project.id,
    title: project.title,
    status: project.status,
    clientName: project.clientName,
    customerId: project.customerId,
    timeZone: project.timeZone,
    startsAt: project.startsAt,
    currency: project.currency,
    dueCents: money.dueCents,
    awaitingApprovalCount: milestonesAwaitingApproval(project).length,
    assignmentCount: project.assignments.length,
    action: nextProjectAction(project).id,
  };
}

/**
 * An ISO instant as the calendar date IN `timeZone` — the venue's clock.
 *
 * NOT `value.slice(0, 10)`, which is what the Projects screens did first. That
 * is the UTC calendar date, and it is a different day from the venue's for every instant
 * on the far side of the workspace's offset: 2026-10-02T03:00:00Z is the
 * evening of Thursday 1 October in America/Mexico_City and was shown as Friday
 * the 2nd. A call sheet a day out is a crew that misses a job.
 *
 * It lives in this module rather than beside the markup so a lane can exercise
 * it: which DAY a stored instant falls on is a judgement, not presentation.
 *
 * The zone is REQUIRED, not defaulted, so a caller cannot render a date here
 * without having decided whose clock it is on. An unparseable instant or an
 * invalid zone falls back to the caller's own sentence rather than to UTC,
 * because a date in the wrong zone is worse than no date.
 */
export function zonedDate(value: string | null, timeZone: string, fallback: string): string {
  if (!value) return fallback;
  return utcToZonedYmd(new Date(value), timeZone) ?? fallback;
}

/**
 * The one zone a set of dates is read in, or `null` when they differ.
 *
 * Same shape as `OrderListTotals.currency` on the Orders desk, and for the same
 * reason: a single note under a table saying "dates are in America/Mexico_City"
 * is a confident lie the moment one row is a job in Madrid. `null` tells the
 * screen to name the zone on each row instead of once at the bottom.
 */
export function commonTimeZone(zones: readonly string[]): string | null {
  const distinct = new Set(zones.filter((z) => z.length > 0));
  return distinct.size === 1 ? [...distinct][0]! : null;
}

export function filterProjectRows(
  rows: readonly ProjectListRow[],
  filter: ProjectListFilter,
): ProjectListRow[] {
  switch (filter) {
    case "open":
      return rows.filter((r) => !CLOSED_STATUSES.includes(r.status));
    case "awaiting_approval":
      return rows.filter((r) => r.awaitingApprovalCount > 0);
    case "owed":
      return rows.filter((r) => r.dueCents > 0);
    case "closed":
      return rows.filter((r) => CLOSED_STATUSES.includes(r.status));
    default:
      return [...rows];
  }
}

// ── A counter sale is not a project ──────────────────────────────────

/**
 * A counter sale wearing a booking's clothes. See the module header.
 *
 * Applied in TypeScript rather than as a PostgREST filter on purpose: the rule
 * is two columns and a null, PostgREST spells that as a nested `or(...)` that
 * nobody can read, and this way the one definition of "is a project" is a named
 * function a test can call.
 */
export function isOrderShellBooking(row: {
  order_id: string | null;
  source_inquiry_id: string | null;
  calendar_lane: string | null;
}): boolean {
  if (row.calendar_lane === "order") return true;
  return row.order_id !== null && row.source_inquiry_id === null;
}
