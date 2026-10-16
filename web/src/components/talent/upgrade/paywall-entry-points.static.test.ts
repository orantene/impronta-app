import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(process.cwd(), "src/components");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

// TUL-829: a locked feature opens the one upgrade modal, not the compare drawer.
const CASES: Array<[string, string, string]> = [
  ["talent/site/TalentMaxSiteManager.tsx", 'openUpgrade({ feature: "custom-domain", from: "talent-site-domain" })', "custom domain on /talent/site"],
  ["talent/site/maison-setup/AppDetailScreen.tsx", 'openUpgrade({ feature: "apps", from: "app-detail" })', "locked app"],
  ["admin/shell/internal/talent-drawers/premium-pages.tsx", 'from: "template-drawer"', "locked template"],
];

for (const [file, needle, label] of CASES) {
  test(`TUL-829: ${label} opens the upgrade modal`, () => {
    const src = read(file);
    assert.ok(src.includes(needle), `${file} calls openUpgrade`);
    assert.match(src, /from "@\/components\/talent\/upgrade\/open-upgrade"/);
  });
}

test("TUL-829: the locked-template click no longer opens the compare drawer", () => {
  const src = read("admin/shell/internal/talent-drawers/premium-pages.tsx");
  assert.doesNotMatch(src, /if \(isLocked\) \{\s*openDrawer\("talent-tier-compare"\)/);
});
