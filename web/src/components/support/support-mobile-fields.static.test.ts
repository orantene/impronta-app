import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const read = (f: string) => readFileSync(join(process.cwd(), "src/components/support", f), "utf8");

test("support form fields are 16px (no iOS focus zoom) and the phone field is a tel input", () => {
  for (const f of ["SupportIdeaForm.tsx", "SupportPanelForms.tsx"]) {
    const src = read(f);
    assert.match(src, /const fieldInput: CSSProperties = \{[\s\S]{0,250}fontSize: 16/, f);
    assert.match(src, /type="tel"/, f);
  }
});

test("push control exposes its state to assistive tech and has a 44px target", () => {
  const src = read("PushSubscribeControl.tsx");
  assert.match(src, /aria-pressed=/);
  assert.match(src, /aria-busy=/);
  assert.match(src, /minHeight: 44/);
});

test("a11y: labelled inputs, field limits, focused alert, hints and states (TUL-111)", () => {
  assert.match(read("SupportPanelHome.tsx"), /aria-label=\{t\("dashboard\.adminSupport\.askPlaceholder"\)\}/);
  assert.match(read("SupportThreadView.tsx"), /aria-label=\{t\("dashboard\.adminSupport\.ratingCommentPlaceholder"\)\}/);
  assert.match(read("SupportLauncher.tsx"), /aria-label=\{t\("dashboard\.adminSupport\.launcherAria"\)\}/);
  const forms = read("SupportPanelForms.tsx");
  assert.match(forms, /maxLength=\{200\}/);
  assert.match(forms, /maxLength=\{4000\}/);
  assert.match(forms, /maxLength=\{40\}/);
  assert.match(forms, /role="alert" tabIndex=\{-1\}/);
  assert.match(forms, /errorRef\.current\?\.focus\(\)/);
  const idea = read("SupportIdeaForm.tsx");
  assert.match(idea, /support-idea-title-hint/);
  const push = read("PushSubscribeControl.tsx");
  assert.ok(!push.includes('"…"'));
  assert.match(push, /animateTransform/);
  assert.match(push, /pushDeniedHelp/);
  const guide = read("GuideTab.tsx");
  assert.match(guide, /guideLoading/);
  assert.match(guide, /guideUnavailable/);
  const copy = read("support-a11y-copy.ts");
  assert.ok(!/[—–]/.test(copy), "no em/en dashes in copy");
  assert.match(copy, /Agrega un título/);
});
