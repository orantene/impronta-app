import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

/**
 * The properties that decide whether a test result can be believed.
 */

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

function setup(storage: unknown = new MemoryStorage()) {
  (globalThis as Record<string, unknown>).window = {};
  (globalThis as Record<string, unknown>).sessionStorage = storage;
}

async function fresh() {
  return (await import(`./experiment?${Math.random()}`)) as typeof import("./experiment");
}

describe("marketing experiments", () => {
  beforeEach(() => {
    for (const k of ["window", "sessionStorage"]) {
      delete (globalThis as Record<string, unknown>)[k];
    }
  });

  test("the same visit always gets the same arm", async () => {
    setup();
    const { assignVariant } = await fresh();
    const first = assignVariant("hero-claim");
    for (let i = 0; i < 20; i++) {
      assert.equal(
        assignVariant("hero-claim"),
        first,
        "the page must not change under a reader mid visit",
      );
    }
  });

  test("two experiments do not assign correlated arms", async () => {
    setup();
    const { assignVariant } = await fresh();
    // Across many sessions the pairing should not be locked together; if it
    // were, neither experiment's result could be read.
    let sameCount = 0;
    const N = 200;
    for (let i = 0; i < N; i++) {
      setup(new MemoryStorage());
      const m = await fresh();
      if (m.assignVariant("exp-a") === m.assignVariant("exp-b")) sameCount++;
    }
    assert.ok(
      sameCount > N * 0.3 && sameCount < N * 0.7,
      `arms look correlated across experiments (${sameCount}/${N} identical)`,
    );
  });

  test("the split is roughly even", async () => {
    let treatment = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      setup(new MemoryStorage());
      const { assignVariant } = await fresh();
      if (assignVariant("hero-claim") === "treatment") treatment++;
    }
    assert.ok(
      treatment > N * 0.4 && treatment < N * 0.6,
      `split is lopsided: ${treatment}/${N} in treatment`,
    );
  });

  test("no session id means no assignment, so the caller shows control", async () => {
    setup({
      getItem() { throw new Error("blocked"); },
      setItem() { throw new Error("blocked"); },
    });
    const { assignVariant } = await fresh();
    assert.equal(
      assignVariant("hero-claim"),
      null,
      "a visitor we cannot measure must not be shown the untested variant",
    );
  });

  test("returns null on the server rather than guessing", async () => {
    const { assignVariant } = await fresh();
    assert.equal(assignVariant("hero-claim"), null);
  });
});
