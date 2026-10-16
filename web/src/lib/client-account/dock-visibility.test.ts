import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ACCOUNT_DOCK_Z_INDEX, shouldHideAccountDock } from "./dock-visibility";

describe("account dock agrees with the header (TUL-1158)", () => {
  test("hides the dock under a staff session, not the header or a client", () => {
    assert.equal(shouldHideAccountDock("dock", { signedIn: false, signedInAs: "business" }), true);
    assert.equal(shouldHideAccountDock("header", { signedIn: false, signedInAs: "business" }), false);
    assert.equal(shouldHideAccountDock("dock", { signedIn: false }), false);
    assert.equal(shouldHideAccountDock("dock", { signedIn: true }), false);
  });
  test("dock layer is below the launcher layer (95)", () => {
    assert.ok(ACCOUNT_DOCK_Z_INDEX < 95);
    const src = readFileSync(join(process.cwd(), "src/components/client-account/ClientAccountButton.tsx"), "utf8");
    assert.match(src, /zIndex: ACCOUNT_DOCK_Z_INDEX/);
    assert.match(src, /shouldHideAccountDock\(variant, me\)/);
    const launcher = readFileSync(join(process.cwd(), "src/app/t/[profileCode]/_chat/TalentProfileChatLauncher.tsx"), "utf8");
    assert.match(launcher, /zIndex: 95/);
  });
});
