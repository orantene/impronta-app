import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { PolicyPageModel } from "@/lib/talent-policies/public";
import { TalentPolicyDocument, versionLine } from "./TalentPolicyDocument";

const base: PolicyPageModel = {
  doc: "booking",
  locale: "es",
  title: "Políticas de reserva",
  clauses: [{ n: 1, title: "Cambios", body: "Avísame con 24 horas." }],
  version: null,
  publishedAt: null,
  isDefault: true,
} as PolicyPageModel;

test("the platform default never admits the talent has not published policies", () => {
  for (const locale of ["es", "en"]) {
    const m = { ...base, locale } as PolicyPageModel;
    assert.equal(versionLine(m), null);
    const html = renderToStaticMarkup(<TalentPolicyDocument model={m} />);
    assert.ok(!/aún no publicó|not published/i.test(html));
    assert.ok(html.includes("Avísame"));
  }
});

test("a published policy keeps its version line", () => {
  assert.match(versionLine({ ...base, isDefault: false, version: 3, publishedAt: "2026-01-02T00:00:00Z" } as PolicyPageModel) ?? "", /Versión 3/);
});
