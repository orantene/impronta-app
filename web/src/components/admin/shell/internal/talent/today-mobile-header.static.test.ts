/**
 * TUL-950 — at 390px the Talent Studio page header must not slide under the
 * top bar, and Today row names wrap instead of truncating to "QA Cli...".
 *
 *   cd web && npx tsx --test src/components/admin/shell/internal/talent/today-mobile-header.static.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(process.cwd(), "src/components/admin/shell/internal");

test("mobile page header pulls back by the 14px main padding, not 28px", () => {
  const src = readFileSync(join(root, "talent/shared/page-chrome-1.tsx"), "utf8");
  assert.match(src, /margin: -14px -14px 16px !important/);
  assert.doesNotMatch(src, /margin: -28px -28px/);
});

test("Today appointment names wrap (line-clamp-2) instead of truncating", () => {
  const src = readFileSync(join(root, "talent/agenda/AgendaTodayPage.tsx"), "utf8");
  assert.match(src, /line-clamp-2 break-words text-\[14px\] font-semibold[^"]*">\s*\{copy\.t\(item\.client\?\.name/);
});

test("TUL-995: phone page header keeps its subtitle and the talent top bar has the language switch", () => {
  const chrome = readFileSync(join(root, "talent/shared/page-chrome-1.tsx"), "utf8");
  assert.doesNotMatch(chrome, /\[data-tulala-page-header\] p \{ display: none/);
  assert.match(chrome, /text-overflow: ellipsis/);
  const bar = readFileSync(join(root, "page-modules/MobileTopBar.tsx"), "utf8");
  assert.match(bar, /inTalent \? <LanguageMenu \/> : null/);
});

test("TUL-907: the talent name chip is a real link to Perfil, above its neighbours", () => {
  const bar = readFileSync(join(root, "page-modules/MobileTopBar.tsx"), "utf8");
  assert.match(bar, /import Link from "next\/link"/);
  assert.match(bar, /<Link\s+href="\/talent\/profile"\s+data-tulala-mobile-workspace-pill/);
  assert.match(bar, /setTalentPage\("profile", \{ navigate: false \}\)/);
  assert.match(bar, /relative z-10 flex min-w-0/);
  assert.doesNotMatch(bar, /pointer-events-none/);
});

test("TUL-907: at 390 the name chip only links in Talent Studio, announces its target,", () => {
  const bar = readFileSync(join(root, "page-modules/MobileTopBar.tsx"), "utf8");
  const talentBranch = bar.slice(bar.indexOf("{inTalent ? ("), bar.indexOf(") : (", bar.indexOf("{inTalent ? (")));
  assert.match(talentBranch, /<Link\s+href="\/talent\/profile"/);
  assert.match(talentBranch, /aria-label=\{`\$\{pillName\} · \$\{t\("dashboard\.mobile\.talentPillAria"\)\}`\}/);
  assert.doesNotMatch(talentBranch, /disabled/);
  assert.match(talentBranch, /relative z-10/);
  const en = JSON.parse(readFileSync(join(process.cwd(), "messages/en.json"), "utf8")).dashboard.mobile;
  assert.equal(en.talentPillAria, "Open my profile");
});
