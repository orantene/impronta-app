import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const WEB = new URL("../../../../", import.meta.url);
const read = (p: string): string => readFileSync(new URL(p, WEB), "utf8");

// Every writer that sets talent_sites.theme_design_version to a NEW version
// must consult the pin guard first. Restore / undo writers re-instate a pin
// the site already held and are exempt by design.
const GUARDED: ReadonlyArray<[string, string]> = [
  ["src/lib/talent-site/server/theme-apply-core.ts", "checkSitePin("],
  ["src/lib/talent-site/history/history.server.ts", "checkSitePinBySiteId("],
  ["src/lib/talent-site/theme-releases/manager/merge-site.server.ts", "checkSitePin("],
];

for (const [file, call] of GUARDED) {
  test(`${file} consults the pin guard`, () => {
    const src = read(file);
    assert.ok(src.includes(call), `${file} must call ${call}`);
  });
}

test("the guard never lets a failed read through", () => {
  const src = read("src/lib/talent-site/theme-releases/pin-guard.server.ts");
  assert.match(src, /READ_FAILED/);
  assert.ok(!/console\./.test(src));
});
