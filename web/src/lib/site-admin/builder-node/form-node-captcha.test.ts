/**
 * The `form` builder node must render the captcha widget whenever the TENANT
 * has an active provider.
 *
 * Why this guard exists (2026-08-16 incident, improntamodels.com):
 * `/api/cms/forms/submit` enforces captcha at TENANT level — it resolves the
 * submitted section's tenant, never the form's own props. The `form` node
 * rendered no widget at all, so the moment an operator configured hCaptcha the
 * server demanded a token the page could not produce and EVERY submission was
 * rejected with "Captcha failed". Real enquiries were lost.
 *
 * The fix keys widget rendering off the SAME tenant signal as enforcement, so
 * the two cannot diverge. These tests pin that: an active provider must emit a
 * widget carrying the resolved site key, and no provider must emit nothing.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { renderBuilderNodes } from "./render";
import type { BuilderNode } from "./types";

const formNode: BuilderNode = {
  id: "form-1",
  kind: "form",
  props: {
    sectionId: "11111111-2222-3333-4444-555555555555",
    fields: [
      { id: "email", type: "email", name: "email", label: "Email", required: true },
      { id: "send", type: "submit", name: "send", label: "Send" },
    ],
  },
} as unknown as BuilderNode;

function render(captcha: unknown): string {
  return renderToStaticMarkup(
    renderBuilderNodes([formNode], {
      mode: "freeform",
      includeRendererStyles: false,
      captcha: captcha as never,
    }) as React.ReactElement,
  );
}

test("hCaptcha active → widget renders with the resolved site key", () => {
  const html = render({ provider: "hcaptcha", siteKey: "site-key-abc" });
  assert.ok(html.includes("h-captcha"), "widget container missing");
  assert.ok(html.includes("site-key-abc"), "resolved site key not rendered");
  assert.ok(html.includes("js.hcaptcha.com"), "hCaptcha script not loaded");
});

test("Turnstile active → its widget renders instead", () => {
  const html = render({ provider: "turnstile", siteKey: "ts-key" });
  assert.ok(html.includes("cf-turnstile"));
  assert.ok(html.includes("ts-key"));
  assert.ok(!html.includes("h-captcha"), "must not render the other provider");
});

test("provider 'none' → no widget (unchanged legacy behaviour)", () => {
  const html = render({ provider: "none", siteKey: null });
  assert.ok(!html.includes("h-captcha"));
  assert.ok(!html.includes("cf-turnstile"));
});

test("no captcha option at all → no widget, form still renders", () => {
  const html = render(undefined);
  assert.ok(!html.includes("h-captcha"));
  assert.ok(html.includes("<form"), "the form itself must still render");
});

test("active provider WITHOUT a site key renders no widget", () => {
  // A half-configured integration must not emit a keyless widget: hCaptcha
  // would fail to initialise and the visitor would face an unsolvable form.
  const html = render({ provider: "hcaptcha", siteKey: null });
  assert.ok(!html.includes("h-captcha"));
});
