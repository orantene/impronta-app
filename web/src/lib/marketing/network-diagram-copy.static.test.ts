import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { networkPreviewCopy } from "@/components/marketing/network-preview-copy";
import { getMarketingCopy } from "./copy";

const COMPONENT = "src/components/marketing/network-section.tsx";

test("network diagram reads preview copy via networkPreviewCopy(locale)", () => {
  const src = readFileSync(COMPONENT, "utf8");
  assert.match(
    src,
    /networkPreviewCopy\(locale\)/,
    "NetworkDiagram must use networkPreviewCopy(locale), not hardcode EN.",
  );
  assert.doesNotMatch(
    src,
    /Search the network before you apply\./,
    "Hardcoded English diagram caption must not remain in the component.",
  );
  assert.doesNotMatch(
    src,
    /Agencies & hubs/,
    "Hardcoded English diagram eyebrow must not remain in the component.",
  );
});

test("ES marketing network diagram copy is Spanish", () => {
  const es = networkPreviewCopy("es");
  assert.equal(es.eyebrow, "Agencias y hubs");
  assert.equal(es.headline, "Busca en la red antes de postularte.");
  assert.equal(es.openTag, "Abierto");

  const en = networkPreviewCopy("en");
  assert.equal(en.eyebrow, "Agencies & hubs");
  assert.equal(en.headline, "Search the network before you apply.");
  assert.equal(en.openTag, "Open");

  // Keys remain on getMarketingCopy.network for other consumers.
  assert.equal(getMarketingCopy("es").network.diagramCaption, es.headline);
  assert.equal(getMarketingCopy("en").network.diagramCaption, en.headline);
});
