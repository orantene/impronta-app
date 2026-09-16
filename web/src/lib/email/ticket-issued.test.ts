import assert from "node:assert/strict";
import { test } from "node:test";

import { renderTicketIssuedEmail, ticketIssuedSubject, type TicketIssuedInput } from "./ticket-issued";

const base: TicketIssuedInput = {
  locale: "es",
  brand: { accountName: "Impronta Models", logoUrl: null, accent: "#c9a227", accentOn: "#1a1407", footerDomain: "improntamodels.com" },
  eventTitle: "Fiesta de lanzamiento LUMINA",
  nightLabel: "sábado, 3 de octubre, 18:00 GMT-5",
  venueName: "Impronta Studio",
  holderName: "Ana <script>alert(1)</script>",
  receiptUrl: "https://improntamodels.com/r/ABC123",
  admissions: [
    { code: "v1.abc.def", qrUrl: "https://improntamodels.com/api/tickets/v1.abc.def/qr.png", ticketUrl: "https://improntamodels.com/ticket/v1.abc.def", tierLabel: "Entrada general", partySize: 1 },
  ],
};

test("subject names the brand and the event, per locale", () => {
  assert.equal(ticketIssuedSubject(base), "Impronta Models: tu entrada · Fiesta de lanzamiento LUMINA");
  assert.equal(ticketIssuedSubject({ ...base, locale: "en" }), "Impronta Models: your ticket · Fiesta de lanzamiento LUMINA");
  assert.equal(ticketIssuedSubject({ ...base, isResend: true }), "Impronta Models: tu entrada, otra vez · Fiesta de lanzamiento LUMINA");
  assert.match(ticketIssuedSubject({ ...base, admissions: [base.admissions[0], base.admissions[0]] }), /tus entradas/);
});

test("the body carries the hosted QR, the code, the ticket link and the receipt, in Spanish", () => {
  const html = renderTicketIssuedEmail(base);
  assert.match(html, /<html lang="es">/);
  assert.match(html, /<img src="https:\/\/improntamodels\.com\/api\/tickets\/v1\.abc\.def\/qr\.png"/);
  assert.match(html, /v1\.abc\.def<\/div>/);
  assert.match(html, /href="https:\/\/improntamodels\.com\/ticket\/v1\.abc\.def"[^>]*>Ver mi entrada</);
  assert.match(html, /href="https:\/\/improntamodels\.com\/r\/ABC123"[^>]*>Ver recibo</);
  assert.match(html, /Muestra el QR en la puerta/);
  assert.match(html, /Lugar: Impronta Studio/);
  assert.doesNotMatch(html, /data:image/, "a hosted image, never a data URI (Gmail strips them)");
});

test("holder input is escaped and the brand accent colours the button", () => {
  const html = renderTicketIssuedEmail(base);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /background:#c9a227;color:#1a1407/);
});

test("a table admits ten and says so; two admissions are numbered", () => {
  const html = renderTicketIssuedEmail({
    ...base,
    admissions: [
      { ...base.admissions[0], tierLabel: "Mesa para 10", partySize: 10 },
      { ...base.admissions[0], code: "v1.xyz.123", tierLabel: "Mesa para 10", partySize: 10 },
    ],
  });
  assert.match(html, /Mesa para 10 1\/2/);
  assert.match(html, /Mesa para 10 2\/2/);
  assert.match(html, /Admite 10 personas/);
});

test("english copy for an en locale", () => {
  const html = renderTicketIssuedEmail({ ...base, locale: "en", holderName: null });
  assert.match(html, /Hi,<br>Here is your ticket/);
  assert.match(html, />View my ticket</);
});
