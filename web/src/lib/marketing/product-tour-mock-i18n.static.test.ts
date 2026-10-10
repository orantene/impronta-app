/**
 * TUL-121 theme20: product tour mock chrome must not leak English nav /
 * featured / inbox labels on Spanish marketing pages.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { getProductTourMockCopy } from "./product-tour-mock-copy";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const COMPONENT = join(
  root,
  "src/components/marketing/product-tour-section.tsx",
);

test("product tour mock wires getProductTourMockCopy (no EN hardcodes)", () => {
  const src = readFileSync(COMPONENT, "utf8");
  assert.match(
    src,
    /getProductTourMockCopy/,
    "Mock chrome must load from product-tour-mock-copy.",
  );
  assert.match(src, /mock\.mockFeatured/, "Featured label must come from mock copy.");
  assert.match(src, /mock\.mockHeading/, "Mock heading must come from mock copy.");
  assert.match(src, /mock\.mockNavInquiry/, "Inquiry nav must come from mock copy.");
  assert.match(src, /mock\.mockInboxTitle/, "Inbox title must come from mock copy.");
  assert.doesNotMatch(
    src,
    />Featured roster</,
    "Hardcoded English Featured roster must not remain.",
  );
  assert.doesNotMatch(
    src,
    />Inquiry inbox</,
    "Hardcoded English Inquiry inbox must not remain.",
  );
  assert.doesNotMatch(
    src,
    />People worth booking\.</,
    "Hardcoded English mock heading must not remain.",
  );
});

test("ES product tour mock chrome is Spanish", () => {
  const es = getProductTourMockCopy("es");
  assert.equal(es.mockFeatured, "Catálogo destacado");
  assert.equal(es.mockHeading, "Gente que vale la pena reservar.");
  assert.equal(es.mockAvailable, "Disponible");
  assert.equal(es.mockTagline, "Estudio · Ciudad de México");
  assert.equal(es.mockNavRoster, "Elenco");
  assert.equal(es.mockNavAbout, "Nosotros");
  assert.equal(es.mockNavInquiry, "Solicitud");
  assert.equal(es.mockRequest, "Solicitar");
  assert.equal(es.mockInboxTitle, "Bandeja de solicitudes");
  assert.equal(es.mockInboxBadge, "3 nuevas");
  assert.equal(es.mockStatusNew, "Nueva");
  assert.equal(es.mockStatusOffer, "Oferta");
  assert.equal(es.mockStatusBooked, "Reservada");
  assert.ok(!es.mockBody.includes("—"), "ES mock body must not use em dashes.");

  const en = getProductTourMockCopy("en");
  assert.equal(en.mockFeatured, "Featured roster");
  assert.equal(en.mockNavInquiry, "Inquiry");
  assert.equal(en.mockInboxTitle, "Inquiry inbox");
});
