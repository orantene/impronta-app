import { readFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LAUNCHER_LIFT_CSS, SHARE_GUTTER_CLASS } from "./floating-chrome";

const read = (f: string) => readFileSync(path.join(__dirname, f), "utf8");

describe("light profile: room for the floating chat bubble on mobile", () => {
  it("share row reserves a right gutter on phones only", () => {
    assert.equal(SHARE_GUTTER_CLASS, "pr-20 lg:pr-0");
    assert.match(read("ProfileHeader.tsx"), /mt-5 flex items-center gap-3 \$\{SHARE_GUTTER_CLASS\}/);
    // 5rem gutter clears the 56px bubble + 16px inset (72px).
    assert.ok(5 * 16 >= 56 + 16);
  });
  it("bubble lifts above the sticky bar below lg, safe-area aware, desktop untouched", () => {
    assert.ok(LAUNCHER_LIFT_CSS.includes("max-width:1023.98px"));
    assert.ok(LAUNCHER_LIFT_CSS.includes("[data-profile-sticky-bar=\"visible\"]"));
    assert.ok(LAUNCHER_LIFT_CSS.includes("env(safe-area-inset-bottom"));
    assert.ok(read("LightProfileLayout.tsx").includes("LAUNCHER_LIFT_CSS"));
    assert.match(read("LightProfileLayout.tsx"), /data-profile-sticky-bar="visible" className="fixed inset-x-0 bottom-0 z-50 lg:hidden"/);
  });
});
