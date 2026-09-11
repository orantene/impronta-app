import { test } from "node:test";
import assert from "node:assert/strict";

import type {
  AgreementVersion,
  ProjectBalance,
  ProjectMilestone,
  ProjectRecord,
} from "@/lib/projects/project-record";
import {
  collectAmount,
  collectVerdict,
  collectableBalance,
  findProjects,
  normaliseReceiptCode,
  projectsModeRow,
} from "./projects-mode-model";

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
    title: "Sleeve tattoo",
    status: "confirmed",
    currency: "USD",
    timeZone: "America/Mexico_City",
    startsAt: "2026-10-02T03:00:00Z",
    endsAt: null,
    inquiryId: "i-1",
    inquiryVersion: 1,
    clientName: "Sofía Ramírez",
    customerId: "c-1",
    agreements: [agreement()],
    assignments: [],
    milestones: [],
    balances: [balance()],
    ...over,
  };
}

// ── The collect gate ─────────────────────────────────────────────────

test("an accepted agreement with an owed order is collectable against that order", () => {
  const v = collectVerdict(project());
  assert.equal(v.ok, true);
  if (v.ok) {
    assert.equal(v.orderId, "o-1");
    assert.equal(v.outstandingCents, 80000);
    assert.equal(v.currency, "USD");
  }
});

test("a cancelled order moves the collectable balance to nothing (the desk's rule, not total minus collected)", () => {
  const v = collectVerdict(project({ balances: [balance({ status: "cancelled" })] }));
  assert.deepEqual(v, { ok: false, reason: "nothing_owed" });
});

test("a draft order is not owed yet and does not offer Collect", () => {
  const v = collectVerdict(project({ balances: [balance({ status: "draft" })] }));
  assert.deepEqual(v, { ok: false, reason: "nothing_owed" });
});

test("a cancelled order beside an owed one does not change the figure", () => {
  const v = collectVerdict(
    project({
      balances: [balance(), balance({ orderId: "o-2", status: "cancelled", totalCents: 50000 })],
    }),
  );
  assert.equal(v.ok, true);
  if (v.ok) assert.equal(v.outstandingCents, 80000);
});

test("a deposit already collected lowers what is outstanding", () => {
  const v = collectVerdict(project({ balances: [balance({ collectedCents: 30000 })] }));
  assert.equal(v.ok, true);
  if (v.ok) assert.equal(v.outstandingCents, 50000);
});

test("Collect is refused while a deliverable is waiting on the client, even with money owed", () => {
  const v = collectVerdict(project({ milestones: [milestone({ status: "submitted" })] }));
  assert.deepEqual(v, { ok: false, reason: "milestone_awaiting" });
});

test("Collect is refused while an AMENDMENT is waiting on the client on top of an accepted version", () => {
  const v = collectVerdict(
    project({
      agreements: [
        agreement({ status: "superseded" }),
        agreement({ id: "offer-2", version: 2, status: "accepted" }),
        agreement({ id: "offer-3", version: 3, status: "sent", acceptedAt: null }),
      ],
    }),
  );
  assert.deepEqual(v, { ok: false, reason: "agreement_awaiting" });
});

test("Collect is refused while the original offer is still out (nothing accepted)", () => {
  const v = collectVerdict(
    project({ agreements: [agreement({ status: "sent", acceptedAt: null })] }),
  );
  assert.deepEqual(v, { ok: false, reason: "agreement_awaiting" });
});

test("a drafted amendment blocks Collect too: the database's one-active-offer index counts drafts", () => {
  const v = collectVerdict(
    project({
      agreements: [agreement(), agreement({ id: "offer-2", version: 2, status: "draft", acceptedAt: null })],
    }),
  );
  assert.deepEqual(v, { ok: false, reason: "agreement_awaiting" });
});

test("a closed project never offers Collect", () => {
  assert.deepEqual(collectVerdict(project({ status: "cancelled" })), {
    ok: false,
    reason: "project_closed",
  });
  assert.deepEqual(collectVerdict(project({ status: "archived" })), {
    ok: false,
    reason: "project_closed",
  });
});

test("mixed currencies are refused rather than added", () => {
  const v = collectVerdict(
    project({ balances: [balance(), balance({ orderId: "o-2", currency: "MXN" })] }),
  );
  assert.deepEqual(v, { ok: false, reason: "mixed_currency" });
});

