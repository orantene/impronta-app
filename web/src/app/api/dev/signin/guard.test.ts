import assert from "node:assert/strict";
import test from "node:test";

import { isDevSigninAllowed } from "./guard";

const base = { nodeEnv: "production", vercelEnv: undefined, configuredToken: undefined, presentedToken: null };

test("production is never allowed, token or not", () => {
  assert.equal(isDevSigninAllowed({ ...base, vercelEnv: "production", configuredToken: "t", presentedToken: "t" }), false);
});

test("TUL-1269: a Vercel preview is 403 without the token header", () => {
  const preview = { ...base, vercelEnv: "preview" };
  assert.equal(isDevSigninAllowed(preview), false, "no token configured and none sent");
  assert.equal(isDevSigninAllowed({ ...preview, configuredToken: "secret" }), false, "configured, none sent");
  assert.equal(isDevSigninAllowed({ ...preview, configuredToken: "secret", presentedToken: "wrong" }), false);
  assert.equal(isDevSigninAllowed({ ...preview, presentedToken: "anything" }), false, "unset token = closed");
  assert.equal(isDevSigninAllowed({ ...preview, configuredToken: "secret", presentedToken: "secret" }), true);
});

test("local development stays open unless DEV_SIGNIN_TOKEN is set (the CI talent-website lane)", () => {
  const dev = { ...base, nodeEnv: "development" };
  assert.equal(isDevSigninAllowed(dev), true, "CI E2E (NODE_ENV=development, no token env) keeps working");
  assert.equal(isDevSigninAllowed({ ...dev, configuredToken: "secret" }), false);
  assert.equal(isDevSigninAllowed({ ...dev, configuredToken: "secret", presentedToken: "secret" }), true);
});

test("INVARIANT the route is wired to the guard and the old env-only check is gone", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const src = readFileSync(join(process.cwd(), "src/app/api/dev/signin/route.ts"), "utf8");
  assert.match(src, /isDevSigninAllowed\(\{[\s\S]*presentedToken: request\.headers\.get\(DEV_SIGNIN_TOKEN_HEADER\)/);
  assert.doesNotMatch(src, /if \(!isDev && !isPreview\)/);
});
