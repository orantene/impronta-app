import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { projectAgencyAccountSiteTokens } from "./agency-account-site-pure";

test("empty tokens → empty projection", () => {
  assert.deepEqual(projectAgencyAccountSiteTokens({}), {
    tokens: {},
    cssVars: {},
    dataAttrs: {},
  });
});

test("projects ink/background color vars and --site-*-font aliases", () => {
  const tokens = {
    "color.ink": "#1a1a1a",
    "color.background": "#faf8f5",
    "typography.heading-font-family": "Playfair Display",
    "typography.body-font-family": "Inter",
  };
  const out = projectAgencyAccountSiteTokens(tokens);
  assert.equal(out.tokens, tokens);
  assert.equal(out.cssVars["--token-color-ink"], "#1a1a1a");
  assert.equal(out.cssVars["--token-color-background"], "#faf8f5");
  assert.equal(out.cssVars["--site-heading-font"], "Playfair Display");
  assert.equal(out.cssVars["--site-body-font"], "Inter");
  // Color + free-string font tokens project as cssVars; dataAttrs stay for enums.
  assert.deepEqual(out.dataAttrs, {});
});

test("tenant /account renderer mounts agency token projection like talent", () => {
  const src = readFileSync(join(__dirname, "render-tenant-area.tsx"), "utf8");
  assert.match(src, /loadAgencyAccountSite\(/);
  assert.match(src, /TalentSiteHtmlTokens/);
  assert.match(src, /GoogleFontsLink/);
  const loader = readFileSync(join(__dirname, "area-site.server.ts"), "utf8");
  assert.match(loader, /export async function loadAgencyAccountSite/);
  assert.match(loader, /projectAgencyAccountSiteTokens/);
  assert.match(loader, /resolveDesignTokens/);
});
