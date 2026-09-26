import test from "node:test";
import assert from "node:assert/strict";

import { resolveMaisonPreviewHydration } from "./preview-hydration";

test("demo mode uses starter FAQ prompts and forces catalogBookingLive false", () => {
  const h = resolveMaisonPreviewHydration({ mode: "demo" });
  assert.equal(h.mode, "demo");
  assert.equal(h.isReal, false);
  assert.equal(h.catalogBookingLive, false);
  assert.equal(h.faqItems.length, 4);
  assert.ok(h.faqItems[0]!.question.includes("reservo") || h.faqItems[0]!.question.length > 0);
  assert.ok(h.siteContent);
});

test("mine mode uses caller FAQ and stays booking-inert in preview", () => {
  const h = resolveMaisonPreviewHydration({
    mode: "mine",
    mineFaq: [{ id: "x", question: "Mine?", answer: "Yes" }],
  });
  assert.equal(h.mode, "mine");
  assert.equal(h.isReal, true);
  assert.equal(h.catalogBookingLive, false);
  assert.equal(h.faqItems[0]!.question, "Mine?");
  assert.equal(h.siteContent, null);
});
