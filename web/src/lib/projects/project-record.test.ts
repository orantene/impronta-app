import { test } from "node:test";
import assert from "node:assert/strict";

import {
  acceptedAgreement,
  amendmentVerdict,
  closeReadiness,
  filterProjectRows,
  liveAgreement,
  milestonesAwaitingApproval,
  nextProjectAction,
  priorAgreements,
  projectListRow,
  projectMoney,
  balanceOwedCents,
  commonTimeZone,
  zonedDate,
  revisionVerdict,
  visibilityRows,
  type AgreementVersion,
  type ProjectAssignment,
  type ProjectBalance,
  type ProjectMilestone,
  isOrderShellBooking,
  type ProjectRecord,
} from "./project-record";

function agreement(over: Partial<AgreementVersion> = {}): AgreementVersion {
  return {
    id: "offer-1",
    version: 1,
    status: "accepted",
    totalClientCents: 80000,
    coordinatorFeeCents: 10000,
    currency: "USD",
    sentAt: "2026-09-01T00:00:00Z",
    acceptedAt: "2026-09-02T00:00:00Z",
    notes: null,
    ...over,
  };
}

function assignment(over: Partial<ProjectAssignment> = {}): ProjectAssignment {
  return {
    id: "bt-1",
    talentProfileId: "tp-1",
    name: "Ana Ruiz",
    roleLabel: "Model",
    pricingUnit: "day",
    units: 1,
    talentCostCents: 30000,
    clientChargeCents: 50000,
    currency: "USD",
    ...over,
  };
}

function milestone(over: Partial<ProjectMilestone> = {}): ProjectMilestone {
  return {
    id: "d-1",
    title: "First edit",
    kind: "service",
    status: "draft",
    revision: 0,
    revisionLimit: 1,
    dueAt: null,
    amountCents: 0,
    filePath: null,
    ...over,
  };
}

function balance(over: Partial<ProjectBalance> = {}): ProjectBalance {
  return {
    orderId: "o-1",
    status: "pending_payment",
    currency: "USD",
    totalCents: 80000,
    collectedCents: 0,
    ...over,
  };
}

function project(over: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: "p-1",
    tenantId: "t-1",
    title: "Autumn campaign",
    status: "confirmed",
    currency: "USD",
    timeZone: "America/Mexico_City",
    startsAt: "2026-10-01T09:00:00Z",
    endsAt: "2026-10-01T18:00:00Z",
    inquiryId: "i-1",
    inquiryVersion: 1,
    clientName: "Casa Verde",
    customerId: "c-1",
    agreements: [agreement()],
    assignments: [assignment()],
    milestones: [],
    balances: [],
    ...over,
  };
}

// ── THE RULE: Collect never outranks an approval ─────────────────────

test("COLLECT IS NOT OFFERED WHILE A MILESTONE IS WITH THE CLIENT", () => {
  // The failing shape: money IS owed, so every money-first instinct says
  // Collect. A submitted deliverable means the client has not been allowed to
  // look at the work yet.
  const waiting = project({
    milestones: [milestone({ status: "submitted" })],
    balances: [balance()],
  });
  const action = nextProjectAction(waiting);
  assert.equal(action.id, "review_milestone");
  assert.notEqual(action.id, "collect_balance");
  assert.equal(action.milestoneId, "d-1");
  // And the panel is told WHY Collect is missing, so its absence is explained
  // rather than looking like a bug.
  assert.equal(action.suppressed, "collect_blocked_by_approval");
});

test("the same project collects the moment the milestone is approved", () => {
  // The positive control. Without this the assertion above would still pass if
  // Collect were never offered at all.
  const approved = project({
    milestones: [milestone({ status: "approved" })],
    balances: [balance()],
  });
  const action = nextProjectAction(approved);
  assert.equal(action.id, "collect_balance");
  assert.equal(action.suppressed, undefined);
});

test("suppression is reported only when something was actually suppressed", () => {
  const noMoney = project({ milestones: [milestone({ status: "submitted" })], balances: [] });
  const action = nextProjectAction(noMoney);
  assert.equal(action.id, "review_milestone");
  assert.equal(action.suppressed, undefined, "nothing was owed, so nothing was suppressed");
});

