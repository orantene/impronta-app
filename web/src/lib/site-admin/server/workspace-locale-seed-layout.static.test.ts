/**
 * TUL-1182: the admin layout's language-seed hop must be a HARD navigation
 * (LocaleSeedHardRedirect), never a layout redirect() to the seed Route
 * Handler, which loops in the client router after a soft-navigation sign-in
 * (441/497 requests in 8 s measured). Fails if the layout goes back to redirect().
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const layout = readFileSync(join(process.cwd(), "src/app/(workspace)/[tenantSlug]/admin/layout.tsx"), "utf8");
const comp = readFileSync(join(process.cwd(), "src/components/admin/shell/locale-seed-hard-redirect.tsx"), "utf8");

test("the layout returns LocaleSeedHardRedirect for the seed hop", () => {
  assert.match(layout, /<LocaleSeedHardRedirect\s+href=\{workspaceLocaleSeedHref\(/);
  assert.doesNotMatch(layout, /redirect\(workspaceLocaleSeedHref\(/, "no layout redirect() to the seed route");
});

test("the decision still goes through workspaceLocaleSeedHopPossible", () => {
  assert.match(layout, /workspaceLocaleSeedHopPossible\(\{/);
});

test("the component is a client component that replaces the location once", () => {
  assert.match(comp, /^"use client";/);
  assert.match(comp, /window\.location\.replace\(href\)/);
  assert.match(comp, /\[href\]/);
});
