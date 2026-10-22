import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(process.cwd(), "src");
const read = (p: string) => readFileSync(join(root, p), "utf8");

test("TUL-1797: the marketing group paints a loading skeleton with a localized label", () => {
  const s = read("app/(marketing)/loading.tsx");
  assert.match(s, /role="status"/);
  assert.match(s, /public\.pageLoading/);
  assert.doesNotMatch(s, /"use client"/);
  const en = JSON.parse(readFileSync(join(process.cwd(), "messages/en.json"), "utf8"));
  const es = JSON.parse(readFileSync(join(process.cwd(), "messages/es.json"), "utf8"));
  assert.equal(typeof en.public.pageLoading, "string");
  assert.equal(typeof es.public.pageLoading, "string");
  assert.notEqual(en.public.pageLoading, es.public.pageLoading);
});
