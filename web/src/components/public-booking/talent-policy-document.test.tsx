import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { PolicyPageModel } from "@/lib/talent-policies/public";
import { policyHomeLabel, TalentPolicyDocument, versionLine } from "./TalentPolicyDocument";

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

test("home link: en + es, next/link, no em dash (TUL-516 H1)", () => {
  assert.equal(policyHomeLabel("es"), "Volver al sitio");
  assert.equal(policyHomeLabel("en"), "Back to site");
  const es = renderToStaticMarkup(<TalentPolicyDocument model={base} homeHref="/" />);
  assert.match(es, /data-policy-home/);
  assert.match(es, /href="\/"/);
  assert.match(es, /Volver al sitio/);
  assert.equal(es.includes("—"), false);
  const en = renderToStaticMarkup(
    <TalentPolicyDocument model={{ ...base, locale: "en" } as PolicyPageModel} homeHref="/en" />,
  );
  assert.match(en, /Back to site/);
  assert.match(en, /href="\/en"/);
  const sheet = renderToStaticMarkup(<TalentPolicyDocument model={base} />);
  assert.equal(sheet.includes("data-policy-home"), false);
});
