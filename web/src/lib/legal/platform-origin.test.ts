import assert from "node:assert/strict";
import { test } from "node:test";

import { PROD_PLATFORM_ORIGIN, platformOrigin } from "./platform-origin";

function withSite<T>(value: string | undefined, fn: () => T): T {
  const prev = process.env.NEXT_PUBLIC_SITE_URL;
  if (value === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = prev;
  }
}

test("staging origin is used as-is (no leak to production)", () => {
  assert.equal(withSite("https://staging.tulala.digital/", platformOrigin), "https://staging.tulala.digital");
});

test("production and unset keep tulala.digital", () => {
  assert.equal(withSite("https://tulala.digital", platformOrigin), "https://tulala.digital");
  assert.equal(withSite(undefined, platformOrigin), PROD_PLATFORM_ORIGIN);
});

test("localhost and junk fall back to production", () => {
  assert.equal(withSite("http://localhost:3000", platformOrigin), PROD_PLATFORM_ORIGIN);
  assert.equal(withSite("not a url", platformOrigin), PROD_PLATFORM_ORIGIN);
});
