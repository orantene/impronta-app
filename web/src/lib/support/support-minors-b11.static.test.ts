import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

// TUL-602 (Batch 11): a client had no way to reach support, and the hub
// landing fell back to a tenant-specific "Impronta Hub" brand.

const read = (p: string) => readFileSync(p, "utf8");

test("the client account always carries a Help link to the platform support page, EN and ES", () => {
  const src = read("src/components/client-account/ClientAccountArea.tsx");
  assert.match(src, /data-client-help/);
  assert.match(src, /getSiteUrl\(\)\}\/support/);
  assert.equal(JSON.parse(read("messages/en.json")).dashboard === undefined, false);
  assert.match(read("messages/en.json"), /"tabHelp": "Help"/);
  assert.match(read("messages/es.json"), /"tabHelp": "Ayuda"/);
});

test("the hub landing fallback brand is platform-neutral", () => {
  assert.doesNotMatch(read("src/components/home/hub-landing.tsx"), /Impronta Hub/);
});
