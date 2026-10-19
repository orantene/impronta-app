import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ACCOUNT_DOCK_Z_INDEX, DOCK_NARROW_SIDE_CSS, shouldHideAccountDock } from "./dock-visibility";

describe("account dock agrees with the header (TUL-1158)", () => {
  test("hides the dock under a staff session, not the header or a client", () => {
    assert.equal(shouldHideAccountDock("dock", { signedIn: false, signedInAs: "business" }), true);
    assert.equal(shouldHideAccountDock("header", { signedIn: false, signedInAs: "business" }), false);
    assert.equal(shouldHideAccountDock("dock", { signedIn: false }), false);
    assert.equal(shouldHideAccountDock("dock", { signedIn: true }), false);
  });
  test("dock layer is below the launcher layer (95)", () => {
    assert.ok(ACCOUNT_DOCK_Z_INDEX < 95);
    // TUL-1225: 16px between the dock (bottom 94px) and the launcher top (y766 of 844).
    assert.match(DOCK_NARROW_SIDE_CSS, /bottom:calc\(94px \+ env\(safe-area-inset-bottom\)\)!important/);
    const src = readFileSync(join(process.cwd(), "src/components/client-account/ClientAccountButton.tsx"), "utf8");
    assert.match(src, /zIndex: ACCOUNT_DOCK_Z_INDEX/);
    assert.match(src, /shouldHideAccountDock\(variant, me\)/);
    const launcher = readFileSync(join(process.cwd(), "src/app/t/[profileCode]/_chat/TalentProfileChatLauncher.tsx"), "utf8");
    assert.match(launcher, /zIndex: 95/);
  });
});

describe("dock clears the card hearts on narrow screens (TUL-1207)", () => {
  test("moves to the left edge and is applied only inside the 480px query", () => {
    assert.match(DOCK_NARROW_SIDE_CSS, /right:auto!important/);
    assert.match(DOCK_NARROW_SIDE_CSS, /left:max\(16px,env\(safe-area-inset-left\)\)/);
    // TUL-1225: 16px between the dock (bottom 94px) and the launcher top (y766 of 844).
    assert.match(DOCK_NARROW_SIDE_CSS, /bottom:calc\(94px \+ env\(safe-area-inset-bottom\)\)!important/);
    const src = readFileSync(join(process.cwd(), "src/components/client-account/ClientAccountButton.tsx"), "utf8");
    assert.match(src, /@media \(max-width:480px\)\{[^}]*\}\$\{DOCK_NARROW_SIDE_CSS\}\}/);
  });
});
