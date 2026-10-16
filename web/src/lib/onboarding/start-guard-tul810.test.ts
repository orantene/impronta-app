import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { EssentialsStep } from "@/components/onboarding/steps/essentials-step";
import type { Understanding, UnderstoodLine } from "@/lib/onboarding/understanding";

type Msgs = Record<string, unknown>;
const load = (l: string): Msgs => JSON.parse(readFileSync(join(process.cwd(), `messages/${l}.json`), "utf8"));
const lookup = (m: Msgs) => (key: string): string => {
  const v = key.split(".").reduce<unknown>((o, k) => (o as Msgs | undefined)?.[k], m);
  return typeof v === "string" ? v : key;
};
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");

const line = (id: UnderstoodLine["id"], value: string): UnderstoodLine => ({
  id, factKey: `f.${id}`, labelKey: `public.onboarding.lines.${id}`, value, status: "known", source: null, confidence: null, edit: { kind: "inline" },
});
const understanding = (path: Understanding["path"], lines: UnderstoodLine[]): Understanding => ({
  path, pathConfidence: "clear", pathSource: "words", lines, followUps: [], typeChip: null, linkName: null, tooLittle: false,
});

function render(locale: "en" | "es", u: Understanding) {
  return renderToStaticMarkup(createElement(EssentialsStep, { t: lookup(load(locale)), locale, understanding: u, chip: null, busy: false, error: null, onSave: () => {} }));
}
const inputTag = (html: string, testId: string) => html.match(new RegExp(`<input[^>]*data-testid="${testId}"[^>]*>`))?.[0] ?? null;

for (const locale of ["es", "en"] as const) {
  const t = lookup(load(locale));

  test(`TUL-810 (${locale}): a solo pro gets a business-name field apart from 'your name', with different labels`, () => {
    const html = render(locale, understanding("talent", [line("name", "Ana Ruiz"), line("businessName", "Ana Cleaning Co")]));
    const name = inputTag(html, "onb-name-input");
    const biz = inputTag(html, "onb-business-name-input");
    assert.ok(name && biz, "both inputs render");
    assert.notEqual(name, biz);
    assert.match(name, /name="onb-name"/);
    assert.match(biz, /name="onb-business-name"/);
    assert.match(name, /value="Ana Ruiz"/);
    assert.match(biz, /value="Ana Cleaning Co"/);
    assert.ok(html.includes(esc(t("public.onboarding.essentials.yourName"))));
    assert.ok(html.includes(esc(t("public.onboarding.essentials.soloBusinessName"))));
    assert.notEqual(t("public.onboarding.essentials.yourName"), t("public.onboarding.essentials.soloBusinessName"));
  });

  test(`TUL-810 (${locale}): the business name is not prefilled from the person's name`, () => {
    const html = render(locale, understanding("talent", [line("name", "Ana Ruiz")]));
    assert.match(inputTag(html, "onb-business-name-input") ?? "", /value=""/);
    assert.doesNotMatch(inputTag(html, "onb-business-name-input") ?? "", /Ana Ruiz/);
  });

  test(`TUL-810 (${locale}): a studio gets one name field (the business), no solo business field`, () => {
    const html = render(locale, understanding("business", [line("businessName", "Casa Luz")]));
    assert.ok(inputTag(html, "onb-name-input"));
    assert.equal(inputTag(html, "onb-business-name-input"), null);
    assert.ok(html.includes(esc(t("public.onboarding.essentials.businessName"))));
  });
}
