import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { DOMAIN_ERRORS_ES_TEXT, translateDomainActionText } from "./dashboard-i18n-domain-errors";
import { hubLandingCopy } from "@/components/home/hub-landing-copy";

const es = (value: string) => DOMAIN_ERRORS_ES_TEXT[value] ?? value;
const root = process.cwd();

// Every sentence admin/settings/domain-actions.ts can put in ?derr= / ?dmsg=
// must have a Spanish row, or /es renders English (Verificar ahora, 2026-10-21).
test("every domain-actions message has an ES row", () => {
  const src = readFileSync(path.join(root, "src/app/(workspace)/[tenantSlug]/admin/settings/domain-actions.ts"), "utf8");
  const missing: string[] = [];
  for (const m of src.matchAll(/`([^`]*)`|"((?:[^"\\\n]|\\.)*)"/g)) {
    let text = (m[1] ?? m[2] ?? "").replaceAll("${hostname}", "{domain}");
    // Appended hint, translated on its own row.
    text = text.replace("${vercelProvisioningHint}", "");
    if (!text.includes(" ") || !text.trimEnd().endsWith(".")) continue;
    if (text.includes("${") || /^(Set|Custom domain|Removed|Connected|Verified)/.test(text)) continue;
    const key = text.trim();
    if (!(key in DOMAIN_ERRORS_ES_TEXT)) missing.push(key);
  }
  assert.deepEqual(missing, []);
});

test("derr text with appended Vercel hints translates both halves", () => {
  const out = translateDomainActionText(
    "DNS instructions are ready for a.mx. Add the TXT record to verify it. DNS token is ready, but Vercel project provisioning needs attention.",
    es,
  );
  assert.equal(
    out,
    "Las instrucciones DNS ya están listas para a.mx. Agrega el registro TXT para verificarlo. El token DNS está listo, pero la conexión con el proyecto de Vercel necesita atención.",
  );
  assert.equal(
    translateDomainActionText("TXT record for a.mx still has not been found. You can add it now and check again, or reconnect the domain for a fresh token.", es).startsWith("Todavía no encontramos"),
    true,
  );
  assert.equal(translateDomainActionText("a.mx is now the primary public URL.", es), "a.mx ahora es la dirección pública principal.");
});

test("WebsiteDomainManager maps the query text through translateDomainActionText", () => {
  const src = readFileSync(path.join(root, "src/components/admin/shell/internal/page-modules/WebsiteDomainManager.tsx"), "utf8");
  assert.match(src, /translateDomainActionText\(err, copy\.t\)/);
  assert.match(src, /translateDomainActionText\(ok, copy\.t\)/);
});

test("hub landing chrome has en and es copy", () => {
  const en = hubLandingCopy("en");
  const sp = hubLandingCopy("es");
  for (const k of ["heroTitle", "tagline", "noAgencies", "featuredOnHub", "searchAgencies", "noMatches"] as const) {
    assert.ok(en[k].length > 0 && sp[k].length > 0);
    assert.notEqual(en[k], sp[k]);
  }
  assert.equal(sp.metaTitle("Tulala"), "Agencias en la plataforma · Tulala");
  assert.equal(hubLandingCopy("es-MX").heroTitle, sp.heroTitle);
  assert.equal(hubLandingCopy(undefined).heroTitle, en.heroTitle);
});
