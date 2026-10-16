import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { UnderstoodStep } from "@/components/onboarding/steps/understood-step";
import type { Understanding, UnderstoodLine } from "@/lib/onboarding/understanding";

type Msgs = Record<string, unknown>;
const load = (l: string): Msgs => JSON.parse(readFileSync(join(process.cwd(), `messages/${l}.json`), "utf8"));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
const lookup = (m: Msgs) => (key: string): string => {
  const v = key.split(".").reduce<unknown>((o, k) => (o as Msgs | undefined)?.[k], m);
  return typeof v === "string" ? v : key;
};

const line = (id: UnderstoodLine["id"], value: string | null): UnderstoodLine => ({
  id,
  factKey: `f.${id}`,
  labelKey: `public.onboarding.lines.${id}`,
  value,
  status: value ? "known" : "missing",
  source: null,
  confidence: null,
  edit: { kind: "inline" },
});

const understanding = (values: Array<string | null>): Understanding => ({
  path: "talent",
  pathConfidence: "clear",
  pathSource: "words",
  lines: values.map((v, i) => line((["person.name", "work.industry", "work.services"] as const)[i % 3] as UnderstoodLine["id"], v)),
  followUps: [],
  typeChip: null,
  linkName: null,
  tooLittle: true,
});

function render(locale: "en" | "es", error: Parameters<typeof UnderstoodStep>[0]["error"], values: Array<string | null>) {
  return renderToStaticMarkup(
    createElement(UnderstoodStep, {
      t: lookup(load(locale)),
      understanding: understanding(values),
      locale,
      fromLink: false,
      busy: false,
      error,
      onEdit: async () => {},
      onAskMe: () => {},
      onAccept: () => {},
      onChangePath: () => {},
    }),
  );
}

for (const locale of ["es", "en"] as const) {
  const raw = lookup(load(locale));
  const m = (k: string) => esc(raw(k));
  const heading = m("public.onboarding.understood.title");
  const failedTitle = m("public.onboarding.understood.titleFailed");

  test(`TUL-801 (${locale}): AI failure with nothing understood hides the 'what I understood' card`, () => {
    for (const err of ["ai_failed", "ai_off", "ai_not_configured", "failed", "rate_limit", "import_failed"] as const) {
      const html = render(locale, err, [null, null, null]);
      assert.ok(!html.includes(heading), `${err}: heading must be hidden`);
      assert.ok(html.includes(failedTitle), `${err}: failed title shown`);
      assert.ok(!html.includes('data-testid="onb-lines"'), `${err}: lines list hidden`);
      assert.ok(html.includes(m("public.onboarding.understood.continueManual")), `${err}: manual CTA`);
      assert.ok(!html.includes(m("public.onboarding.understood.looksGood")), `${err}: no Looks good`);
    }
  });

  test(`TUL-801 (${locale}): a successful read still shows the card and 'Looks good'`, () => {
    const html = render(locale, null, ["Ana", "Cleaning", null]);
    assert.ok(html.includes(heading));
    assert.ok(html.includes('data-testid="onb-lines"'));
    assert.ok(html.includes(m("public.onboarding.understood.looksGood")));
  });

  test(`TUL-801 (${locale}): a failure with something understood keeps the card`, () => {
    const html = render(locale, "ai_failed", ["Ana", null, null]);
    assert.ok(html.includes(heading));
    assert.ok(html.includes('data-testid="onb-lines"'));
  });
}