test("the order collected against is chosen deterministically", () => {
  const a = collectableBalance(
    project({ balances: [balance({ orderId: "o-9" }), balance({ orderId: "o-2" })] }),
  );
  const b = collectableBalance(
    project({ balances: [balance({ orderId: "o-2" }), balance({ orderId: "o-9" })] }),
  );
  assert.equal(a?.orderId, "o-2");
  assert.equal(b?.orderId, "o-2");
});

// ── The amount ───────────────────────────────────────────────────────

test("the whole balance is the default amount", () => {
  assert.deepEqual(
    collectAmount({ outstandingCents: 80000, mode: "balance", depositText: "", minorUnitDivisor: 100 }),
    { ok: true, amount: { kind: "balance", cents: 80000 } },
  );
});

test("a deposit is typed in major units and must sit strictly inside the balance", () => {
  assert.deepEqual(
    collectAmount({ outstandingCents: 80000, mode: "deposit", depositText: "300", minorUnitDivisor: 100 }),
    { ok: true, amount: { kind: "deposit", cents: 30000 } },
  );
  assert.deepEqual(
    collectAmount({ outstandingCents: 80000, mode: "deposit", depositText: "12,50", minorUnitDivisor: 100 }),
    { ok: true, amount: { kind: "deposit", cents: 1250 } },
  );
  assert.deepEqual(
    collectAmount({ outstandingCents: 80000, mode: "deposit", depositText: "800", minorUnitDivisor: 100 }),
    { ok: true, amount: { kind: "balance", cents: 80000 } },
  );
  assert.deepEqual(
    collectAmount({ outstandingCents: 80000, mode: "deposit", depositText: "800.01", minorUnitDivisor: 100 }),
    { ok: false, reason: "over_balance" },
  );
  assert.deepEqual(
    collectAmount({ outstandingCents: 80000, mode: "deposit", depositText: "0", minorUnitDivisor: 100 }),
    { ok: false, reason: "zero" },
  );
  assert.deepEqual(
    collectAmount({ outstandingCents: 80000, mode: "deposit", depositText: "ten", minorUnitDivisor: 100 }),
    { ok: false, reason: "not_a_number" },
  );
  assert.deepEqual(
    collectAmount({ outstandingCents: 80000, mode: "deposit", depositText: "", minorUnitDivisor: 100 }),
    { ok: false, reason: "not_a_number" },
  );
});

// ── Finding ──────────────────────────────────────────────────────────

test("finding is by client or title, accent-insensitive, owed first", () => {
  const rows = [
    projectsModeRow(project({ id: "settled", title: "Brand shoot", clientName: "Zen Co.", balances: [balance({ collectedCents: 80000 })] })),
    projectsModeRow(project({ id: "owed", title: "Sleeve tattoo", clientName: "Sofía Ramírez" })),
    projectsModeRow(project({ id: "awaiting", title: "Sept content", clientName: "Laura Ortiz", milestones: [milestone({ status: "submitted" })] })),
  ];
  assert.deepEqual(findProjects(rows, "").map((r) => r.id), ["owed", "awaiting", "settled"]);
  assert.deepEqual(findProjects(rows, "sofia").map((r) => r.id), ["owed"]);
  assert.deepEqual(findProjects(rows, "SHOOT").map((r) => r.id), ["settled"]);
  assert.deepEqual(findProjects(rows, "nobody").map((r) => r.id), []);
});

test("a row carries the desk's owed figure and the page's next action", () => {
  const row = projectsModeRow(
    project({ balances: [balance(), balance({ orderId: "o-2", status: "cancelled" })] }),
  );
  assert.equal(row.dueCents, 80000);
  assert.equal(row.action.id, "assign_team");
});

// ── Receipts ─────────────────────────────────────────────────────────

test("a receipt code is trimmed and refused outside the shape /r/<code> accepts", () => {
  assert.equal(normaliseReceiptCode("  abcdefghijklmnopqrst  "), "abcdefghijklmnopqrst");
  assert.equal(normaliseReceiptCode("short"), null);
  assert.equal(normaliseReceiptCode("abcdefghijklmnop qrst"), null);
  assert.equal(normaliseReceiptCode("x".repeat(65)), null);
});
