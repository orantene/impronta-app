import assert from "node:assert/strict";
import { test } from "node:test";

import { isOfferSentLine, localiseEngineLine } from "./engine-lines";

const ES = { card: { cat: { offer: "Cotización" } }, offer: { sentPlain: "Enviada" } };

test("the engine's offer-sent lines localise and drop the internal version", () => {
  for (const line of ["Offer v3 sent", "Offer sent", "Offer sent to client.", "offer V12 sent to client"]) {
    assert.ok(isOfferSentLine(line), line);
    assert.equal(localiseEngineLine(line, ES), "Cotización · Enviada");
  }
});

test("any other text is left alone", () => {
  for (const line of ["Offer v3 sent at $25. Awaiting client approval.", "Hola, te envio la cotizacion", "You: Offer sent yesterday"]) {
    assert.equal(localiseEngineLine(line, ES), line);
  }
});

const ES_LINES = {
  ...ES,
  engineLines: {
    allApprovals: "Todas las aprobaciones están completas.",
    offerReopened: "Oferta reabierta para modificarla.",
    offerRejected: "El cliente rechazó la oferta.",
    converted: "La consulta se convirtió en reserva.",
    cancelled: "Esta consulta fue cancelada. No hace falta hacer nada más.",
    expired: "Esta consulta venció antes de reservarse.",
    paused: "Un coordinador pausó esta consulta. No hace falta hacer nada por ahora.",
    talentDeclined: "Un talento rechazó su invitación. Quizá quieras preparar una alternativa.",
    talentSwapped: "Un talento de la alineación fue reemplazado por otro.",
    coordAccepted: "El coordinador aceptó la asignación.",
    coordDeclined: "El coordinador rechazó la asignación.",
    counterStarted: "El coordinador inició una contraoferta.",
    coordinating: "{name} ahora coordina esta consulta.",
    notCoordinating: "{name} ya no coordina esta consulta.",
    approved: "{name} aprobó la oferta.",
  },
};

test("TUL-379: engine system lines localise from the dictionary, not stay English", () => {
  assert.equal(localiseEngineLine("All approvals are complete.", ES_LINES), "Todas las aprobaciones están completas.");
  assert.equal(localiseEngineLine("Client rejected the offer.", ES_LINES), "El cliente rechazó la oferta.");
  assert.equal(localiseEngineLine("Ana is now coordinating this inquiry.", ES_LINES), "Ana ahora coordina esta consulta.");
  assert.equal(localiseEngineLine("Ana approved the offer.", ES_LINES), "Ana aprobó la oferta.");
  assert.equal(localiseEngineLine("Hello there", ES_LINES), "Hello there");
});
