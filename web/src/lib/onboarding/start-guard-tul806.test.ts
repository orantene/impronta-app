import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ReadyStep } from "@/components/onboarding/steps/ready-step";
import type { Essentials, WeeklyEssentialHours } from "@/lib/onboarding/essentials";
import { reviewSetupLines } from "@/lib/onboarding/review-setup-lines";
import type { Understanding, UnderstoodLine } from "@/lib/onboarding/understanding";

type Msgs = Record<string, unknown>;
const lookup = (l: string) => {
  const m = JSON.parse(readFileSync(join(process.cwd(), `messages/${l}.json`), "utf8")) as Msgs;
  return (key: string): string => {
    const v = key.split(".").reduce<unknown>((o, k) => (o as Msgs | undefined)?.[k], m);
    return typeof v === "string" ? v : key;
  };
};
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");

const nine = [{ startMin: 540, endMin: 1140 }];
const week: WeeklyEssentialHours = { "0": [], "1": nine, "2": nine, "3": nine, "4": nine, "5": nine, "6": [] };
const essentials = (place: Essentials["place"]): Essentials => ({
  name: "Ana",
  services: [{ name: "Limpieza profunda" }, { name: "Limpieza basica" }] as Essentials["services"],
  hours: week, timezone: "America/Cancun", place,
  firstProviderEmail: null, firstProviderName: null, ownerProvides: true, confirmed: true, source: "manual",
});

const briefLine = (id: UnderstoodLine["id"], value: string): UnderstoodLine => ({
  id, factKey: `f.${id}`, labelKey: `public.onboarding.lines.${id}`, value, status: "known", source: null, confidence: null, edit: { kind: "none" },
});
const understanding: Understanding = {
  path: "talent", pathConfidence: "clear", pathSource: "words",
  lines: [briefLine("name", "Ana"), briefLine("services", "STALE BRIEF SERVICES"), briefLine("hours", "STALE BRIEF HOURS")],
  followUps: [], typeChip: null, linkName: null, tooLittle: false,
};

function review(locale: "en" | "es", e: Essentials | null) {
  return renderToStaticMarkup(
    createElement(ReadyStep, {
      t: lookup(locale), understanding, path: "talent", linkSlug: null, linkAvailable: null, linkSuggestions: [], busy: false,
      onCheckLink: async () => null, onBuild: () => {}, setupLines: reviewSetupLines(e, locale),
    }),
  );
}

for (const locale of ["es", "en"] as const) {
  test(`TUL-806 (${locale}): the review step lists services, hours and work location from step 3`, () => {
    const html = review(locale, essentials({ mode: "client", area: "Playa del Carmen" }));
    for (const id of ["services", "hours", "place", "timezone"]) assert.ok(html.includes(`data-testid="onb-ready-setup-${id}"`), `${id} row`);
    assert.ok(html.includes("Limpieza profunda") && html.includes("Limpieza basica"));
    assert.ok(html.includes("Playa del Carmen"));
    assert.ok(html.includes(esc(locale === "es" ? "Voy con el cliente" : "I go to the client")));
    assert.ok(html.includes(locale === "es" ? "Lun-Vie 09:00-19:00" : "Mon-Fri 9:00 AM-7:00 PM"));
  });

  test(`TUL-806 (${locale}): step 3 replaces the older brief lines for services and hours`, () => {
    const html = review(locale, essentials({ mode: "studio", area: null }));
    assert.ok(!html.includes("STALE BRIEF SERVICES") && !html.includes("STALE BRIEF HOURS"));
    assert.ok(html.includes(">Ana<"), "other brief facts stay");
  });

  test(`TUL-806 (${locale}): with no saved setup the brief lines still show and no setup rows render`, () => {
    const html = review(locale, null);
    assert.ok(!html.includes("onb-ready-setup-"));
    assert.ok(html.includes("STALE BRIEF SERVICES"));
  });
}

test("TUL-806: the review step loads the saved setup itself (refresh on the review) and links each row back to step 3", () => {
  const mod = readFileSync(join(process.cwd(), "src/components/onboarding/onboarding-module.tsx"), "utf8");
  assert.match(mod, /state\.step !== "setup" && state\.step !== "readyToBuild"/);
  assert.match(mod, /onEditSetup=/);
  const html = renderToStaticMarkup(
    createElement(ReadyStep, {
      t: lookup("es"), understanding, path: "talent", linkSlug: null, linkAvailable: null, linkSuggestions: [], busy: false,
      onCheckLink: async () => null, onBuild: () => {}, onEditSetup: () => {}, setupLines: reviewSetupLines(essentials({ mode: "client", area: "Playa" }), "es"),
    }),
  );
  for (const id of ["services", "hours", "place"]) assert.ok(html.includes(`data-testid="onb-ready-edit-${id}"`), id);
  assert.ok(html.includes(">Editar<"));
});
