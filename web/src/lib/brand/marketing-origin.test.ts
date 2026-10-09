import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_MARKETING_ORIGIN,
  resolveMarketingApexHost,
  resolveMarketingOrigin,
} from "./marketing-origin";

test("unset or blank -> the production default", () => {
  assert.equal(resolveMarketingOrigin({}), "https://tulala.digital");
  assert.equal(DEFAULT_MARKETING_ORIGIN, "https://tulala.digital");
  assert.equal(resolveMarketingOrigin({ TULALA_MARKETING_ORIGIN: "   " }), "https://tulala.digital");
});

test("resolveMarketingApexHost is the hostname half of the origin", () => {
  assert.equal(resolveMarketingApexHost({}), "tulala.digital");
  assert.equal(
    resolveMarketingApexHost({
      TULALA_MARKETING_ORIGIN: "https://staging-qa-journeys.tulala.digital/start",
    }),
    "staging-qa-journeys.tulala.digital",
  );
  assert.equal(
    resolveMarketingApexHost({
      VERCEL_ENV: "production",
      TULALA_MARKETING_ORIGIN: "https://evil.example.com",
    }),
    "tulala.digital",
  );
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
