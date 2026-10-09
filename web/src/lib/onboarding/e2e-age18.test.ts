import assert from "node:assert/strict";
import test from "node:test";

import { confirmAge18AndBuild } from "../../../e2e/onboarding/_age18";

type Fake = {
  page: { getByTestId(id: string): unknown };
  log: string[];
  state: { visible: boolean; checked: boolean; enabledNeedsTick: boolean; enabledAfterMs: number; untickOnce: boolean };
};

/** A page whose build button follows the real rule: enabled once the 18+ box is ticked (when it exists). */
function fake(init: Partial<Fake["state"]> = {}): Fake {
  const state = { visible: true, checked: false, enabledNeedsTick: true, enabledAfterMs: 0, untickOnce: false, ...init };
  const log: string[] = [];
  const t0 = Date.now();
  const age = {
    waitFor: async () => {
      log.push("age.waitFor");
      if (!state.visible) throw new Error("not visible");
    },
    isVisible: async () => state.visible,
    isChecked: async () => state.checked,
    check: async () => {
      log.push("age.check");
      state.checked = true;
    },
  };
  const build = {
    isEnabled: async () => {
      const ok = (!state.enabledNeedsTick || !state.visible || state.checked) && Date.now() - t0 >= state.enabledAfterMs;
      if (ok && state.untickOnce) {
        // the screen re-renders and drops the tick once, right after the button looked enabled
        state.untickOnce = false;
        state.checked = false;
        return false;
      }
      return ok;
    },
    click: async () => {
      log.push("build.click");
    },
  };
  return { log, state, page: { getByTestId: (id: string) => (id === "onb-age18-checkbox" ? age : build) } };
}

test("ticks the 18+ box, waits for the button to be enabled, then clicks it", async () => {
  const f = fake();
  await confirmAge18AndBuild(f.page, { pollMs: 5, settleMs: 1000 });
  assert.deepEqual(f.log, ["age.waitFor", "age.check", "build.click"]);
});

test("a path with no 18+ box (studio) just clicks the enabled button", async () => {
  const f = fake({ visible: false });
  await confirmAge18AndBuild(f.page, { pollMs: 5, settleMs: 1000 });
  assert.deepEqual(f.log, ["age.waitFor", "build.click"]);
});

test("it never clicks a disabled button: it waits until the button is enabled", async () => {
  const f = fake({ enabledAfterMs: 60 });
  await confirmAge18AndBuild(f.page, { pollMs: 10, settleMs: 2000 });
  assert.equal(f.log[f.log.length - 1], "build.click");
  assert.ok(f.log.includes("age.check"));
});

test("a tick dropped by a re-render is re-applied before the click", async () => {
  const f = fake({ untickOnce: true });
  await confirmAge18AndBuild(f.page, { pollMs: 5, settleMs: 1000 });
  assert.equal(f.log.filter((l) => l === "age.check").length, 2);
  assert.equal(f.log[f.log.length - 1], "build.click");
});

test("a button that never turns enabled fails with a clear message and is never clicked", async () => {
  const f = fake({ enabledAfterMs: 10_000_000 });
  await assert.rejects(confirmAge18AndBuild(f.page, { pollMs: 5, settleMs: 80 }), /never turned enabled/);
  assert.ok(!f.log.includes("build.click"));
});
