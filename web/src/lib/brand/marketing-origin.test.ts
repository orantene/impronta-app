import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_MARKETING_ORIGIN, resolveMarketingOrigin } from "./marketing-origin";

test("unset or blank -> the production default", () => {
  assert.equal(resolveMarketingOrigin({}), "https://tulala.digital");
  assert.equal(DEFAULT_MARKETING_ORIGIN, "https://tulala.digital");
  assert.equal(resolveMarketingOrigin({ TULALA_MARKETING_ORIGIN: "   " }), "https://tulala.digital");
});

test("set -> the staging origin (origin only; path, query and credentials dropped)", () => {
  assert.equal(resolveMarketingOrigin({ TULALA_MARKETING_ORIGIN: "https://staging-qa-journeys.tulala.digital" }), "https://staging-qa-journeys.tulala.digital");
  assert.equal(resolveMarketingOrigin({ TULALA_MARKETING_ORIGIN: " https://stage.example.com/start?x=1 " }), "https://stage.example.com");
  assert.equal(resolveMarketingOrigin({ TULALA_MARKETING_ORIGIN: "https://user:pw@stage.example.com/" }), "https://stage.example.com");
});

test("production ignores the override entirely", () => {
  assert.equal(resolveMarketingOrigin({ VERCEL_ENV: "production", TULALA_MARKETING_ORIGIN: "https://evil.example.com" }), "https://tulala.digital");
});

test("preview and development honour it", () => {
  assert.equal(resolveMarketingOrigin({ VERCEL_ENV: "preview", TULALA_MARKETING_ORIGIN: "https://stage.example.com" }), "https://stage.example.com");
  assert.equal(resolveMarketingOrigin({ VERCEL_ENV: "development", TULALA_MARKETING_ORIGIN: "http://localhost:3105" }), "http://localhost:3105");
});

test("garbage, non-http(s) and remote plain http fall back to the default", () => {
  for (const bad of ["not a url", "javascript:alert(1)", "ftp://stage.example.com", "http://stage.example.com", "//stage.example.com"]) {
    assert.equal(resolveMarketingOrigin({ TULALA_MARKETING_ORIGIN: bad }), "https://tulala.digital", bad);
  }
});

test("the /start door in the proxy takes its origin from the resolver, never from the production literal", async () => {
  const { readFileSync } = await import("node:fs");
  const proxy = readFileSync(new URL("../../proxy.ts", import.meta.url), "utf8");
  assert.match(proxy, /marketingOrigin:\s*resolveMarketingOrigin\(\)/);
  assert.doesNotMatch(proxy, /marketingOrigin:\s*`https:\/\/\$\{TULALA_APEX_HOST\}`/);
});

/**
 * TUL-520: every absolute marketing-host redirect that can fire during sign-in /
 * role resolution must call `resolveMarketingOrigin()`. A hard-coded
 * `https://tulala.digital` or `` `https://${TULALA_APEX_HOST}` `` on these paths
 * sends an isolated-stack visitor to production (real accounts).
 */
const MARKETING_REDIRECT_CALL_SITES = [
  "../../proxy.ts",
  "../../app/(auth)/login/page.tsx",
  "../../app/(auth)/register/page.tsx",
  "../../app/onboarding/role/page.tsx",
  "../../app/(workspace)/talent/page.tsx",
  "../../app/client/page.tsx",
] as const;

test("TUL-520: marketing redirect call sites resolve origin from env, never a hard-coded production host", async () => {
  const { readFileSync } = await import("node:fs");
  for (const rel of MARKETING_REDIRECT_CALL_SITES) {
    const src = readFileSync(new URL(rel, import.meta.url), "utf8");
    assert.match(src, /resolveMarketingOrigin\s*\(/, `${rel} must call resolveMarketingOrigin`);
    assert.doesNotMatch(
      src,
      /siteUrl:\s*getSiteUrl\s*\(/,
      `${rel} must not pass getSiteUrl() as the /start origin`,
    );
    assert.doesNotMatch(
      src,
      /redirect\s*\(\s*`https:\/\/\$\{TULALA_APEX_HOST\}`\s*\)/,
      `${rel} must not redirect to the production apex literal`,
    );
    assert.doesNotMatch(
      src,
      /redirect\s*\(\s*["']https:\/\/tulala\.digital/,
      `${rel} must not redirect to a hard-coded https://tulala.digital`,
    );
    assert.doesNotMatch(
      src,
      /buildStartUrl\s*\(\s*\{[^}]*siteUrl:\s*getSiteUrl/,
      `${rel} must not build /start from getSiteUrl()`,
    );
  }
});

test("TUL-520: with TULALA_MARKETING_ORIGIN set, buildStartUrl never lands on production", async () => {
  const { buildStartUrl } = await import("../onboarding/legacy-signup-redirect");
  const origin = resolveMarketingOrigin({
    VERCEL_ENV: "development",
    TULALA_MARKETING_ORIGIN: "http://localhost:3105",
  });
  assert.equal(origin, "http://localhost:3105");
  const url = buildStartUrl({ siteUrl: origin, lang: "en" });
  assert.equal(url, "http://localhost:3105/start?lang=en");
  assert.doesNotMatch(url, /tulala\.digital/);
});
