/**
 * TUL-1415 / TUL-1587: rules overrule the model on the day word and on attendees vs talents.
 * QA build 8 stored event_date 2026-10-29 and quantity 12 for "chef para 10 personas el sábado y 2 meseros".
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { applyDeterministicFixups, extractPartySize } from "./guest-message-fixups";

const ctx = { now: new Date("2026-10-22T16:00:00Z"), timeZone: "America/Cancun" };
const SENTENCE = "chef para 10 personas el sábado y 2 meseros";

test("the model's wrong Thursday and its 12 talents are replaced by Saturday 24 Oct and 10 attendees", () => {
  const model = { date: { status: "exact" as const, event_date: "2026-10-29" }, talent: { count_needed: 12, types_needed: ["chef", "mesero"] } };
  const out = applyDeterministicFixups(model, SENTENCE, ctx);
  assert.deepEqual(out.date, { status: "exact", event_date: "2026-10-24" });
  assert.equal(out.partySize, 10);
  assert.equal(out.talent?.count_needed, undefined);
  assert.deepEqual(out.talent?.types_needed, ["chef", "mesero"]);
});

test("it works with the model off: an empty capture still gets the day and the party", () => {
  const out = applyDeterministicFixups({}, SENTENCE, ctx);
  assert.equal(out.date?.event_date, "2026-10-24");
  assert.equal(out.partySize, 10);
  assert.equal(out.talent, undefined);
});

test("the rewritten request message resolves the same way", () => {
  const out = applyDeterministicFixups({}, "Quiero solicitar:\n- QA Chef privado\n- 2 x QA Mesero\nPara 10 personas.\nCuando: sabado.", ctx);
  assert.equal(out.date?.event_date, "2026-10-24");
  assert.equal(out.partySize, 10);
});

test("a stated talent count with no attendees is kept; a duration is kept with the new day", () => {
  const out = applyDeterministicFixups({ talent: { count_needed: 3 }, date: { status: "exact", event_date: "2026-10-29", duration: "full day" } }, "3 photographers tomorrow", ctx);
  assert.equal(out.talent?.count_needed, 3);
  assert.deepEqual(out.date, { duration: "full day", status: "exact", event_date: "2026-10-23" });
  assert.equal(out.partySize, undefined);
});

test("an explicit date stays the model's; a time length is not a party", () => {
  const model = { date: { status: "exact" as const, event_date: "2026-11-07" } };
  assert.deepEqual(applyDeterministicFixups(model, "photographer for 3 hours on 2026-11-07", ctx).date, model.date);
  assert.equal(extractPartySize("photographer for 3 hours"), null);
  assert.equal(extractPartySize("for 80 guests"), 80);
  assert.equal(extractPartySize("cena para 12 comensales"), 12);
});
