import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const src = readFileSync(path.join(process.cwd(), "src/components/talent/get-found/GscTokenField.tsx"), "utf8");

test("TUL-1021: field imports and calls the existing save action", () => {
  assert.ok(src.includes('from "@/lib/talent/google-site-verification-actions"'));
  assert.ok(src.includes("saveGoogleSiteVerificationAction("));
});

test("TUL-1021: field strings exist in both en and es", () => {
  const [en, es] = src.split(/\n {2}es: \{/);
  for (const k of ["label", "help", "save", "remove", "invalid", "failed"]) {
    assert.match(en, new RegExp(`\\b${k}:`));
    assert.match(es ?? "", new RegExp(`\\b${k}:`));
  }
});

test("TUL-1222/1223/1224: GSC token field is accessible", () => {
  // 1222: the error is announced and tied to the input
  assert.ok(src.includes('role="alert"'), "error uses role=alert");
  assert.ok(src.includes("aria-invalid="), "input sets aria-invalid on error");
  assert.ok(src.includes("aria-describedby="), "input is described by help/error text");
  // 1223: 40px targets + visible keyboard focus on opener, input and buttons
  assert.ok((src.match(/min-h-10/g) ?? []).length >= 4, "summary, input, Save, Remove are >= 40px");
  assert.ok(src.includes("focus-visible:outline"), "visible focus ring");
  // 1224: no iOS zoom (16px input), no cut-off token, no hard-coded id
  assert.ok(src.includes("text-base"), "input is 16px on phones");
  assert.ok(!src.includes(" truncate"), "saved token is not truncated");
  assert.ok(src.includes("useId(") && !src.includes('id="gsc-token"'), "ids come from useId");
});
