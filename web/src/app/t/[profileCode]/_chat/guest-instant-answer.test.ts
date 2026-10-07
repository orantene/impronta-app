import assert from "node:assert/strict";
import { test } from "node:test";

import type { GuestChatOffering } from "@/lib/inquiry/guest-chat-contract";
import {
  buildInstantRows,
  buildInstantServiceAnswer,
  detectServiceQuestion,
  firstSendDecision,
  formatDuration,
} from "./guest-instant-answer";

const T: Record<string, string> = {
  "public.guestChat.instantAnsPrice": "{title} cuesta {price}.",
  "public.guestChat.instantAnsDuration": "{title} dura aproximadamente {duration}.",
  "public.guestChat.instantAnsBoth": "{title}: {price}, aproximadamente {duration}.",
  "public.guestChat.instantAnsMore": "MORE",
};
const t = (k: string) => T[k] ?? k;

function off(over: Partial<GuestChatOffering>): GuestChatOffering {
  return {
    offeringId: "o1",
    talentProfileId: "t1",
    title: "Corte de cabello",
    kind: "service",
    priceType: "fixed",
    amountCents: 50000,
    currency: "MXN",
    durationMinutes: 45,
    allowPayInPerson: true,
    reserveMode: "free",
    depositPct: null,
    imageUrl: null,
    ...over,
  };
}

test("detects price and duration questions, ES and EN", () => {
  assert.deepEqual(detectServiceQuestion("¿Cuánto cuesta el corte?"), { price: true, duration: false });
  assert.deepEqual(detectServiceQuestion("how long does it take"), { price: false, duration: true });
  assert.deepEqual(detectServiceQuestion("precio y duración del corte"), { price: true, duration: true });
});

test("booking intent and chit-chat are not instant questions", () => {
  assert.equal(detectServiceQuestion("Quiero reservar el sábado, cuánto cuesta?"), null);
  assert.equal(detectServiceQuestion("hola"), null);
});

test("answers price + duration for the named service with no identity", () => {
  const a = buildInstantServiceAnswer({
    text: "cuanto cuesta y cuanto dura el corte de cabello",
    offerings: [off({}), off({ offeringId: "o2", title: "Color", amountCents: 90000 })],
    locale: "es",
    t,
  });
  assert.ok(a);
  assert.match(a, /^Corte de cabello: \$500 MXN, aproximadamente 45 min\./);
  assert.doesNotMatch(a, /Color/);
  assert.match(a, /MORE$/);
});

test("with no service named, lists a short menu; refuses a long one", () => {
  const few = [off({}), off({ offeringId: "o2", title: "Color", amountCents: 90000 })];
  const a = buildInstantServiceAnswer({ text: "cuánto cuesta", offerings: few, locale: "es", t });
  assert.ok(a && /Color cuesta \$900 MXN\./.test(a));
  const many = Array.from({ length: 6 }, (_, i) => off({ offeringId: `x${i}`, title: `Servicio ${i}` }));
  assert.equal(buildInstantServiceAnswer({ text: "cuánto cuesta", offerings: many, locale: "es", t }), null);
});

test("returns null when the services hold no asked fact", () => {
  const none = [off({ amountCents: null, durationMinutes: null })];
  assert.equal(buildInstantServiceAnswer({ text: "cuanto cuesta el corte", offerings: none, locale: "es", t }), null);
  assert.equal(buildInstantServiceAnswer({ text: "cuanto cuesta", offerings: [], locale: "es", t }), null);
});

test("uses the menu's own price label when present", () => {
  const a = buildInstantServiceAnswer({
    text: "precio del corte",
    offerings: [off({ priceLabel: "Desde $120 por uña" })],
    locale: "es",
    t,
  });
  assert.ok(a && a.startsWith("Corte de cabello cuesta Desde $120 por uña."));
});

test("firstSendDecision: anonymous question answers, other anonymous text asks identity, contact sends", () => {
  assert.equal(firstSendDecision({ hasContact: false, instantAnswer: "x" }), "answer");
  assert.equal(firstSendDecision({ hasContact: false, instantAnswer: null }), "ask_identity");
  assert.equal(firstSendDecision({ hasContact: true, instantAnswer: "x" }), "send");
});

test("local rows are a guest question then a talent answer, in order", () => {
  const rows = buildInstantRows("q", "a", new Date("2026-10-07T00:00:00Z"));
  assert.deepEqual(rows.map((r) => r.authorRole), ["guest", "talent"]);
  assert.ok(rows[0].createdAt < rows[1].createdAt);
  assert.equal(formatDuration(90), "1 h 30 min");
});
