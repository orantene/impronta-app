import assert from "node:assert/strict";
import test from "node:test";

import { offerBubbleBody } from "./offer-bubble-body";

const es = (k: string) => (k === "public.guestChat.offerSentBody" ? "Tienes una oferta nueva. Revísala abajo." : k);

test("TUL-280: an offer card never echoes the engine's English staff-voice body", () => {
  const out = offerBubbleBody({ kind: "offer_event", body: "Offer sent to client.", cardPayload: { status: "sent", total_label: "300.00 MXN" } }, es);
  assert.equal(out, "Tienes una oferta nueva. Revísala abajo.");
  assert.doesNotMatch(out ?? "", /Offer sent to client/);
});

test("other kinds, and offer rows in other states, are left to the caller", () => {
  assert.equal(offerBubbleBody({ kind: "text", body: "hi", cardPayload: null }, es), null);
  assert.equal(offerBubbleBody({ kind: "offer_event", body: "Accepted offer v4", cardPayload: { status: "accepted" } }, es), null);
});
