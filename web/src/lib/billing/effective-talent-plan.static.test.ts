import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, test } from "node:test";

const SRC = join(__dirname, "..", "..");
const CHOKE = "effective-talent-plan";

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) && !n.includes("database.types")) out.push(p);
  }
  return out;
}

/** Files that gate on a plan key but receive it from props or are pure maps. Do not add to this list. */
const GRANDFATHERED = new Set([
  "app/%5Ftalent-site/TalentSiteMessagesDock.tsx",
  "app/t/[profileCode]/freeform-hub-book.tsx",
  "app/t/[profileCode]/_shared/TalentStorefront.tsx",
  "app/t/[profileCode]/_shared/ProfileInstantBookingMount.tsx",
  "components/home/homepage-cms-data-sources.ts",
  "lib/identity/account-menu-model.ts",
  "lib/access/talent-entitlements.ts",
  "lib/talent-site/talent-page-seo.ts",
  "lib/talent-site/server/provision-max-site.ts",
  "lib/talent-site/server/plan-change.ts",
]);

describe("TUL-835 dunning grace is enforced at the choke point", () => {
  const files = walk(SRC).map((f) => ({ rel: relative(SRC, f), text: readFileSync(f, "utf8") }));

  test("the server loaders that read talent_plan_key for gating use the choke point", () => {
    for (const rel of [
      "lib/talent/plan-instant.server.ts",
      "lib/directory/fetch-directory-page.ts",
      "lib/ai/booking-assistant/turn.server.ts",
      "lib/talent-site/published-talent-page.ts",
      "lib/talent-site/server/load-max-site-link.ts",
      "lib/talent-site/server/load-max-site.ts",
      "lib/analytics/talent-analytics.ts",
      "app/(workspace)/[tenantSlug]/_data-bridge/talent.ts",
    ]) {
      const f = files.find((x) => x.rel === rel);
      assert.ok(f, `missing ${rel}`);
      assert.ok(f.text.includes(CHOKE), `${rel} must resolve the plan through ${CHOKE}`);
    }
  });

  test("no new file gates on a raw talent_plan_key without the choke point", () => {
    const offenders = files
      .filter(
        (f) =>
          f.text.includes("talent_plan_key") &&
          /hasEntitlement\(|buildTalentMembershipState\(|talentOffersInstantBooking\(|talentPlanToTier\(|talentPlanGrants/.test(f.text) &&
          !f.text.includes(CHOKE) &&
          !GRANDFATHERED.has(f.rel),
      )
      .map((f) => f.rel);
    assert.deepEqual(offenders, []);
  });
});
