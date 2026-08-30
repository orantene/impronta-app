import assert from "node:assert/strict";
import { test } from "node:test";

import { findCatalogEntries } from "./catalog";
import type { AudienceContext, NotificationEvent } from "./types";
import {
  EVENTUSER_SUPPORT_DECISIONS,
  GUEST_REQUESTER_MAIL_TRIGGERS,
} from "@/lib/support/guest-notification-audience";

const ctx = {} as AudienceContext;

function guestEvent(type: string): NotificationEvent {
  return {
    type,
    tenantId: null,
    eventId: "evt-guest-1",
    userId: null,
    payload: {
      contactEmail: "prospect@example.com",
      contactName: "Maya",
      ticketId: "11111111-1111-1111-1111-111111111111",
      ticketNumber: 9,
      subject: "Plans",
      surface: "guest",
    },
  };
}

test("every guest-reachable catalog entry resolves a non-empty audience for a null requester", async () => {
  for (const trigger of GUEST_REQUESTER_MAIL_TRIGGERS) {
    const entries = findCatalogEntries(trigger);
    assert.ok(entries.length > 0, `missing catalog entry for ${trigger}`);
    for (const entry of entries) {
      const members = await entry.resolveAudience(guestEvent(trigger), ctx);
      assert.ok(
        members.length > 0,
        `${entry.id} audience is empty for a null-requester guest. That is a void dispatch.`,
      );
      assert.equal(members[0]?.kind, "guest");
    }
  }
});

test("decision (a) siblings exist; decision (b) has no guest sibling", () => {
  for (const d of EVENTUSER_SUPPORT_DECISIONS) {
    if (d.decision === "a") {
      assert.ok(
        findCatalogEntries(d.sibling!).some((e) => e.id.endsWith(".guest") || e.triggers.includes(d.sibling!)),
        `${d.trigger} is (a) but ${d.sibling} is not in the catalog`,
      );
    } else {
      const guestTrigger = `${d.trigger}.guest`;
      assert.equal(
        findCatalogEntries(guestTrigger).length,
        0,
        `${guestTrigger} must not exist (${d.why})`,
      );
    }
  }
});