test("the next action walks the agreement before it walks the work", () => {
  assert.equal(nextProjectAction(project({ agreements: [] })).id, "draft_agreement");
  assert.equal(
    nextProjectAction(project({ agreements: [agreement({ status: "draft", acceptedAt: null })] })).id,
    "send_agreement",
  );
  assert.equal(
    nextProjectAction(project({ agreements: [agreement({ status: "sent", acceptedAt: null })] })).id,
    "await_client",
  );
  assert.equal(nextProjectAction(project({ assignments: [] })).id, "assign_team");
  assert.equal(
    nextProjectAction(project({ milestones: [milestone({ status: "revision_requested" })] })).id,
    "chase_milestone",
  );
  assert.equal(nextProjectAction(project()).id, "close_project");
  assert.equal(nextProjectAction(project({ status: "cancelled" })).id, "nothing");
});

// ── THE RULE: an amendment cannot jump a live version ────────────────

test("AN AMENDMENT IS REFUSED WHILE ANY VERSION IS LIVE, DRAFT INCLUDED", () => {
  // `inquiry_offers_one_active_offer` covers draft, sent AND accepted. A
  // half-written amendment already occupies the slot, so offering the button
  // because "nothing is sent yet" produces a unique violation on save.
  const withDraft = project({
    agreements: [agreement({ version: 1, status: "superseded" }), agreement({ id: "offer-2", version: 2, status: "accepted" })],
  });
  assert.deepEqual(amendmentVerdict(withDraft), { ok: true, fromVersion: 2 });

  const draftPending = project({
    agreements: [
      agreement({ id: "offer-1", version: 1, status: "accepted" }),
      agreement({ id: "offer-2", version: 2, status: "draft", acceptedAt: null }),
    ],
  });
  assert.deepEqual(draftPending.agreements.length, 2);
  assert.deepEqual(amendmentVerdict(draftPending), {
    ok: false,
    reason: "version_already_live",
  });

  const sentPending = project({
    agreements: [
      agreement({ id: "offer-1", version: 1, status: "accepted" }),
      agreement({ id: "offer-2", version: 2, status: "sent", acceptedAt: null }),
    ],
  });
  assert.deepEqual(amendmentVerdict(sentPending), { ok: false, reason: "version_already_live" });
});

test("there is nothing to amend before anything was accepted", () => {
  assert.deepEqual(amendmentVerdict(project({ agreements: [] })), {
    ok: false,
    reason: "nothing_to_amend",
  });
  assert.deepEqual(
    amendmentVerdict(project({ agreements: [agreement({ status: "sent", acceptedAt: null })] })),
    { ok: false, reason: "nothing_to_amend" },
  );
  assert.deepEqual(amendmentVerdict(project({ status: "archived" })), {
    ok: false,
    reason: "project_closed",
  });
});

test("a superseded version is kept and readable, never overwritten", () => {
  const amended = project({
    agreements: [
      agreement({ id: "offer-1", version: 1, status: "superseded", totalClientCents: 80000 }),
      agreement({ id: "offer-2", version: 2, status: "accepted", totalClientCents: 95000 }),
    ],
  });
  assert.equal(liveAgreement(amended)?.id, "offer-2");
  assert.equal(acceptedAgreement(amended)?.totalClientCents, 95000);
  const prior = priorAgreements(amended);
  assert.equal(prior.length, 1);
  assert.equal(prior[0]?.version, 1);
  assert.equal(prior[0]?.totalClientCents, 80000, "the original terms are still identifiable");
});

// ── THE RULE: a revision past the limit is refused, not free ─────────

test("A SECOND REVISION PAST THE LIMIT IS REFUSED, NOT SILENTLY GRANTED", () => {
  const first = milestone({ status: "submitted", revision: 0, revisionLimit: 1 });
  assert.deepEqual(revisionVerdict(first), { ok: true, roundsLeft: 1 });
  const spent = milestone({ status: "submitted", revision: 1, revisionLimit: 1 });
  assert.deepEqual(revisionVerdict(spent), { ok: false, reason: "limit_reached" });
  const notSubmitted = milestone({ status: "draft", revision: 0, revisionLimit: 1 });
  assert.deepEqual(revisionVerdict(notSubmitted), { ok: false, reason: "not_submitted" });
});

// ── THE RULE: close shows what is outstanding ────────────────────────

