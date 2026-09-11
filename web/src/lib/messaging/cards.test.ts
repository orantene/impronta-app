import assert from "node:assert/strict";
import { test } from "node:test";

import { CARD_KINDS } from "./types";
import { everyKindHasRenderers, renderCard } from "./cards";

test("every card kind has an operator renderer, a customer renderer, and an SMS fallback", () => {
  const rows = everyKindHasRenderers();
  assert.equal(rows.length, CARD_KINDS.length);
  for (const row of rows) {
    assert.equal(row.operator, true, `${row.kind} missing operator renderer`);
    assert.equal(row.customer, true, `${row.kind} missing customer renderer`);
    if (row.kind === "internal_note") {
      assert.equal(renderCard(row.kind, { state: "sent" }, "sms").smsText, "");
    } else {
      assert.equal(row.sms, true, `${row.kind} missing SMS fallback`);
    }
  }
});

test("internal notes never expose customer actions", () => {
  const model = renderCard("internal_note", { body: "staff only" }, "customer");
  assert.deepEqual(model.actions, []);
});
