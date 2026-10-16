import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(process.cwd(), "src");
const read = (p: string) => readFileSync(join(root, p), "utf8");

test("TUL-760: setup wait renders the skeleton, not a bare ellipsis", () => {
  const src = read("components/onboarding/onboarding-module.tsx");
  assert.match(src, /OnboardingStepSkeleton/);
  assert.doesNotMatch(src, /data-testid="onb-setup-loading">…</);
});

test("TUL-760: /start and /onboarding/role have a loading.tsx skeleton", () => {
  for (const p of ["app/start/loading.tsx", "app/onboarding/role/loading.tsx"]) {
    assert.ok(existsSync(join(root, p)), p);
    assert.match(read(p), /OnboardingStepSkeleton/);
  }
});
