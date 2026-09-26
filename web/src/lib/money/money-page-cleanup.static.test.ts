/**
 * M1 cleanup: Money must not show static collect-methods claims or the
 * leave-agency box (audit 3.3 / Stage C prompt).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const moneyDir = join(here, "../../components/talent/money");

describe("Money page M1 cleanup", () => {
  it("does not ship CollectMethodsPanel", () => {
    let missing = false;
    try {
      readFileSync(join(moneyDir, "CollectMethodsPanel.tsx"), "utf8");
    } catch {
      missing = true;
    }
    assert.equal(missing, true);
  });

  it("MoneyPage has no CollectMethodsPanel or leave-agency box", () => {
    const src = readFileSync(join(moneyDir, "MoneyPage.tsx"), "utf8");
    assert.equal(src.includes("CollectMethodsPanel"), false);
    assert.equal(/Leave an agency/i.test(src), false);
    assert.equal(src.includes("talent-leave-agency"), false);
  });
});
