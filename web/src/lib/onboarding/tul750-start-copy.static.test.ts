import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

test("/start header uses the Tulala wordmark, not set text", () => {
  const src = read("src/components/onboarding/onboarding-module.tsx");
  assert.doesNotMatch(src, />tulala\.<\/span>/i);
  assert.equal((src.match(/<TulalaWordmark /g) ?? []).length, 2);
});

test("18+ is confirmed once: the save step asks only for Terms after the ready step", () => {
  const save = read("src/components/onboarding/steps/save-step.tsx");
  assert.match(save, /ageConfirmed \? t\("public\.onboarding\.save\.termsPrefix"\)/);
  const mod = read("src/components/onboarding/onboarding-module.tsx");
  assert.match(mod, /ageConfirmed=\{ageConfirmed\}/);
  for (const loc of ["en", "es"]) {
    const j = JSON.parse(read(`messages/${loc}.json`)) as { public: { onboarding: { save: { termsPrefix?: string } } } };
    assert.ok(j.public.onboarding.save.termsPrefix, `${loc}: termsPrefix`);
    assert.doesNotMatch(j.public.onboarding.save.termsPrefix!, /18/);
  }
});

test("Where you work shows its default (city only) as visibly selected", () => {
  const src = read("src/components/admin/shell/internal/talent/pages/ProfileEditorPanel.tsx");
  assert.match(src, /data-testid="profile-where-city-only"[\s\S]{0,200}bg-admin-ink/);
});
