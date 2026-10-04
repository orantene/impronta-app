import assert from "node:assert/strict";
import { test } from "node:test";

import {
  resolveGuestJourneyChrome,
  resolveJourneyLabel,
  usesFrontDoorJourneyChrome,
} from "./guest-journey-chrome";

const t = (key: string) => key.split(".").pop() ?? key;

test("agency public dock uses front-door journey chrome (Impronta)", () => {
  assert.equal(usesFrontDoorJourneyChrome({ agencyPublicSurface: true }), true);
  assert.equal(usesFrontDoorJourneyChrome({ omitPlatformBrand: true }), true);
  // dockIntake alone is not an agency surface identity (custom/portfolio/act).
  assert.equal(usesFrontDoorJourneyChrome({}), false);
  assert.equal(
    usesFrontDoorJourneyChrome({ agencyPublicSurface: false, omitPlatformBrand: false }),
    false,
  );
  // Platform hub stays on StatusLine even when brand looks agency-shaped.
  assert.equal(
    usesFrontDoorJourneyChrome({ agencyPublicSurface: true }, { isHub: true }),
    false,
  );
  assert.equal(
    usesFrontDoorJourneyChrome({ omitPlatformBrand: true }, { isHub: true }),
    false,
  );
});

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

test("platform hub empty thread keeps StatusLine (no journey label)", () => {
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

test("talent site first-visit paints Nueva (DoR NUEVA)", () => {
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
    talentSiteChrome: true,
    t,
  });
  assert.equal(chrome.journeyLabel, "headerJourneyNew");
});

test("resolveJourneyLabel maps offer / draft / sent / thread", () => {
  assert.equal(
    resolveJourneyLabel({
      threadStatus: "offer_pending",
      hasInquiry: true,
      receipt: true,
      isDraft: false,
      t,
    }),
    "headerJourneyOffer",
  );
  assert.equal(
    resolveJourneyLabel({
      threadStatus: "open",
      hasInquiry: true,
      receipt: false,
      isDraft: true,
      t,
    }),
    "headerJourneyDraft",
  );
  assert.equal(
    resolveJourneyLabel({
      threadStatus: "open",
      hasInquiry: true,
      receipt: false,
      isDraft: false,
      t,
    }),
    "headerJourneySent",
  );
  assert.equal(
    resolveJourneyLabel({
      threadStatus: "open",
      hasInquiry: true,
      receipt: true,
      isDraft: false,
      t,
    }),
    "headerJourneyThread",
  );
});
