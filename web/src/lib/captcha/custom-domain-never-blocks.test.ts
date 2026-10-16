import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { chooseCaptchaSource } from "./platform-hosts";
import { verifyCaptchaToken } from "./verify";

// TUL-1141: guard for TUL-1015. A workspace on its OWN custom domain without its own Turnstile keys
// must never be blocked by the platform widget (it cannot render on that hostname): both the widget
// decision and the server verify resolve to "none" there, and the platform/staging hosts still
// require a token when the platform key is configured.
const realFetch = globalThis.fetch;
let fetchCalls = 0;

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  delete process.env.TURNSTILE_SECRET;
  delete process.env.TURNSTILE_PLATFORM_HOSTS;
});

function platformKeyConfigured() {
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site";
  process.env.TURNSTILE_SECRET = "plat-secret";
  fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return Response.json({ success: true });
  }) as typeof fetch;
}

test("custom domains without own keys: widget choice is none and verify never blocks or calls the vendor", async () => {
  platformKeyConfigured();
  for (const host of ["maria-nails.com", "www.jorgelina-studio.mx", "book.example.org:8443"]) {
    assert.equal(chooseCaptchaSource({ ownUsable: false, host }), "none", host);
    const r = await verifyCaptchaToken({ token: null, host });
    assert.equal(r.ok, true, host);
  }
  assert.equal(fetchCalls, 0);
});

test("own keys on a custom domain still win (the form is protected by the workspace's own widget)", () => {
  assert.equal(chooseCaptchaSource({ ownUsable: true, host: "maria-nails.com" }), "own");
});

test("platform, staging and QA hosts keep the platform widget and still demand a token", async () => {
  platformKeyConfigured();
  for (const host of ["tulala.digital", "app.tulala.digital", "staging.tulala.digital", "app.staging.tulala.digital", "staging-qa-app.tulala.digital"]) {
    assert.equal(chooseCaptchaSource({ ownUsable: false, host }), "platform", host);
    const r = await verifyCaptchaToken({ token: null, host });
    assert.equal(r.ok, false, host);
  }
});

test("a lookalike of the platform domain is NOT covered (it cannot render the widget either)", () => {
  assert.equal(chooseCaptchaSource({ ownUsable: false, host: "evil-tulala.digital" }), "none");
  assert.equal(chooseCaptchaSource({ ownUsable: false, host: "tulala.digital.evil.com" }), "none");
});
