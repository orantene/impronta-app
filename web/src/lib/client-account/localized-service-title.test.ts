import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { localizedServiceTitle } from "./localized-service-title";

const off = { title: "Haircut", title_i18n: { en: "Haircut", es: "Corte de cabello" } };

test("TUL-975: an ES page uses the service's ES title", () => {
  assert.equal(localizedServiceTitle(off, "es", "Haircut"), "Corte de cabello");
  assert.equal(localizedServiceTitle(off, "es-MX", "Haircut"), "Corte de cabello");
});

test("TUL-975: an EN page, or a service with no ES title, keeps the stored name", () => {
  assert.equal(localizedServiceTitle(off, "en", "Haircut"), "Haircut");
  assert.equal(localizedServiceTitle({ title: "Balayage", title_i18n: { en: "Balayage" } }, "es", "Balayage"), "Balayage");
  assert.equal(localizedServiceTitle(null, "es", "Haircut"), "Haircut");
  assert.equal(localizedServiceTitle({ title: "X", title_i18n: null }, "es", "Stored"), "Stored");
});

test("TUL-975: the client visit page asks for the page locale", () => {
  const data = readFileSync(new URL("./area-data.server.ts", import.meta.url), "utf8");
  assert.match(data, /localizedServiceTitle\(/);
  assert.match(data, /loadVisitDetail\(userId: string, tenantId: string, visitId: string, locale = "en"\)/);
  for (const f of ["./render-area.tsx", "./render-tenant-area.tsx"]) {
    assert.match(readFileSync(new URL(f, import.meta.url), "utf8"), /loadVisitDetail\(userId, tenantId, view\.id, locale\)/);
  }
});
