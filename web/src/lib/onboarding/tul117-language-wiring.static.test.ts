import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * TUL-117: the chosen language only reaches the dashboards if the wiring is in
 * place at every layer (the "3 of 4 layers" defect). The pure decisions are
 * unit-tested next to their modules; this pins the call sites.
 */
const read = (p: string) => readFileSync(p, "utf8");

test("the build passes the flow locale to the workspace provisioner", () => {
  assert.match(read("src/lib/onboarding/provision-for-choice.server.ts"), /provisionWorkspaceFromLead\(\{[^}]*locale: input\.locale/);
});

test("the talent writer fills preferred_locale from the flow locale", () => {
  const src = read("src/lib/onboarding/talent-writer.server.ts");
  assert.match(src, /fillTalentPreferredLocale\(admin, id, input\.locale\)/);
});

test("the workspace is born with the flow language on both columns", () => {
  const src = read("src/lib/saas/workspace-signup.server.ts");
  assert.match(src, /default_locale: flowLocale\.defaultLocale/);
  assert.match(src, /supported_locales: flowLocale\.supportedLocales/);
  assert.match(src, /workspaceLocaleSettingsForFlow\(params\.locale\)\?\.supportedLocales \?\? \["en"\]/);
});

// TUL-455: identity locale alone is not enough — the starter homepage must be
// seeded in that same locale or ?edit=1 opens an empty ES draft ("Empezar desde cero").
test("the starter seed receives the flow locale (workspace scaffold)", () => {
  const src = read("src/lib/saas/workspace-signup.server.ts");
  assert.match(
    src,
    /onboardStarterContent\(admin, \{[\s\S]*?\.\.\.\(flowLocale && \{ locale: flowLocale\.defaultLocale \}\)/,
  );
});

test("the starter seed receives the flow locale (talent→workspace provision)", () => {
  const src = read("src/lib/server-actions/talent-workspace-provision.ts");
  assert.match(
    src,
    /onboardStarterContent\(admin, \{[\s\S]*?\.\.\.\(flowLocale && \{ locale: flowLocale\.defaultLocale \}\)/,
  );
});

test("the workspace admin layout hops through the seed route behind the attempt-cookie guard", () => {
  const src = read("src/app/(workspace)/[tenantSlug]/admin/layout.tsx");
  assert.match(src, /WORKSPACE_LOCALE_SEED_ATTEMPT_COOKIE/);
  assert.match(src, /workspaceLocaleSeedHref\(/);
});

test("the seed route sits under a prefix the app and agency hosts serve", async () => {
  const { isPathAllowedForHostKind } = await import("../saas/surface-allow-list");
  assert.equal(isPathAllowedForHostKind("app", "/api/admin/locale-seed"), true);
  assert.equal(isPathAllowedForHostKind("agency", "/api/admin/locale-seed"), true);
});
