import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import type { Essentials } from "./essentials";
import type { Understanding, UnderstoodLine } from "./understanding";
import { understandingWithSavedEssentials } from "./understanding-essentials";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const line = (id: string, status: UnderstoodLine["status"] = "missing", value: string | null = null): UnderstoodLine =>
  ({ id, labelKey: `k.${id}`, factKey: id, value, status, edit: { kind: "none" } }) as unknown as UnderstoodLine;
const card = (lines: UnderstoodLine[]): Understanding => ({ lines }) as unknown as Understanding;
const essentials: Essentials = {
  name: "Valeria",
  services: [{ name: "Limpieza profunda", durationMin: 60, priceCents: 0 } as unknown as Essentials["services"][number]],
  hours: { "1": [{ startMin: 540, endMin: 1020 }], "2": [], "3": [], "4": [], "5": [], "6": [], "0": [] } as unknown as Essentials["hours"],
  place: { mode: "client", area: null },
  timezone: "America/Cancun",
} as unknown as Essentials;

test("TUL-1822: the card in memory is patched with what step 3 saved (services, hours, where)", () => {
  const out = understandingWithSavedEssentials(card([line("offer"), line("hours"), line("city")]), essentials, "es");
  const by = Object.fromEntries(out.lines.map((l) => [l.id, l]));
  assert.equal(by.offer.value, "Limpieza profunda");
  assert.equal(by.hours.status, "known");
  assert.ok(by.hours.value?.includes("Lun"), by.hours.value ?? "");
  assert.equal(by.city.status, "known");
  assert.equal(by.city.value, "Voy con el cliente", "no area typed: the place mode answers 'where'");
});

test("TUL-1822: a typed area wins, a line with a value is left alone, nothing saved changes nothing", () => {
  const withArea = { ...essentials, place: { mode: "studio", area: "Playa del Carmen" } } as Essentials;
  assert.equal(understandingWithSavedEssentials(card([line("city")]), withArea, "es").lines[0].value, "Playa del Carmen");
  const known = card([line("city", "known", "Tulum")]);
  assert.equal(understandingWithSavedEssentials(known, withArea, "es"), known);
  const empty = card([line("city")]);
  assert.equal(understandingWithSavedEssentials(empty, null, "es"), empty);
});

test("TUL-1822: the wizard feeds the understood and review cards the confirmed essentials", () => {
  const mod = read("src/components/onboarding/onboarding-module.tsx");
  assert.equal((mod.match(/understandingWithSavedEssentials\(state\.understanding, confirmedSetup, locale\)/g) ?? []).length, 2);
  const hook = read("src/components/onboarding/use-setup-data.ts");
  assert.match(hook, /setupData\?\.saved \? setupData\.essentials : null/);
});

test("TUL-1847: the review checkbox saves on every tick and opens ticked after a reload or Back", () => {
  const ready = read("src/components/onboarding/steps/ready-step.tsx");
  assert.match(ready, /useState\(age18Ticked\)/);
  assert.match(ready, /onAge18Change\?\.\(e\.target\.checked\)/);
  const mod = read("src/components/onboarding/onboarding-module.tsx");
  assert.match(mod, /age18Ticked=\{ageConfirmed\}/);
  assert.match(mod, /void saveOnboardingAge18\(\{ ticked \}\)/);
  const action = read("src/lib/server-actions/onboarding-module.ts");
  assert.match(action, /saveOnboardingAge18\(input: \{ ticked\?: boolean \} = \{\}\)/);
  assert.match(action, /age18ConfirmedAt: null, age18ConfirmedBy: null/);
});

test("TUL-812: the module waits for the resume lookup before it names a step in the URL", () => {
  const mod = read("src/components/onboarding/onboarding-module.tsx");
  assert.match(mod, /const stepAttr = !resumeChecked \? "loading"/);
  const flow = read("src/components/onboarding/start-flow.tsx");
  assert.doesNotMatch(flow, /pushState\(window\.history\.state/);
  assert.doesNotMatch(flow, /replaceState\(window\.history\.state/);
});

test("the onboarding module stays under the 800-line cap", () => {
  assert.ok(read("src/components/onboarding/onboarding-module.tsx").split("\n").length <= 800);
});
