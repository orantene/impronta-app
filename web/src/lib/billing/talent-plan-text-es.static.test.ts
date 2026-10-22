import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * TUL-1869: the Spanish plan card printed the catalog's English taglines and the
 * "$15 / month" fallback price, and the compare modal marked Gratis ACTUAL for a
 * paid talent. Pin both.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

test("every talent plan tagline and price fallback has a Spanish dictionary entry", () => {
  const dict = read("src/components/admin/shell/internal/dashboard-i18n-billing.ts");
  const catalog = read("src/lib/access/plan-catalog.ts");
  const taglines = ["Default for every talent", "Richer presentation", "Your website, fully unlocked", "Your branded talent page"];
  for (const tagline of taglines) {
    assert.ok(catalog.includes(`tagline: "${tagline}"`), `catalog still carries "${tagline}"`);
    assert.ok(dict.includes(`"${tagline}":`), `missing Spanish entry for "${tagline}"`);
  }
  assert.ok(dict.includes('"$15 / month": "$15 / mes"'));
});

test("the compare modal's current tier follows the live profile, not a state captured once", () => {
  const drawer = read("src/components/admin/shell/internal/talent-drawers/premium-pages.tsx");
  assert.match(drawer, /const current = bridgeTalentSelfProfile\?\.talentTier \?\? state\.talentTier;/);
});