test("CLOSING NAMES EVERY OUTSTANDING ITEM, NEVER A BARE BUTTON", () => {
  const messy = project({
    milestones: [
      milestone({ id: "d-1", status: "submitted", title: "First edit" }),
      milestone({ id: "d-2", status: "approved", title: "Contact sheet" }),
      milestone({ id: "d-3", status: "cancelled", title: "Dropped look" }),
    ],
    balances: [balance({ totalCents: 25000 })],
  });
  const readiness = closeReadiness(messy);
  assert.equal(readiness.closable, false);
  assert.deepEqual(
    readiness.blockers.map((b) => b.kind),
    ["milestone", "money"],
    "approved and cancelled milestones are not blockers; the submitted one is",
  );
  const money = readiness.blockers.find((b) => b.kind === "money");
  assert.equal(money?.kind === "money" && money.owedCents, 25000);

  const clean = project({ milestones: [milestone({ status: "approved" })], balances: [] });
  assert.equal(closeReadiness(clean).closable, true);
  assert.deepEqual(closeReadiness(clean).blockers, []);

  const done = project({ status: "completed" });
  assert.equal(closeReadiness(done).closable, false);
  assert.equal(closeReadiness(done).blockers[0]?.kind, "already_closed");
});

// ── THE RULE: an unknowable figure is not zero ───────────────────────

test("EARNED IS REPORTED AS NOT RECORDED, NEVER AS ZERO", () => {
  // No table attaches money to a milestone, so "how much is earned" has no
  // answer here. Zero would read as "nothing earned yet", a different claim.
  const money = projectMoney(
    project({ milestones: [milestone({ status: "approved" })], balances: [balance()] }),
  );
  assert.equal(money.earned.known, false);
  assert.equal(money.earned.known === false && money.earned.reason, "not_recorded");
});

test("quote, payable and due are three different reads, and an unagreed quote says so", () => {
  const agreed = projectMoney(
    project({
      agreements: [agreement({ totalClientCents: 80000 })],
      assignments: [assignment({ talentCostCents: 30000 }), assignment({ id: "bt-2", talentCostCents: 20000 })],
      balances: [balance({ totalCents: 80000, collectedCents: 30000 })],
    }),
  );
  assert.deepEqual(agreed.quoted, { known: true, cents: 80000 });
  assert.deepEqual(agreed.payable, { known: true, cents: 50000 });
  assert.equal(agreed.dueCents, 50000);
  assert.equal(agreed.collectedCents, 30000);
  assert.equal(agreed.proposedCents, null);

  const proposed = projectMoney(
    project({ agreements: [agreement({ status: "sent", acceptedAt: null, totalClientCents: 90000 })] }),
  );
  assert.equal(proposed.quoted.known, false);
  assert.equal(proposed.quoted.known === false && proposed.quoted.reason, "not_agreed");
  assert.equal(proposed.proposedCents, 90000, "the live proposal is shown AS a proposal");
});

test("two currencies on one project are flagged instead of added together", () => {
  const mixed = projectMoney(
    project({
      currency: "USD",
      balances: [balance({ currency: "USD" }), balance({ orderId: "o-2", currency: "ARS" })],
    }),
  );
  assert.equal(mixed.mixedCurrency, true);
  const single = projectMoney(project({ balances: [balance()] }));
  assert.equal(single.mixedCurrency, false);
});

// ── THE RULE: only an order awaiting payment is money owed ───────────

