import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * F23 / F53: every surface that shows the free-website state must get it from
 * useWebsiteFlow (one resolver, one shared activation store). Today once read
 * "ready" while Inbox read "preview" on the same account because surfaces
 * fetched and derived the state on their own.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const SURFACES = {
  pill: "src/components/talent/website-reward/WebsiteRewardControl.tsx",
  todayHero: "src/components/talent/website-reward/WebsiteTodayHero.tsx",
  todayUnlock: "src/components/talent/website-reward/WebsiteTodayUnlockCard.tsx",
  myPresence: "src/components/talent/studio/WebsiteEligibilityPanel.tsx",
  agendaToday: "src/components/admin/shell/internal/talent/agenda/AgendaTodayPage.tsx",
  classicToday: "src/components/admin/shell/internal/talent/pages/TodayPage.tsx",
};

test("state surfaces read useWebsiteFlow, never their own activation fetch or legacy state", () => {
  for (const [name, path] of Object.entries(SURFACES)) {
    const src = read(path);
    assert.doesNotMatch(src, /loadTalentSiteActivationStateAction/, `${name} fetches activation itself`);
    assert.doesNotMatch(src, /loadMaisonResumeCardAction|MaisonWebsiteResumeCard/, `${name} uses setup_choices`);
    assert.doesNotMatch(src, /websiteRewardState\(/, `${name} derives the legacy reward state`);
  }
  for (const name of ["pill", "todayHero", "todayUnlock", "myPresence"] as const) {
    assert.match(read(SURFACES[name]), /useWebsiteFlow\(\)/, `${name} must use useWebsiteFlow`);
  }
});

test("both Today data paths mount the flow-driven website card", () => {
  const agenda = read(SURFACES.agendaToday);
  assert.match(agenda, /<WebsiteSetupToday /, "first-day Today");
  assert.match(agenda, /<WebsiteTodayHero /, "populated Today");
  assert.match(read(SURFACES.classicToday), /<WebsiteTodayHero /, "classic Today");
});

test("the flow hook shares ONE activation store and keeps the last good value", () => {
  const hook = read("src/components/talent/website-reward/useWebsiteFlow.ts");
  assert.equal((hook.match(/loadTalentSiteActivationStateAction\(/g) ?? []).length, 1);
  assert.match(hook, /if \(next\) storeValue = next;/);
  assert.match(hook, /storeInFlight/);
});

test("the pill renders a neutral placeholder while websiteFlowPending", () => {
  const pill = read(SURFACES.pill);
  assert.match(pill, /websiteFlowPending\(percent, flow\.loaded\)/);
  assert.match(pill, /\{pending \? \(/);
  assert.match(pill, /data-testid="website-reward-pending"/);
});
