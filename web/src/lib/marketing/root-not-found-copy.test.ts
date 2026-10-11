import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { rootNotFoundCopy, rootNotFoundLang } from "./root-not-found-copy";

test("the request locale picks the language; anything but Spanish is English", () => {
  assert.equal(rootNotFoundLang("es"), "es");
  assert.equal(rootNotFoundLang("es-MX"), "es");
  assert.equal(rootNotFoundLang("en"), "en");
  assert.equal(rootNotFoundLang(""), "en");
  assert.equal(rootNotFoundLang(null), "en");
});

test("/es pages that call notFound() answer in Spanish (Tulala and agency variants)", () => {
  const tulala = rootNotFoundCopy("es", null);
  assert.equal(tulala.heading, "Página no encontrada");
  assert.deepEqual([tulala.primary.label, tulala.secondary.label], ["Ir al inicio", "Iniciar sesión"]);
  const agency = rootNotFoundCopy("es", "Estudio Luna");
  assert.equal(agency.heading, "Esta página ya no está aquí");
  assert.match(agency.body, /Estudio Luna/);
  assert.equal(agency.secondary.href, "/client/inquiries/new");
});

test("English copy is unchanged", () => {
  assert.equal(rootNotFoundCopy("en", null).heading, "Page not found");
  assert.equal(rootNotFoundCopy("en", "Studio").heading, "This page is no longer here");
  assert.equal(rootNotFoundCopy("en", "Studio").poweredBy, "Powered by Tulala");
});

test("the root not-found renders this copy, not hardcoded English", () => {
  const page = readFileSync(path.join(process.cwd(), "src/app/not-found.tsx"), "utf8");
  assert.match(page, /rootNotFoundCopy\(rootNotFoundLang\(await getRequestLocale\(\)\)/);
  assert.doesNotMatch(page, /"Page not found"/);
});
