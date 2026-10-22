import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("TUL-1864: the checklist's booking-policy door opens the commercial-terms group, and that deep link focuses the section", () => {
  const setup = read("../../../../../app/(workspace)/[tenantSlug]/admin/setup/page.tsx");
  assert.match(setup, /bookingPolicy: \(b\) => `\$\{b\}\/settings\?focus=commercial-terms`/);
  const view = read("./WorkspacePageView.tsx");
  assert.match(view, /id: "commercial-terms",\s*label: t\("dashboard\.adminWorkspace\.bookingPolicies\.title"\)/);
  assert.match(view, /FOCUSABLE_GROUPS[^;]*"commercial-terms"/);
  assert.match(view, /el instanceof HTMLElement\) \{ el\.focus\(\{ preventScroll: true \}\)/);
  assert.match(view, /data-settings-section=\{activeGroupData\.id\} tabIndex=\{-1\}/);
});
