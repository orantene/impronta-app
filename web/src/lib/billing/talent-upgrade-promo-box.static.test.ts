import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * TUL-1275: the "Have a code?" box was mounted only in the orphan
 * TalentSubscriptionShell. The LIVE talent upgrade surface is the tier-compare
 * drawer's TierUpgradeCta; it must mount the box and forward the typed code.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const drawer = read("src/components/admin/shell/internal/talent-drawers/premium-pages.tsx");
const input = read("src/components/billing/promo-code-input.tsx");
const shell = read("src/app/(workspace)/[tenantSlug]/talent/settings/TalentSubscriptionShell.tsx");

test("live tier-compare upgrade CTA mounts PromoCodeInput", () => {
  assert.match(drawer, /import \{ PromoCodeInput \} from "@\/components\/billing\/promo-code-input"/);
  assert.match(drawer, /<PromoCodeInput\b[\s\S]*?onApplied=/);
  assert.match(drawer, /data-testid="talent-upgrade-promo-code"/);
});

test("typed code reaches startTalentUpgrade; the ?promo= value is the fallback and pre-fills the box", () => {
  assert.match(drawer, /startTalentUpgrade\(planKey, tenantSlug, appliedCode \?\? urlPromo\)/);
  assert.match(drawer, /readPromoCodeFromUrl\(\)/);
  assert.match(drawer, /defaultCode=\{urlPromo\}/);
  assert.match(input, /defaultCode\?: string \| null/);
});

test("the orphan shell is not the only mount", () => {
  assert.match(shell, /<PromoCodeInput /);
  assert.match(drawer, /<PromoCodeInput\b/);
});
