import assert from "node:assert/strict";
import { test } from "node:test";
import { STATIC_PATHS } from "@/lib/saas/path-groups";
import { buildLlmsTxt } from "./llms-txt";

test("llms.txt describes the product with absolute links on the given base", () => {
  const txt = buildLlmsTxt(new URL("https://tulala.digital"));
  assert.match(txt, /^# Tulala\n/);
  assert.ok(txt.includes("https://tulala.digital/pricing"));
  assert.ok(txt.includes("https://tulala.digital/about"));
});

test("llms.txt carries no em dashes", () => {
  assert.equal(buildLlmsTxt(new URL("https://tulala.digital")).includes("—"), false);
});

test("/llms.txt is reachable through the host gate", () => {
  assert.ok((STATIC_PATHS as readonly string[]).includes("/llms.txt"));
});
