import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { guestResumePath } from "./guest-resume-token";

const saved = process.env.GUEST_COOKIE_SECRET;
afterEach(() => {
  if (saved === undefined) delete process.env.GUEST_COOKIE_SECRET;
  else process.env.GUEST_COOKIE_SECRET = saved;
});

function captureErrors<T>(fn: () => T): { result: T; logged: string[] } {
  const logged: string[] = [];
  const orig = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  };
  try {
    return { result: fn(), logged };
  } finally {
    console.error = orig;
  }
}

test("missing GUEST_COOKIE_SECRET: link degrades to /contact but is logged (TUL-619)", () => {
  delete process.env.GUEST_COOKIE_SECRET;
  const { result, logged } = captureErrors(() =>
    guestResumePath("11111111-1111-1111-1111-111111111111"),
  );
  assert.equal(result, "/contact");
  assert.ok(
    logged.some((l) => l.includes("guest-resume-path")),
    "the silent fallback must be reported through logServerError",
  );
});

test("secret present: signed resume link, nothing logged", () => {
  process.env.GUEST_COOKIE_SECRET = "test-secret-for-resume";
  const { result, logged } = captureErrors(() =>
    guestResumePath("11111111-1111-1111-1111-111111111111"),
  );
  assert.ok(result.startsWith("/contact?t="));
  assert.equal(logged.length, 0);
});
