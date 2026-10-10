import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * GRK-109: /es/start first Continuar looked ignored because a late resume
 * card replaced Choose mid-click. The module must wait for the resume
 * lookup before painting Choose, and the reducer must ignore a late
 * resumeLoaded after a choice this session.
 */
test("onboarding module gates Choose until resumeChecked (GRK-109)", () => {
  const src = readFileSync(join(process.cwd(), "src/components/onboarding/onboarding-module.tsx"), "utf8");
  assert.match(src, /!resumeChecked/);
  assert.match(src, /data-testid="onb-resume-loading"/);
  assert.match(src, /GRK-109/);
});

test("machine ignores late resume after choice (GRK-109)", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/onboarding/machine.ts"), "utf8");
  assert.match(src, /state\.choice !== null \|\| state\.busy \|\| state\.briefId/);
  assert.match(src, /GRK-109/);
});
