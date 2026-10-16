import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { HqQueueRow } from "@/lib/support/load-hq";
import { filterDeskQueue } from "@/lib/support/desk/desk-filters";
import { aiSuggestedSubjectFor, deriveTicketSubject, displayTicketTitle } from "./ticket-title";

function qrow(over: {
  n: number;
  status?: string;
  waitingOn?: string;
  subject?: string;
  preview?: string;
  talentCode?: string;
  email?: string;
}): HqQueueRow {
  return {
    ticket: {
      id: `id-${over.n}`,
      ticketNumber: over.n,
      status: over.status ?? "open",
      waitingOn: over.waitingOn ?? "support",
      subject: over.subject ?? "Direct message",
      lastMessagePreview: over.preview ?? null,
      category: null,
      contactEmail: over.email ?? null,
      contactName: null,
    },
    tenantName: null,
    tenantSlug: null,
    planTier: null,
    requesterName: null,
    requesterEmail: null,
    talentCode: over.talentCode ?? null,
  } as unknown as HqQueueRow;
}

describe("ticket titles", () => {
  it("contact form: generic topic falls back to the first message", () => {
    assert.equal(
      deriveTicketSubject({ subject: "[guest] Something else", body: "Mi sitio no carga\nGracias" }),
      "Mi sitio no carga",
    );
  });
  it("a short topic is joined with the first words", () => {
    assert.equal(
      deriveTicketSubject({ subject: "Pricing", body: "Do you charge per booking?" }),
      "Pricing: Do you charge per booking?",
    );
  });
  it("a short typed title is kept as typed, never joined with the first message", () => {
    assert.equal(
      deriveTicketSubject({ subject: "QA Grok TUL-657 titulo", body: "Hola, probando", typed: true }),
      "QA Grok TUL-657 titulo",
    );
  });
  it("a typed subject wins", () => {
    assert.equal(
      deriveTicketSubject({ subject: "Cannot publish my site after payment", body: "hi" }),
      "Cannot publish my site after payment",
    );
  });
  it("display repairs old 'Direct message' rows from the preview", () => {
    assert.equal(
      displayTicketTitle({ subject: "Direct message", lastMessagePreview: "QA Grok prueba de hilo" }),
      "QA Grok prueba de hilo",
    );
    assert.equal(displayTicketTitle({ subject: "[guest] Pricing" }), "Pricing");
  });
});

describe("desk search", () => {
  const rows = [
    qrow({ n: 45, waitingOn: "requester", preview: "respuesta de soporte" }),
    qrow({ n: 12, talentCode: "TAL-93940", email: "ana@example.com" }),
  ];
  it("finds a ticket by number even when it is not in the active view", () => {
    assert.deepEqual(filterDeskQueue(rows, "needs_you", "#45", null).map((r) => r.ticket.ticketNumber), [45]);
    assert.deepEqual(filterDeskQueue(rows, "needs_you", "45", null).map((r) => r.ticket.ticketNumber), [45]);
  });
  it("finds by TAL code, email and message text", () => {
    assert.equal(filterDeskQueue(rows, "needs_you", "tal-93940", null).length, 1);
    assert.equal(filterDeskQueue(rows, "needs_you", "ana@", null).length, 1);
    assert.equal(filterDeskQueue(rows, "needs_you", "respuesta de", null).length, 1);
  });
  it("without a query the view still applies", () => {
    assert.deepEqual(filterDeskQueue(rows, "needs_you", "", null).map((r) => r.ticket.ticketNumber), [12]);
  });
});

describe("aiSuggestedSubjectFor (TUL-657)", () => {
  it("never replaces a title the requester typed", () => {
    assert.equal(aiSuggestedSubjectFor("QA Grok test 1", "QA test acknowledgment"), null);
  });
  it("fills an empty or placeholder title", () => {
    assert.equal(aiSuggestedSubjectFor("Direct message", " Cambiar mi horario "), "Cambiar mi horario");
    assert.equal(aiSuggestedSubjectFor(null, "Hours"), "Hours");
  });
  it("returns null when the model suggested nothing", () => {
    assert.equal(aiSuggestedSubjectFor("Direct message", "  "), null);
  });
});
