import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { HqQueueRow } from "@/lib/support/load-hq";
import type { SupportTicketRow } from "@/lib/support/support-types";
import {
  countDeskView,
  filterDeskQueue,
  matchesDeskView,
} from "./desk-filters";

function row(
  partial: Partial<SupportTicketRow> & Pick<SupportTicketRow, "id">,
): HqQueueRow {
  const { id, ...rest } = partial;
  const ticket = {
    id,
    ticketNumber: 1,
    tenantId: null,
    surface: "client",
    requesterUserId: null,
    guestSessionId: null,
    talentProfileId: null,
    clientProfileId: null,
    subject: "Help",
    category: null,
    tags: [],
    originSurfaceSlug: null,
    status: "open",
    waitingOn: "support",
    priority: "normal",
    handledBy: "human",
    escalatedAt: null,
    escalationReason: null,
    assigneeUserId: null,
    contactEmail: null,
    contactName: null,
    contactPhone: null,
    guestLastReadAt: null,
    callbackRequested: false,
    callbackPref: null,
    lastMessageAt: "2026-10-01T00:00:00.000Z",
    lastMessagePreview: null,
    messageCount: 1,
    firstHumanResponseAt: null,
    resolvedAt: null,
    closedAt: null,
    reopenedCount: 0,
    satisfactionRating: null,
    satisfactionComment: null,
    ratedAt: null,
    rootCause: null,
    longTermFix: null,
    metadata: {},
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...rest,
  } as SupportTicketRow;
  return {
    ticket,
    tenantName: null,
    tenantSlug: null,
    planTier: null,
    requesterName: "Ada",
    requesterEmail: "ada@example.com",
  };
}

describe("desk-filters (journeys 2 / 23 views)", () => {
  const self = "agent-1";
  const rows = [
    row({ id: "a", waitingOn: "support", assigneeUserId: null }),
    row({ id: "b", waitingOn: "support", assigneeUserId: self }),
    row({ id: "c", waitingOn: "requester", assigneeUserId: self }),
    row({ id: "d", status: "resolved", resolvedAt: new Date().toISOString() }),
    row({ id: "e", escalatedAt: "2026-10-01T12:00:00.000Z", waitingOn: "support" }),
  ];

  it("needs_you is open + waiting on support", () => {
    assert.equal(matchesDeskView(rows[0]!, "needs_you", self), true);
    assert.equal(matchesDeskView(rows[2]!, "needs_you", self), false);
  });

  it("unassigned / mine / waiting_customer / escalated / resolved_today", () => {
    assert.equal(matchesDeskView(rows[0]!, "unassigned", self), true);
    assert.equal(matchesDeskView(rows[1]!, "mine", self), true);
    assert.equal(matchesDeskView(rows[2]!, "waiting_customer", self), true);
    assert.equal(matchesDeskView(rows[4]!, "escalated", self), true);
    assert.equal(matchesDeskView(rows[3]!, "resolved_today", self), true);
  });

  it("search filters haystack (journey 23)", () => {
    const hit = filterDeskQueue(
      [
        {
          ...row({ id: "x", subject: "Payment failed", contactEmail: "pay@x.com" }),
          requesterName: "Bo",
        },
        row({ id: "y", subject: "Other" }),
      ],
      "all_open",
      "payment",
      self,
    );
    assert.equal(hit.length, 1);
    assert.equal(hit[0]!.ticket.id, "x");
  });

  it("countDeskView matches filter length", () => {
    assert.equal(
      countDeskView(rows, "needs_you", self),
      filterDeskQueue(rows, "needs_you", "", self).length,
    );
  });
});
