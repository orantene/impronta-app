import test from "node:test";
import assert from "node:assert/strict";

import { buildServiceFaqJsonLd, serviceFaqItems } from "./service-page-faq";
import type { ServicePageOffering } from "./service-page";

const A: ServicePageOffering = {
  id: "3fa91c2b-1111-4222-8333-444455556666",
  kind: "service",
  title: "Corte",
  description: null,
  priceDisplay: "from",
  amountCents: 30000,
  currency: "MXN",
  durationMinutes: 45,
  visibility: "public",
  cancellationHours: 24,
  bookingMode: "instant",
  reserveMode: "deposit",
  depositPct: 30,
};

test("TUL-795 FAQ: the talent's own published FAQ wins, blanks dropped", () => {
  const items = serviceFaqItems(A, [
    { question: "¿Atiendes a domicilio?", answer: "Sí, en Cancún." },
    { question: "  ", answer: "x" },
  ], "es");
  assert.deepEqual(items, [{ question: "¿Atiendes a domicilio?", answer: "Sí, en Cancún." }]);
});

test("TUL-795 FAQ: without a talent FAQ, answers come only from real service fields", () => {
  const es = serviceFaqItems(A, [], "es");
  assert.deepEqual(es.map((i) => i.answer), [
    "45 min.",
    `Desde ${new Intl.NumberFormat("es", { style: "currency", currency: "MXN" }).format(300)}.`,
    "Sí, un anticipo del 30% al reservar; el resto después.",
    "Sin costo hasta 24 h antes de la cita.",
  ]);
  const en = serviceFaqItems({ ...A, reserveMode: "free" }, [], "en");
  assert.equal(en[2].question, "Do I pay when I book?");
  assert.equal(en[2].answer, "No, booking does not require an upfront payment.");
  for (const i of [...es, ...en]) assert.ok(!/—/.test(i.question + i.answer));
});

test("TUL-795 FAQ: missing fields produce no question (nothing invented)", () => {
  const bare: ServicePageOffering = { ...A, durationMinutes: null, priceDisplay: "quote", amountCents: null, cancellationHours: null, reserveMode: undefined, bookingMode: "inquiry" };
  assert.deepEqual(serviceFaqItems(bare, [], "es"), []);
  assert.deepEqual(serviceFaqItems({ ...A, bookingMode: "inquiry" }, [], "en").map((i) => i.question), [
    "How long does it take?",
    "How much does it cost?",
    "Can I cancel?",
  ]);
});

test("TUL-795 FAQ: FAQPage JSON-LD lists exactly the questions shown, none when empty", () => {
  const items = serviceFaqItems(A, [], "es");
  const ld = buildServiceFaqJsonLd(items, "https://j.example/servicio-corte-3fa91c2b") as {
    "@type": string;
    mainEntity: { "@type": string; name: string; acceptedAnswer: { "@type": string; text: string } }[];
  };
  assert.equal(ld["@type"], "FAQPage");
  assert.equal(ld.mainEntity.length, items.length);
  assert.deepEqual(ld.mainEntity[0], { "@type": "Question", name: items[0].question, acceptedAnswer: { "@type": "Answer", text: items[0].answer } });
  assert.equal(buildServiceFaqJsonLd([], "https://j.example/x"), null);
});
