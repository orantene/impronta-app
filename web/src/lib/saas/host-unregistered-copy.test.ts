import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { hostUnregisteredCopy } from "./host-unregistered-copy";

test("TUL-877: Spanish browser gets Spanish copy, English and unknown get English", () => {
  assert.equal(hostUnregisteredCopy("es-MX,es;q=0.9,en;q=0.8").heading, "Este dominio aún no está conectado");
  assert.equal(hostUnregisteredCopy("en-US,en;q=0.9").heading, "This domain isn't connected yet");
  assert.equal(hostUnregisteredCopy(null).locale, "en");
  assert.equal(hostUnregisteredCopy(null, "MX").locale, "es");
});

test("TUL-877: every field is localized (tab title, heading, body, CTA) in ES and EN", () => {
  const es = hostUnregisteredCopy("es-ES,es;q=0.9");
  assert.equal(es.tabTitle, "Dominio no conectado · Tulala");
  assert.equal(es.cta, "Ir a tulala.digital");
  assert.match(es.bodyBefore, /^Si buscas una página de talento/);
  const en = hostUnregisteredCopy("en-GB,en;q=0.9");
  assert.equal(en.tabTitle, "Domain not connected · Tulala");
  assert.equal(en.cta, "Go to tulala.digital");
  assert.match(en.bodyBefore, /^If you're looking for a talent/);
  assert.doesNotMatch(JSON.stringify(en), /dominio|Ir a/i);
  assert.doesNotMatch(JSON.stringify(es), /This domain|Go to/);
});

test("TUL-877: the page picks the language from Accept-Language for both body and tab title", () => {
  const src = readFileSync(join(process.cwd(), "src/app/%5Fhost-unregistered/page.tsx"), "utf8");
  assert.match(src, /hostUnregisteredCopy\(h\.get\("accept-language"\)/);
  assert.match(src, /title: \(await copyForRequest\(\)\)\.tabTitle/);
  assert.match(src, /copy\.heading/);
  assert.match(src, /copy\.cta/);
});
