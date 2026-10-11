import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DOMAIN_ERRORS_ES_TEXT, translateDomainActionText } from "./dashboard-i18n-domain-errors";

const es = (value: string) => DOMAIN_ERRORS_ES_TEXT[value] ?? value;
const here = dirname(fileURLToPath(import.meta.url));
const actions = readFileSync(
  join(here, "../../../../lib/talent-site/server/talent-site-domain-actions.ts"),
  "utf8",
);

test("a removed-domain message reads in Spanish with the domain kept", () => {
  assert.equal(translateDomainActionText("jorgelina.com was removed.", es), "Quitamos jorgelina.com.");
});

test("the DNS-ready message keeps its Vercel hint, both in Spanish", () => {
  const out = translateDomainActionText(
    "DNS instructions are ready for a.mx. Add the records below to verify it. Vercel provisioning is not configured yet; finish DNS and re-check after env setup.",
    es,
  );
  assert.equal(
    out,
    "Las instrucciones DNS ya están listas para a.mx. Agrega los registros de abajo para verificarlo. La conexión con Vercel aún no está lista. Termina el DNS y vuelve a revisar más tarde.",
  );
});

test("plain messages still go through the dictionary", () => {
  assert.equal(translateDomainActionText("That domain could not be saved.", es), "No pudimos guardar ese dominio.");
});

test("every message the domain actions build with ${domain} has a Spanish template", () => {
  const built = [...actions.matchAll(/(?:message|error): `([^`]*\$\{domain\}[^`]*)`/g)].map((m) =>
    m[1]!.replace("${domain}", "{domain}").replace("${vercelHint}", ""),
  );
  assert.ok(built.length >= 10, `expected the action messages, found ${built.length}`);
  for (const template of built) {
    assert.ok(DOMAIN_ERRORS_ES_TEXT[template], `no Spanish for: ${template}`);
  }
});
