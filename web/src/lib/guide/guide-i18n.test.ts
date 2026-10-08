import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { LEFTOVERS_ES_TEXT } from "@/components/admin/shell/internal/dashboard-i18n-leftovers";
import { ARRIVAL_THUMB_FRAME_NAME, isArrivalThumbFrame } from "@/components/edit-chrome/embedded-frame";
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

test("moved inline pair lives in the dashboard dictionary; arrival iframe is named and hides the chat pill (DS-44)", () => {
  assert.equal(LEFTOVERS_ES_TEXT["Your website is live"], "Tu sitio está en línea");
  const panel = readFileSync("src/components/admin/shell/internal/talent/pages/ProfileEditorPanel.tsx", "utf8");
  assert.ok(panel.includes('copy.t("Your website is live")'));
  const arrival = readFileSync("src/components/onboarding/steps/arrival-step.tsx", "utf8");
  assert.ok(arrival.includes("name={ARRIVAL_THUMB_FRAME_NAME}"));
  const launcher = readFileSync("src/app/t/[profileCode]/_chat/TalentProfileChatLauncher.tsx", "utf8");
  assert.ok(launcher.includes("isArrivalThumbFrame(window)"));
  assert.equal(isArrivalThumbFrame({ name: ARRIVAL_THUMB_FRAME_NAME }), true);
  assert.equal(isArrivalThumbFrame({ name: "" }), false);
  assert.equal(isArrivalThumbFrame(undefined), false);
});
