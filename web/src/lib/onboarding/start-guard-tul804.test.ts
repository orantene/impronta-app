import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DesignPick } from "@/components/onboarding/steps/design-pick";
import { StyleStep } from "@/components/onboarding/steps/style-step";
import { designLooksForCategory } from "@/lib/onboarding/finish-url";
import { VISUAL_DIRECTIONS } from "@/lib/onboarding/module-state";

type Msgs = Record<string, unknown>;
const load = (l: string): Msgs => JSON.parse(readFileSync(join(process.cwd(), `messages/${l}.json`), "utf8"));
const lookup = (m: Msgs) => (key: string): string => {
  const v = key.split(".").reduce<unknown>((o, k) => (o as Msgs | undefined)?.[k], m);
  return typeof v === "string" ? v : key;
};

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, siete: 7, seven: 7, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5 };
/** Every count the copy states ("3 looks", "tres estilos"). */
function statedCounts(text: string): number[] {
  const out: number[] = [];
  for (const w of text.toLowerCase().match(/[a-záéíóú]+|\d+/g) ?? []) {
    if (/^\d+$/.test(w)) out.push(Number(w));
    else if (w in WORDS) out.push(WORDS[w]!);
  }
  return out;
}
const radios = (html: string, testIdPrefix: string) => (html.match(new RegExp(`data-testid="${testIdPrefix}-[a-z]+"`, "g")) ?? []).filter((x) => !x.includes("keep") && !x.includes("continue") && !x.includes("notes"));

for (const locale of ["es", "en"] as const) {
  const t = lookup(load(locale));

  test(`TUL-804 (${locale}): the look picker shows exactly the looks it offers, and its copy states no other count`, () => {
    for (const category of [null, "Hair salon", "Cleaning", "Photographer", "Peluquería"]) {
      const looks = designLooksForCategory(category);
      const html = renderToStaticMarkup(createElement(DesignPick, { t, value: null, onPick: () => {}, category }));
      assert.equal(radios(html, "onb-design").length, looks.length, `${category}: tiles shown == looks offered`);
      const copy = `${t("public.onboarding.design.title")} ${t("public.onboarding.design.sub")}`;
      for (const n of statedCounts(copy)) assert.equal(n, looks.length, `${category}: copy says ${n}`);
    }
  });

  test(`TUL-804 (${locale}): the style step shows every direction and its copy states no other count`, () => {
    const html = renderToStaticMarkup(createElement(StyleStep, { t, initial: null, busy: false, onChoose: () => {} }));
    assert.equal(radios(html, "onb-style").length, VISUAL_DIRECTIONS.length);
    const copy = `${t("public.onboarding.style.title")} ${t("public.onboarding.style.sub")}`;
    for (const n of statedCounts(copy)) assert.equal(n, VISUAL_DIRECTIONS.length);
  });
}
