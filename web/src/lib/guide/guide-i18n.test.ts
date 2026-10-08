import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ADHOC_GUIDE_NODES } from "./adhoc-nodes";
import { guideCategory, guideStep, guideTitle, guidePurpose } from "./guide-i18n";
import { searchGuideTopics } from "./guide-search";

test("guide titles localize and fall back to the registry copy", () => {
  assert.equal(guideTitle("inquiry-workspace", "Inquiry workspace", "es"), "Espacio de la consulta");
  assert.equal(guideTitle("inquiry-workspace", "Inquiry workspace", "en"), "Inquiry workspace");
  assert.equal(guideTitle("no-such-node", "Fallback", "es"), "Fallback");
});
test("guide purposes and categories localize", () => {
  assert.match(guidePurpose("inquiry-workspace", "x", "es"), /Una sola hoja/);
  assert.equal(guideCategory("Money", "es"), "Dinero");
  assert.equal(guideCategory("Unknown area", "es"), "Unknown area");
});

// TUL-243 leftovers
test("schedule/hours article exists in en and es and 'horario' ranks it first", () => {
  const node = ADHOC_GUIDE_NODES["talent-schedule-hours"];
  assert.ok(node);
  const id = "talent-schedule-hours";
  const topics = [
    { nodeId: "talent-payouts", title: "Payouts", oneSentence: "How you get paid.", category: "Money" },
    {
      nodeId: id,
      title: guideTitle(id, node.shortTitle ?? "", "es"),
      oneSentence: guidePurpose(id, node.purpose, "es"),
      category: "Calendario",
    },
  ];
  assert.equal(guideTitle(id, "Schedule and hours", "es"), "Horario y disponibilidad");
  assert.equal(guideTitle(id, "Schedule and hours", "en"), "Schedule and hours");
  assert.match(guideStep(id, 0, node.youCanHere[0], "es"), /^Abre Disponibilidad/);
  assert.equal(guideStep(id, 0, node.youCanHere[0], "en"), node.youCanHere[0]);
  assert.equal(searchGuideTopics(topics, "horario")[0]?.nodeId, id);
  const all = JSON.stringify(node) + guideTitle(id, "", "es") + guidePurpose(id, "", "es");
  assert.ok(!all.includes("—"), "no em dashes");
});

test("GuideTab uses the ranker; profile hero hides an empty Trust heading", () => {
  const tab = readFileSync("src/components/support/GuideTab.tsx", "utf8");
  assert.match(tab, /searchGuideTopics\(topics, query, 8\)/);
  const hero = readFileSync("src/components/admin/shell/internal/talent/shared/profile-sections-1.tsx", "utf8");
  assert.match(hero, /p\.badges\.length > 0 \? <CapsLabel>\{copy\.t\("Trust"\)\}/);
});
