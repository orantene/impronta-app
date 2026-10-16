import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(process.cwd(), "src");
const read = (p: string) => readFileSync(join(root, p), "utf8");

function draftBody(): string {
  const src = read("components/onboarding/steps/arrival-step.tsx");
  const start = src.indexOf("function DraftBody(");
  assert.ok(start > 0, "DraftBody exists");
  const end = src.indexOf("\nexport function ArrivalFailed", start);
  return src.slice(start, end > 0 ? end : undefined);
}

test("TUL-1130: the publish-failed screen states a reason", () => {
  const body = draftBody();
  assert.match(body, /data-testid="onb-arrival-reason"/);
  assert.match(body, /arrival\.draftReason/);
  assert.match(body, /data-testid="onb-arrival-details"/);
});

test("TUL-1130: the publish-failed screen has exactly one primary button", () => {
  const body = draftBody();
  assert.equal((body.match(/<PrimaryButton\b/g) ?? []).length, 1);
  assert.match(body, /testId="onb-arrival-retry"/);
});

test("TUL-1130: other exits are quiet links, never a second filled button", () => {
  const body = draftBody();
  assert.doesNotMatch(body, /<button\b/);
  assert.doesNotMatch(body, /var\(--tl-(lime|forest)\)/);
});

test("TUL-1130: the module renders the failed screen when the build failed", () => {
  const src = read("components/onboarding/onboarding-module.tsx");
  assert.match(src, /state\.buildFailed !== null\) \{\s*body = \(\s*<ArrivalFailed/);
});

test("TUL-1130: the reason and retry copy exist in both languages", () => {
  for (const f of ["../messages/en.json", "../messages/es.json"]) {
    const j = JSON.parse(readFileSync(join(process.cwd(), f.replace("../", "")), "utf8")) as {
      public: { onboarding: { arrival: Record<string, string> } };
    };
    for (const k of ["draftReason", "retry"]) assert.ok(j.public.onboarding.arrival[k]?.length > 0, `${f} ${k}`);
  }
});
