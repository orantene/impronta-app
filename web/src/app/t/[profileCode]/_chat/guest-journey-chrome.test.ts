import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveGuestJourneyChrome } from "./guest-journey-chrome";

const t = (key: string) => key.split(".").pop() ?? key;

test("offer_pending paints headerJourneyOffer and keeps segs", () => {
  const chrome = resolveGuestJourneyChrome({
    trade: "beauty",
    intent: null,
    captured: null,
    threadStatus: "offer_pending",
    inquiryId: "inq-1",
    receipt: true,
    contactPromoted: true,
    cartTalentCount: 0,
    v5: {
      threadToken: "tok",
      offers: [],
      payCode: null,
      items: {
        currency: "MXN",
        lines: [
          {
            id: "l1",
            label: "Lifting",
            units: 1,
            unitCents: 50000,
            author: "client",
            confirmed: false,
            kind: "service",
          },
        ],
        records: [],
      },
    } as never,
    rows: [
      {
        id: "m1",
        inquiryId: "inq-1",
        kind: "text",
        body: "Viernes, lifting",
        authorRole: "guest",
        authorLabel: null,
        authorAvatarUrl: null,
        replyToMessageId: null,
        createdAt: "2026-09-24T10:48:00.000Z",
        editedAt: null,
        isDeleted: false,
        cardPayload: null,
      },
    ],
    t,
  });
  assert.equal(chrome.journeyLabel, "headerJourneyOffer");
  assert.ok(chrome.journeySegs.length === 4);
  assert.ok(chrome.journeySegs.some((s) => s.id === "service" && s.on));
  assert.ok(chrome.journeySegs.some((s) => s.id === "message" && s.on));
  assert.ok(chrome.railLabel);
});

test("new thread has no journey label", () => {
  const chrome = resolveGuestJourneyChrome({
    trade: "beauty",
    intent: null,
    captured: null,
    threadStatus: "open",
    inquiryId: null,
    receipt: false,
    contactPromoted: false,
    cartTalentCount: 0,
    v5: null,
    rows: [],
    t,
  });
  assert.equal(chrome.journeyLabel, null);
  assert.equal(chrome.railLabel, "railNothing");
});
