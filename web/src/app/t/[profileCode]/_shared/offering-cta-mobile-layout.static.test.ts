import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dir = "src/app/t/[profileCode]/_shared/";

test("Offering CTA can wrap and never forces the row wider than the viewport", () => {
  const cta = readFileSync(`${dir}OfferingCta.tsx`, "utf8");
  const cls = cta.match(/className=\{`([^`]*)/)?.[1] ?? "";
  assert.ok(!/\bshrink-0\b/.test(cls), "CTA must not be shrink-0");
  assert.match(cls, /\bmax-w-full\b/);
  assert.match(cls, /\bwhitespace-normal\b/);
});

test("storefront rows that hold the CTA wrap on narrow screens", () => {
  const body = readFileSync(`${dir}StorefrontBody.tsx`, "utf8");
  assert.match(body, /flex flex-wrap items-center gap-x-3 gap-y-2 border-b/);
  assert.match(body, /mt-3 flex flex-wrap items-center justify-between/);
  assert.match(body, /mt-auto flex flex-wrap items-center justify-between/);
  assert.match(body, /min-w-0 flex-1 basis-40/);
});
