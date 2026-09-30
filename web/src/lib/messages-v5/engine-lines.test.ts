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
