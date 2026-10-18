import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { Essentials, WeeklyEssentialHours } from "./essentials";
import { hoursSummary, reviewSetupLines } from "./review-setup-lines";

const nine = [{ startMin: 540, endMin: 1140 }];
const week: WeeklyEssentialHours = { "0": [], "1": nine, "2": nine, "3": nine, "4": nine, "5": nine, "6": [{ startMin: 600, endMin: 840 }] };
const e: Essentials = {
  name: "Ana", services: [{ name: "Limpieza profunda" } as Essentials["services"][number], { name: "Limpieza básica" } as Essentials["services"][number]],
  hours: week, timezone: "America/Cancun", place: { mode: "client", area: "Playa del Carmen" },
  firstProviderEmail: null, firstProviderName: null, ownerProvides: true, confirmed: true, source: "manual",
};

test("TUL-806: hours group consecutive days, 24h in Spanish", () => {
  assert.equal(hoursSummary(week, "es"), "Lun-Vie 09:00-19:00 · Sáb 10:00-14:00");
  assert.match(hoursSummary(week, "en") ?? "", /^Mon-Fri 9:00 AM-7:00 PM/);
});

test("TUL-806: review lines cover services, hours and place", () => {
  const lines = reviewSetupLines(e, "es");
  assert.deepEqual(lines.map((l) => l.id), ["services", "hours", "place", "timezone"]);
  assert.equal(lines[3].value, "Hora de Cancún");
  assert.equal(lines[3].raw, "America/Cancun");
  assert.equal(reviewSetupLines(e, "en")[3].value, "Cancún time");
  assert.equal(lines[0].value, "Limpieza profunda · Limpieza básica");
  assert.equal(lines[2].value, "Voy con el cliente, Playa del Carmen");
  assert.deepEqual(reviewSetupLines(null, "en"), []);
});

test("the ready step renders the setup lines", () => {
  const src = readFileSync(join(process.cwd(), "src/components/onboarding/steps/ready-step.tsx"), "utf8");
  assert.match(src, /onb-ready-setup-/);
});
