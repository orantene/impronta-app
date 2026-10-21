/**
 * TUL-1356: every PAID talent, hub talents included, reaches the in-app plan card with cancel
 * and resume. The card loads its own data (`loadTalentPlanSummary` is session-scoped), so
 * the plan row in Settings must not depend on `bridgeTalentSelfProfile`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { TALENT_CANCEL_COPY, fillDate, pickCopy, talentPlanCancelBlock } from "./talent-cancel";

const web = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

type Sub = { status: string; cancelAtPeriodEnd: boolean };
const sub = (over: Partial<Sub> = {}): Sub => ({ status: "active", cancelAtPeriodEnd: false, ...over });

test("(a) a paid plan with an active subscription shows cancel", () => {
  assert.equal(talentPlanCancelBlock("talent_web_office", sub()), "cancel");
  assert.equal(talentPlanCancelBlock("talent_web_office", sub({ status: "trialing" })), "cancel");
  assert.equal(talentPlanCancelBlock("talent_web_office", sub({ status: "past_due" })), "cancel");
});

test("(b) a subscription that ends at period end shows resume and the ends banner", () => {
  assert.equal(talentPlanCancelBlock("talent_web_office", sub({ cancelAtPeriodEnd: true })), "resume");
  assert.equal(pickCopy(TALENT_CANCEL_COPY.resumeCta, true), "Reanudar plan");
  const banner = fillDate(pickCopy(TALENT_CANCEL_COPY.endsBanner, true), "5 de noviembre de 2026");
  assert.match(banner, /termina el/i);
  assert.match(banner, /5 de noviembre de 2026/);
});

test("(c) a free talent, or one with no live subscription, shows neither cancel nor resume", () => {
  assert.equal(talentPlanCancelBlock("talent_basic", sub()), "none");
  assert.equal(talentPlanCancelBlock("talent_basic", sub({ cancelAtPeriodEnd: true })), "none");
  assert.equal(talentPlanCancelBlock("talent_web_office", null), "none");
  assert.equal(talentPlanCancelBlock("talent_web_office", sub({ status: "canceled" })), "none");
  assert.equal(talentPlanCancelBlock("talent_web_office", sub({ status: "incomplete_expired" })), "none");
  assert.equal(talentPlanCancelBlock(undefined, sub()), "none");
});

test("the plan card asks the one rule instead of re-deriving it", () => {
  assert.match(web("src/app/(workspace)/[tenantSlug]/talent/settings/TalentPlanCard.tsx"), /talentPlanCancelBlock\(/);
});

test("(d) Settings: the Plan row always unfolds the plan card, hub talents included", () => {
  const src = web("src/components/admin/shell/internal/talent/pages/SettingsPage.tsx");
  const start = src.indexOf('key: "plan"');
  assert.ok(start > 0, "plan row exists");
  const row = src.slice(start - 40, src.indexOf("key: \"help\""));
  assert.match(row, /<TalentPlanCard/);
  assert.match(row, /openDrawer\("talent-tier-compare"\)/, "the card still offers Compare plans");
  assert.equal((src.match(/key: "plan"/g) ?? []).length, 1, "one Plan row, no compare-only twin");
  assert.doesNotMatch(src, /bridgeTalentSelfProfile\s*\?\s*\{\s*key: "plan"/, "the plan row is not gated on the self-profile bridge");
});