test("MONEY OWED COUNTS ONLY WHAT SOMEBODY OWES, NOT EVERY ATTACHED ORDER", () => {
  // The sequence that was reproduced against the isolated branch. Each step
  // adds one order to a project that genuinely owes 65000, and the reported
  // figure must not move.
  const owing = balance({ orderId: "o-owed", status: "pending_payment", totalCents: 65000 });
  assert.equal(projectMoney(project({ balances: [owing] })).dueCents, 65000);

  const cancelled = balance({ orderId: "o-void", status: "cancelled", totalCents: 40000 });
  assert.equal(
    projectMoney(project({ balances: [owing, cancelled] })).dueCents,
    65000,
    "a cancelled order is not a sale; it took the figure to 105000",
  );

  const draft = balance({ orderId: "o-draft", status: "draft", totalCents: 7000 });
  assert.equal(
    projectMoney(project({ balances: [owing, cancelled, draft] })).dueCents,
    65000,
    "a cart is not a debt; it took the figure to 112000",
  );

  const quoted = balance({ orderId: "o-quote", status: "quoted", totalCents: 12000 });
  assert.equal(
    projectMoney(project({ balances: [owing, cancelled, draft, quoted] })).dueCents,
    65000,
    "a quote awaiting the client's word is not owed yet",
  );

  // A refunded order is the worst of them: the charge transitions paid ->
  // refunded, so collected reads zero and total - collected resurrects the
  // whole amount as a balance to chase.
  const refunded = balance({
    orderId: "o-back",
    status: "refunded",
    totalCents: 30000,
    collectedCents: 0,
  });
  const all = project({ balances: [owing, cancelled, draft, quoted, refunded] });
  assert.equal(projectMoney(all).dueCents, 65000, "refunded money is not owed again");
  assert.equal(balanceOwedCents(refunded), 0);
  assert.equal(balanceOwedCents(cancelled), 0);
  assert.equal(balanceOwedCents(owing), 65000);
});

test("every screen that spends the due figure spends the same one", () => {
  // One project whose ONLY unsettled order is cancelled. Nothing here may
  // behave as though money is owed.
  const nothingOwed = project({
    agreements: [agreement()],
    assignments: [assignment()],
    balances: [balance({ orderId: "o-void", status: "cancelled", totalCents: 40000 })],
  });

  assert.equal(projectMoney(nothingOwed).dueCents, 0, "the Money tab");
  assert.equal(projectListRow(nothingOwed).dueCents, 0, "the list column");
  assert.equal(
    filterProjectRows([projectListRow(nothingOwed)], "owed").length,
    0,
    "the money-owed filter",
  );
  assert.deepEqual(closeReadiness(nothingOwed).blockers, [], "the close screen");
  assert.equal(closeReadiness(nothingOwed).closable, true);
  assert.equal(
    nextProjectAction(nothingOwed).id,
    "close_project",
    "the next action must not say collect a balance nobody owes",
  );
});

test("what is owed on an order awaiting payment is the REMAINDER, never its total", () => {
  const part = balance({ status: "pending_payment", totalCents: 80000, collectedCents: 30000 });
  assert.equal(balanceOwedCents(part), 50000, "a deposit already taken is not owed twice");

  // Fully collected and OVER-collected both owe nothing: an over-collection is
  // a refund to arrange, not a debt of minus ten thousand.
  assert.equal(balanceOwedCents(balance({ totalCents: 80000, collectedCents: 80000 })), 0);
  assert.equal(balanceOwedCents(balance({ totalCents: 80000, collectedCents: 90000 })), 0);

  // A complimentary place enters pending_payment at zero. Settled, not overdue.
  assert.equal(balanceOwedCents(balance({ totalCents: 0, collectedCents: 0 })), 0);
});

// ── The list ─────────────────────────────────────────────────────────

test("a list row carries the same verdict the record does", () => {
  const waiting = project({
    milestones: [milestone({ status: "submitted" })],
    balances: [balance()],
  });
  const row = projectListRow(waiting);
  assert.equal(row.action, "review_milestone");
  assert.equal(row.awaitingApprovalCount, 1);
  assert.equal(row.dueCents, 80000);
  assert.equal(milestonesAwaitingApproval(waiting).length, 1);
});

test("filters select on the fact, not on a label", () => {
  const rows = [
    projectListRow(project({ id: "a", balances: [balance()] })),
    projectListRow(project({ id: "b", milestones: [milestone({ status: "submitted" })] })),
    projectListRow(project({ id: "c", status: "completed" })),
  ];
  assert.deepEqual(filterProjectRows(rows, "owed").map((r) => r.id), ["a"]);
  assert.deepEqual(filterProjectRows(rows, "awaiting_approval").map((r) => r.id), ["b"]);
  assert.deepEqual(filterProjectRows(rows, "closed").map((r) => r.id), ["c"]);
  assert.deepEqual(filterProjectRows(rows, "open").map((r) => r.id), ["a", "b"]);
  assert.equal(filterProjectRows(rows, "all").length, 3);
});

// ── Whose clock ──────────────────────────────────────────────────────

