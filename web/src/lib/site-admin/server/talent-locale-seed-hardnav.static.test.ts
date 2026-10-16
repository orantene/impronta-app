import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { seedAttemptCookieSecure } from "./talent-locale-seed";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("talent locale-seed hop: hard navigation and a cookie that holds on http", () => {
  it("the talent layout hops with a hard navigation, never a layout redirect() to the seed route", () => {
    const src = read("src/app/(workspace)/talent/_talent-layout-inner.tsx");
    assert.match(src, /import \{ LocaleSeedHardRedirect \} from "@\/components\/admin\/shell\/locale-seed-hard-redirect"/);
    assert.match(src, /<LocaleSeedHardRedirect\s+href=\{talentLocaleSeedHref\(/);
    assert.doesNotMatch(src, /redirect\(talentLocaleSeedHref/);
  });

  it("the seed route's attempt cookie is Secure only over https, not from NODE_ENV", () => {
    const src = read("src/app/api/talent/locale-seed/route.ts");
    assert.match(src, /secure: seedAttemptCookieSecure\(/);
    assert.doesNotMatch(src, /secure: process\.env\.NODE_ENV/);
  });

  it("seedAttemptCookieSecure: https (direct or forwarded) is Secure, plain http is not", () => {
    assert.equal(seedAttemptCookieSecure({ protocol: "https:", forwardedProto: null }), true);
    assert.equal(seedAttemptCookieSecure({ protocol: "http:", forwardedProto: "https" }), true);
    assert.equal(seedAttemptCookieSecure({ protocol: "http:", forwardedProto: "https, http" }), true);
    assert.equal(seedAttemptCookieSecure({ protocol: "http:", forwardedProto: null }), false);
    assert.equal(seedAttemptCookieSecure({ protocol: "http:", forwardedProto: "http" }), false);
    assert.equal(seedAttemptCookieSecure({ protocol: null, forwardedProto: null }), false);
  });
});
