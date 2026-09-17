import assert from "node:assert/strict";
import { test } from "node:test";

import { PDFDocument } from "pdf-lib";

import {
  formatMoney,
  refundPolicySentence,
  renderTicketPdf,
  tenderLabel,
  ticketPdfFilename,
  type TicketPdfInput,
} from "./ticket-pdf";

const CODE_A = "22222222-2222-4222-8222-222222222222.1.AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
const CODE_B = "33333333-3333-4333-8333-333333333333.1.ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543210";

function input(over: Partial<TicketPdfInput> = {}): TicketPdfInput {
  return {
    locale: "es",
    brand: { accountName: "Impronta", logoUrl: null, accent: "#b5443c", accentOn: "#ffffff", footerDomain: "impronta.tulala.digital" },
    eventTitle: "LUMINA · Noche de apertura",
    nightLabel: "sábado 3 de octubre, 18:00 h (hora de Cancún)",
    venueName: "El Paisa",
    venueAddress: "Av. Tulum 123, Cancún",
    holderName: "Ana María Pérez",
    admissions: [
      { code: CODE_A, qrUrl: "https://x/api/tickets/a/qr", ticketUrl: "https://impronta.tulala.digital/ticket/a", tierLabel: "Mesa para 10", partySize: 10, seatLabel: "Mesa 4" },
      { code: CODE_B, qrUrl: "https://x/api/tickets/b/qr", ticketUrl: "https://impronta.tulala.digital/ticket/b", tierLabel: "Entrada general", partySize: 1, seatLabel: null },
    ],
    receipt: {
      receiptCode: "R7K2Q9",
      orderRef: "0f1e2d3c-4b5a-4697-8877-665544332211",
      currency: "MXN",
      lines: [
        { label: "Mesa para 10", qty: 1, unitCents: 1500000, totalCents: 1500000 },
        { label: "Entrada general", qty: 1, unitCents: 35000, totalCents: 35000 },
      ],
      subtotalCents: 1535000,
      discountCents: 0,
      tipCents: 0,
      totalCents: 1535000,
      tender: { provider: "stripe", paidVia: null },
      paidAt: "2026-09-17T02:10:00Z",
    },
    refundPolicy: refundPolicySentence("es", { cutoffHours: 48, workspaceKey: null }),
    ...over,
  };
}

/** pdf-lib writes page text as literal strings inside content streams when the
 *  standard fonts are used, and as hex glyph ids for an embedded subset. The
 *  metadata (Title/Subject) is always a plain string, so it is what we grep. */
function latin1(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("latin1");
}

test("one page per admission; the document re-opens with the receipt in its metadata", async () => {
  const bytes = await renderTicketPdf(input(), { fetchLogo: null });
  assert.ok(bytes.byteLength > 2000, "a real document");
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 2, "Mesa para 10 + Entrada general = two pages");
  assert.match(doc.getTitle() ?? "", /Entrada · LUMINA/);
  assert.match(doc.getSubject() ?? "", /R7K2Q9/);
  assert.equal(doc.getAuthor(), "Impronta");
  const { width: w, height: h } = doc.getPage(0).getSize();
  assert.ok(Math.abs(w - 419.5) < 1 && Math.abs(h - 595.3) < 1, `A5 portrait, got ${w}x${h}`);
  // Page text is glyph ids in a subset font, the metadata strings carry
  // non-ASCII (pdf-lib writes them UTF-16) and object streams are
  // compressed, so no raw grep is honest here: the re-opened document's
  // decoded Subject above is the "the code is in the file" check.
});

test("english copy, single admission, comp tender, a logo that cannot be fetched is skipped", async () => {
  let asked = 0;
  const bytes = await renderTicketPdf(
    input({
      locale: "en",
      brand: { accountName: "Impronta", logoUrl: "https://example.com/logo.svg", accent: "#000000", accentOn: "#ffffff", footerDomain: "x.y" },
      admissions: [input().admissions[1]!],
      receipt: { ...input().receipt, totalCents: 0, subtotalCents: 0, lines: [{ label: "Guest list", qty: 1, unitCents: 0, totalCents: 0 }], tender: { provider: null, paidVia: null } },
      refundPolicy: refundPolicySentence("en", { cutoffHours: null, workspaceKey: "flexible" }),
    }),
    {
      fetchLogo: async () => {
        asked += 1;
        return null;
      },
    },
  );
  assert.equal(asked, 1, "the fetcher was consulted once");
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
  assert.match(doc.getTitle() ?? "", /^Ticket · /);
});

test("a PNG logo embeds", async () => {
  // 1x1 red PNG.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
    "base64",
  );
  const bytes = await renderTicketPdf(
    input({ brand: { ...input().brand, logoUrl: "https://example.com/logo.png" } }),
    { fetchLogo: async () => ({ bytes: new Uint8Array(png), kind: "png" }) },
  );
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 2);
  assert.match(latin1(bytes), /\/Subtype \/Image/, "an image XObject is in the file");
});

test("refund sentence: event cutoff first, workspace key second, honest unknown last", () => {
  assert.equal(refundPolicySentence("es", { cutoffHours: 48, workspaceKey: "strict" }), "Reembolsos hasta 48 horas antes de puertas.");
  assert.equal(refundPolicySentence("en", { cutoffHours: 0, workspaceKey: null }), "Refunds until the event starts.");
  assert.match(refundPolicySentence("en", { cutoffHours: null, workspaceKey: "flexible" }), /^Full refund up to 48 h/);
  assert.equal(refundPolicySentence("es", { cutoffHours: null, workspaceKey: null }), "Consulta la política de reembolsos con el local.");
});

test("tender labels and money", () => {
  assert.equal(tenderLabel("es", { provider: "manual", paidVia: "cash" }, 100), "Efectivo");
  assert.equal(tenderLabel("en", { provider: "manual", paidVia: "card" }, 100), "Card at the counter");
  assert.equal(tenderLabel("en", { provider: "stripe", paidVia: null }, 100), "Card");
  assert.equal(tenderLabel("es", { provider: null, paidVia: null }, 0), "Cortesía");
  assert.equal(tenderLabel("en", { provider: "mercado_pago_point", paidVia: null }, 100), "Mercado pago point");
  assert.match(formatMoney(1535000, "MXN", "es"), /MXN/);
  assert.match(formatMoney(1535000, "MXN", "es"), /15,350\.00|15\.350,00/);
  assert.equal(formatMoney(4200, "USD", "en"), "USD 42.00");
});

test("filenames are locale-prefixed and shell-safe", () => {
  assert.equal(ticketPdfFilename("es", "R7K2Q9", "x"), "entrada-R7K2Q9.pdf");
  assert.equal(ticketPdfFilename("en", null, "0f1e2d3c-4b5a"), "ticket-0f1e2d3c-4b5a.pdf");
  assert.equal(ticketPdfFilename("en", "../../etc", "x"), "ticket-etc.pdf");
});