test("A CALL TIME BEFORE DAWN IS THE PREVIOUS EVENING AT THE VENUE, NOT TODAY", () => {
  // The whole point. 03:00 UTC on 2 October is 21:00 on 1 October in Mexico
  // City, so a screen that slices the ISO string shows the crew the wrong day.
  const instant = "2026-10-02T03:00:00Z";
  assert.equal(instant.slice(0, 10), "2026-10-02", "what the naive slice gave");
  assert.equal(zonedDate(instant, "America/Mexico_City", "-"), "2026-10-01");

  // The same instant is already the 2nd in Madrid: the answer depends on the
  // zone, which is exactly why the parameter is required.
  assert.equal(zonedDate(instant, "Europe/Madrid", "-"), "2026-10-02");
  assert.equal(zonedDate(instant, "UTC", "-"), "2026-10-02");

  // Absence and nonsense both reach the caller's own sentence. A date rendered
  // in the wrong zone would be worse than no date.
  assert.equal(zonedDate(null, "America/Mexico_City", "No date"), "No date");
  assert.equal(zonedDate("not-a-date", "America/Mexico_City", "No date"), "No date");
  assert.equal(zonedDate(instant, "Mars/Olympus_Mons", "No date"), "No date");
});

test("A DATE IS READ IN THE JOB'S ZONE, AND THE LIST SAYS WHOSE WHEN THEY DIFFER", () => {
  // One zone across the visible rows: the screen can name it once.
  const rows = [
    projectListRow(project({ id: "a" })),
    projectListRow(project({ id: "b" })),
  ];
  assert.equal(commonTimeZone(rows.map((r) => r.timeZone)), "America/Mexico_City");

  // A job in Madrid alongside one in Mexico City: there is NO single zone, and
  // a note claiming one would be wrong on half the rows.
  const spread = [
    ...rows,
    projectListRow(project({ id: "c", timeZone: "Europe/Madrid" })),
  ];
  assert.equal(commonTimeZone(spread.map((r) => r.timeZone)), null);

  assert.equal(commonTimeZone([]), null, "nothing to name is not a zone either");

  // The row carries its own zone through, so the screen never has to guess.
  assert.equal(spread[2]!.timeZone, "Europe/Madrid");
});

// ── Who sees what ────────────────────────────────────────────────────

test("an assigned professional never sees the workspace's margin", () => {
  const rows = visibilityRows();
  const pro = rows.find((r) => r.audience === "assigned_professional");
  assert.ok(pro);
  assert.equal(pro.seesMargin, false);
  assert.equal(pro.seesOwnFeeOnly, true);
  assert.equal(pro.seesClientOtherPurchases, false);
  const staff = rows.find((r) => r.audience === "staff");
  assert.equal(staff?.seesMargin, true, "the positive control: someone can see it");
  const client = rows.find((r) => r.audience === "client");
  assert.equal(client?.seesMargin, false);
});

// ── A counter sale is not a project ──────────────────────────────────

test("A POS ORDER SHELL IS NOT LISTED AS A COMMISSIONED PROJECT", () => {
  // Every paid order mints one `agency_bookings` row so a transaction has a
  // booking to point at. Listing those would bury the projects under the day's
  // coffees.
  assert.equal(
    isOrderShellBooking({ order_id: "o-1", source_inquiry_id: null, calendar_lane: null }),
    true,
  );
  assert.equal(
    isOrderShellBooking({ order_id: null, source_inquiry_id: null, calendar_lane: "order" }),
    true,
  );
  // A commissioned job that later had an order attached is still a project.
  assert.equal(
    isOrderShellBooking({ order_id: "o-1", source_inquiry_id: "i-1", calendar_lane: null }),
    false,
  );
  assert.equal(
    isOrderShellBooking({ order_id: null, source_inquiry_id: "i-1", calendar_lane: null }),
    false,
  );
  assert.equal(
    isOrderShellBooking({ order_id: null, source_inquiry_id: null, calendar_lane: null }),
    false,
  );
  // A shell whose order was deleted keeps only the shell writer's title.
  assert.equal(
    isOrderShellBooking({ order_id: null, source_inquiry_id: null, calendar_lane: null, title: "POS sale" }),
    true,
  );
  assert.equal(
    isOrderShellBooking({ order_id: null, source_inquiry_id: null, calendar_lane: null, title: "Brand shoot" }),
    false,
  );
});
