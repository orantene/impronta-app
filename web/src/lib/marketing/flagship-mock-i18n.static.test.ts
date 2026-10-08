/**
 * TUL-121 theme21: flagship builder/messenger mocks must not leak English
 * chrome on Spanish marketing pages.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { getFlagshipMockCopy } from "./flagship-mock-copy";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const COMPONENT = join(
  root,
  "src/components/marketing/flagship-section.tsx",
);

test("flagship section wires getFlagshipMockCopy (no EN hardcodes)", () => {
  const src = readFileSync(COMPONENT, "utf8");
  assert.match(
    src,
    /getFlagshipMockCopy/,
    "Builder/messenger mocks must read getFlagshipMockCopy.",
  );
  assert.doesNotMatch(
    src,
    />Pay deposit</,
    "Hardcoded English Pay deposit must not remain.",
  );
  assert.doesNotMatch(
    src,
    />Generate</,
    "Hardcoded English Generate must not remain.",
  );
  assert.doesNotMatch(
    src,
    /Hi! Are you free June 14/,
    "Hardcoded English messenger hello must not remain.",
  );
});

test("ES flagship mock chrome is Spanish", () => {
  const es = getFlagshipMockCopy("es");
  assert.equal(es.builder.generate, "Generar");
  assert.equal(es.builder.oneClick, "1 clic");
  assert.equal(es.builder.tagPublic, "Público");
  assert.equal(es.builder.tagPrivate, "Privado");
  assert.equal(es.messenger.threadSubtitle, "Boda · 14 de junio");
  assert.equal(es.messenger.statusBooked, "Confirmada");
  assert.equal(es.messenger.depositAmount, "Anticipo $600 MXN");
  assert.equal(es.messenger.payDeposit, "Pagar anticipo");
  assert.equal(es.messenger.approve, "Aprobar");
  assert.equal(es.messenger.trackInquiry, "Solicitud");
  assert.equal(es.messenger.trackOffer, "Oferta");
  assert.equal(es.messenger.trackDeposit, "Anticipo");
  assert.equal(es.messenger.trackBooked, "Reservada");
  assert.match(es.messenger.hello, /¿Estás libre/);
  assert.match(es.messenger.done, /anticipo enviado/);

  const en = getFlagshipMockCopy("en");
  assert.equal(en.builder.generate, "Generate");
  assert.equal(en.messenger.depositAmount, "Deposit $600 MXN");
  assert.equal(en.messenger.payDeposit, "Pay deposit");
  assert.equal(en.messenger.trackInquiry, "Inquiry");
});

/** Nested string-leaf paths for belt-and-braces en/es key parity. */
function leafPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") {
    return prefix ? [prefix] : [];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    leafPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

function leafStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value === null || typeof value !== "object") return [];
  return Object.values(value as Record<string, unknown>).flatMap(leafStrings);
}

test("flagship mock en/es share the same keys; no em dashes", () => {
  const en = getFlagshipMockCopy("en");
  const es = getFlagshipMockCopy("es");
  const enKeys = leafPaths(en).sort();
  const esKeys = leafPaths(es).sort();
  assert.deepEqual(
    esKeys,
    enKeys,
    "es must expose exactly the same leaf keys as en",
  );
  for (const s of [...leafStrings(en), ...leafStrings(es)]) {
    assert.ok(!s.includes("—"), `em dash in flagship mock copy: ${JSON.stringify(s)}`);
  }
});
