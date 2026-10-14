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

test("E3-J8-policies: Tulala doc links read as labelled links, never raw URLs", () => {
  for (const [locale, body, labels] of [
    ["es", "Se manejan a través de Tulala. Términos: https://tulala.digital/legal/terms Privacidad: https://tulala.digital/legal/privacy", ["Términos", "Privacidad"]],
    ["en", "Handled through Tulala. Terms: https://tulala.digital/legal/terms Privacy: https://tulala.digital/legal/privacy", ["Terms", "Privacy"]],
  ] as const) {
    const m = { ...base, locale, clauses: [{ n: 1, title: "T", body }] } as PolicyPageModel;
    const html = renderToStaticMarkup(<TalentPolicyDocument model={m} />);
    assert.match(html, new RegExp(`href="https://tulala.digital/legal/terms"[^>]*>${labels[0]}</a>`));
    assert.match(html, new RegExp(`href="https://tulala.digital/legal/privacy"[^>]*>${labels[1]}</a>`));
    assert.equal(/>https?:\/\//.test(html), false, "no visible scheme");
    assert.equal(html.includes(`${labels[0]}: `), false, "label is the link, not a prefix");
    assert.match(html, new RegExp(`>${labels[0]}</a> · <a`), "adjacent labelled links get a separator");
  }
  const bare = { ...base, clauses: [{ n: 1, title: "T", body: "Ver https://example.com/x/ hoy." }] } as PolicyPageModel;
  const html = renderToStaticMarkup(<TalentPolicyDocument model={bare} />);
  assert.match(html, /href="https:\/\/example.com\/x\/"[^>]*>example.com\/x<\/a> hoy\./);
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

test("E3-J8-policies: Tulala's terms and privacy read as named links, Spanish pages open the /es/ copy", () => {
  const body = "Los datos personales y los pagos se manejan a través de Tulala. Términos: https://tulala.digital/legal/terms Privacidad: https://tulala.digital/legal/privacy";
  const es = renderToStaticMarkup(
    <TalentPolicyDocument model={{ ...base, clauses: [{ n: 1, title: "Quién los maneja", body }] } as PolicyPageModel} />,
  );
  assert.ok(!es.includes(">https://"), "no raw URL as link text");
  assert.match(es, /a través de Tulala\. <a href="https:\/\/tulala\.digital\/es\/legal\/terms"[^>]*>Términos de Tulala<\/a> · <a href="https:\/\/tulala\.digital\/es\/legal\/privacy"[^>]*>Privacidad de Tulala<\/a>/);

  const enBody = "Personal data and payments are handled through Tulala. Terms: https://tulala.digital/legal/terms Privacy: https://tulala.digital/legal/privacy";
  const en = renderToStaticMarkup(
    <TalentPolicyDocument model={{ ...base, locale: "en", clauses: [{ n: 1, title: "Who handles them", body: enBody }] } as PolicyPageModel} />,
  );
  assert.match(en, /through Tulala\. <a href="https:\/\/tulala\.digital\/legal\/terms"[^>]*>Tulala Terms<\/a> · <a href="https:\/\/tulala\.digital\/legal\/privacy"[^>]*>Tulala Privacy<\/a>/);

  const other = renderToStaticMarkup(
    <TalentPolicyDocument model={{ ...base, clauses: [{ n: 1, title: "Más", body: "Ver https://example.com/x" }] } as PolicyPageModel} />,
  );
  assert.match(other, /Ver <a href="https:\/\/example\.com\/x"[^>]*>https:\/\/example\.com\/x<\/a>/);
});
