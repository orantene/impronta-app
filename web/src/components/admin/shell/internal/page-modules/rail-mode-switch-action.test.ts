import assert from "node:assert/strict";
import test from "node:test";

import { canShowRailModeSwitch, leaveRailHat } from "./rail-mode-switch-action";

test("canShowRailModeSwitch: talent side needs hybrid or owned business slug", () => {
  assert.equal(
    canShowRailModeSwitch({
      active: "talent",
      alsoTalent: false,
      ownedWorkspaceSlug: null,
      talentSelfProfile: { id: "t" },
    }),
    false,
  );
  assert.equal(
    canShowRailModeSwitch({
      active: "talent",
      alsoTalent: true,
      ownedWorkspaceSlug: null,
      talentSelfProfile: null,
    }),
    true,
  );
  assert.equal(
    canShowRailModeSwitch({
      active: "talent",
      alsoTalent: false,
      ownedWorkspaceSlug: "qa-fresh-studio-2",
      talentSelfProfile: null,
    }),
    true,
  );
});

test("canShowRailModeSwitch: admin side needs hybrid or a talent profile", () => {
  assert.equal(
    canShowRailModeSwitch({
      active: "admin",
      alsoTalent: false,
      ownedWorkspaceSlug: "biz",
      talentSelfProfile: null,
    }),
    false,
  );
  assert.equal(
    canShowRailModeSwitch({
      active: "admin",
      alsoTalent: false,
      talentSelfProfile: { id: "t" },
    }),
    true,
  );
});

test("leaveRailHat: hybrid always uses flipMode", () => {
  let flipped = 0;
  const assigns: string[] = [];
  leaveRailHat({
    active: "talent",
    alsoTalent: true,
    ownedWorkspaceSlug: "biz",
    flipMode: () => {
      flipped += 1;
    },
    assign: (href) => assigns.push(href),
  });
  assert.equal(flipped, 1);
  assert.deepEqual(assigns, []);
});

test("leaveRailHat: hub dual owner on talent goes to owned admin", () => {
  const assigns: string[] = [];
  leaveRailHat({
    active: "talent",
    alsoTalent: false,
    ownedWorkspaceSlug: "qa-fresh-studio-2",
    flipMode: () => {
      assert.fail("flipMode must not run for hub dual owner");
    },
    assign: (href) => assigns.push(href),
  });
  assert.deepEqual(assigns, ["/qa-fresh-studio-2/admin"]);
});

test("leaveRailHat: non-hybrid admin goes to /talent/today", () => {
  const assigns: string[] = [];
  leaveRailHat({
    active: "admin",
    alsoTalent: false,
    flipMode: () => {
      assert.fail("flipMode must not run");
    },
    assign: (href) => assigns.push(href),
  });
  assert.deepEqual(assigns, ["/talent/today"]);
});
