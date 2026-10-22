/**
 * TUL-36 slice 4: the handoff-to-a-person context. Capped guest text, public service title
 * only, no ids, closed reason set, fail-closed read-back, deterministic ES/EN note.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  HANDOFF_GUEST_TEXT_MAX,
  buildHandoffContext,
  guestHandoffText,
  handoffMetadata,
  readHandoffContext,
  teamHandoffNote,
} from "./handoff-context";

test("the context carries the reason, the capped guest words, the public service title and what was shown", () => {
  const ctx = buildHandoffContext({
    reason: "inquiry_only",
    locale: "es",
    guestMessage: "  Quiero un corte\n\tel viernes  ",
    serviceTitle: "Corte",
    shown: { kind: "quote", priceLabel: "$700 MXN" },
  });
  assert.deepEqual(ctx, {
    v: 1, reason: "inquiry_only", locale: "es", guestAsked: "Quiero un corte el viernes", serviceTitle: "Corte",
    shown: { kind: "quote", priceLabel: "$700 MXN" },
  });
});

test("long guest text is capped; empty text and an empty service are null; times count is bounded", () => {
  const long = buildHandoffContext({ reason: "unsure", locale: "en", guestMessage: "x".repeat(1000) });
  assert.ok(long.guestAsked!.length <= HANDOFF_GUEST_TEXT_MAX);
  assert.match(long.guestAsked!, /\.\.\.$/);
  const empty = buildHandoffContext({ reason: "unsure", locale: "en", guestMessage: "   ", serviceTitle: "" });
  assert.equal(empty.guestAsked, null);
  assert.equal(empty.serviceTitle, null);
  assert.equal(buildHandoffContext({ reason: "unsure", locale: "en", shown: { kind: "times", count: 99 } }).shown?.kind, "times");
  assert.deepEqual(buildHandoffContext({ reason: "unsure", locale: "en", shown: { kind: "times", count: 99 } }).shown, { kind: "times", count: 6 });
  assert.equal(buildHandoffContext({ reason: "unsure", locale: "en", shown: { kind: "times", count: 0 } }).shown, null);
});

test("no ids are part of the context shape", () => {
  const ctx = buildHandoffContext({ reason: "unknown_service", locale: "en", guestMessage: "hi", serviceTitle: null });
  assert.deepEqual(Object.keys(ctx).sort(), ["guestAsked", "locale", "reason", "serviceTitle", "shown", "v"]);
});

test("metadata merges the reason and the context for the existing handoff message", () => {
  const ctx = buildHandoffContext({ reason: "human_requested", locale: "en", guestMessage: "talk to a person" });
  const meta = handoffMetadata(ctx);
  assert.equal(meta.handoff_reason, "human_requested");
  assert.deepEqual(meta.handoff_context, ctx);
});

test("read-back round-trips and fails closed on anything malformed", () => {
  const ctx = buildHandoffContext({ reason: "turn_ceiling", locale: "es", guestMessage: "hola", serviceTitle: "Corte", shown: { kind: "times", count: 3 } });
  assert.deepEqual(readHandoffContext(JSON.parse(JSON.stringify(ctx))), ctx);
  for (const bad of [null, 1, "x", [], {}, { v: 2, reason: "unsure" }, { v: 1, reason: "drop table" }, { v: 1, reason: 5 }]) {
    assert.equal(readHandoffContext(bad), null, JSON.stringify(bad));
  }
  const odd = readHandoffContext({ v: 1, reason: "unsure", locale: "fr", guestAsked: 5, serviceTitle: {}, shown: { kind: "times", count: -1 } });
  assert.deepEqual(odd, { v: 1, reason: "unsure", locale: "en", guestAsked: null, serviceTitle: null, shown: null });
});

test("the team note is deterministic ES/EN and mentions what the guest saw", () => {
  const ctx = buildHandoffContext({ reason: "human_requested", locale: "en", guestMessage: "can I talk to a person", serviceTitle: "Haircut", shown: { kind: "quote", priceLabel: "$700 MXN" } });
  const en = teamHandoffNote(ctx, "en");
  assert.equal(en, 'Automated reply: handed to a person because the guest asked for a person. The guest wrote: "can I talk to a person" Service: Haircut. They were already shown a price: $700 MXN.');
  const es = teamHandoffNote(ctx, "es");
  assert.match(es, /^Respuesta automática: pasa a una persona porque el cliente pidió hablar con una persona\./);
  assert.match(es, /Ya se le mostró un precio: \$700 MXN\./);
  const times = teamHandoffNote(buildHandoffContext({ reason: "inquiry_only", locale: "en", shown: { kind: "times", count: 2 } }), "en");
  assert.match(times, /already shown 2 open times/);
  assert.doesNotMatch(en + es + times, /—/);
});

test("every reason has a team line in both languages and a guest line (unknown ones read as unsure)", () => {
  const reasons = [
    "unsure", "human_requested", "turn_ceiling", "gated", "off", "bad_tool_call", "tool_unavailable",
    "unknown_service", "not_sellable", "inquiry_only", "payment_unavailable", "money_off",
  ] as const;
  for (const reason of reasons) {
    for (const locale of ["en", "es"] as const) {
      const ctx = buildHandoffContext({ reason, locale });
      assert.match(teamHandoffNote(ctx, locale), /\w/);
      assert.doesNotMatch(teamHandoffNote(ctx, locale), /undefined/);
      assert.ok(guestHandoffText(ctx).length > 10);
    }
  }
  assert.equal(guestHandoffText(buildHandoffContext({ reason: "money_off", locale: "en" })), guestHandoffText(buildHandoffContext({ reason: "unsure", locale: "en" })));
  assert.notEqual(guestHandoffText(buildHandoffContext({ reason: "turn_ceiling", locale: "en" })), guestHandoffText(buildHandoffContext({ reason: "unsure", locale: "en" })));
});

test("static: pure module (no I/O, no database, no money)", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/ai/booking-assistant/tools/handoff-context.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(src, /supabase|server-only|createPurchase|createPaymentLink|stripe|fetch\(/i);
});
