import assert from "node:assert/strict";
import test from "node:test";

import { buildInquiryFormPayload, type InquiryFormContext } from "./inquiry-form-payload";

const ctx = (lines: InquiryFormContext["lines"] = []): InquiryFormContext => ({
  tenantSlug: "hub",
  talentProfileId: "tp-1",
  talentProfileCode: "TA-1",
  sourcePage: "/",
  locale: "es",
  lines,
});
const ok = { name: "Ana María López", email: "ana@example.com", message: "¿Tienes hueco?" };

test("missing fields are reported, nothing is built", () => {
  const r = buildInquiryFormPayload({ name: " ", email: "nope", message: "" }, ctx());
  assert.deepEqual(r, { ok: false, errors: ["name", "email", "message"] });
});

test("no service: a plain inquiry for the talent, marked as the form", () => {
  const r = buildInquiryFormPayload(ok, ctx());
  assert.ok(r.ok);
  assert.equal(r.input.contactFirstName, "Ana");
  assert.equal(r.input.contactLastName, "María López");
  assert.equal(r.input.contactEmail, "ana@example.com");
  assert.equal(r.input.firstMessage, "¿Tienes hueco?");
  assert.equal(r.input.talentProfileId, "tp-1");
  assert.equal(r.input.entryPoint, "inquiry_form");
  assert.equal(r.input.offering, null);
  assert.equal(r.input.lines, undefined);
});

test("one service rides on offering, with its selection", () => {
  const r = buildInquiryFormPayload(
    ok,
    ctx([
      {
        offeringId: "off-1",
        title: "Lifting de pestañas",
        amountCents: 50000,
        currency: "MXN",
        priceType: "fixed",
        kind: "service",
        variantLabel: "Con tinte",
        slotLabel: "Jue 10:00",
        totalCents: 60000,
      },
    ]),
  );
  assert.ok(r.ok);
  assert.deepEqual(r.input.offering, {
    offering_id: "off-1",
    title: "Lifting de pestañas",
    amount_cents: 50000,
    currency: "MXN",
    price_type: "fixed",
    kind: "service",
    variant_label: "Con tinte",
    slot_label: "Jue 10:00",
    total_cents: 60000,
  });
  assert.equal(r.input.lines, undefined);
});

test("several services: first on offering, all on lines, deduped, placeholders dropped", () => {
  const r = buildInquiryFormPayload(
    ok,
    ctx([
      { offeringId: "default-custom-quote", title: "Custom quote" },
      { offeringId: "a", title: "Uñas" },
      { offeringId: "b", title: "Pestañas", amountCents: 1000, currency: "USD" },
      { offeringId: "a", title: "Uñas" },
    ]),
  );
  assert.ok(r.ok);
  assert.equal(r.input.offering?.offering_id, "a");
  assert.deepEqual(r.input.lines, [
    { offering_id: "a", title: "Uñas", amount_cents: null, currency: "USD" },
    { offering_id: "b", title: "Pestañas", amount_cents: 1000, currency: "USD" },
  ]);
});

test("honeypot is passed through for the funnel to reject", () => {
  const r = buildInquiryFormPayload({ ...ok, honeypot: "bot" }, ctx());
  assert.ok(r.ok);
  assert.equal(r.input.honeypot, "bot");
});
