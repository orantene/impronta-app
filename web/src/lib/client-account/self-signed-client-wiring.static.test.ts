import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

test("TUL-771: the client sign-up marks the verify step as a client sign-up and the action activates", () => {
  assert.match(read("src/app/(auth)/register/page.tsx"), /clientSignup\s+submitLabel/);
  assert.match(read("src/components/auth/email-code-form.tsx"), /name="signup_intent" value="client"/);
  assert.match(read("src/components/auth/signup-code-confirm.tsx"), /name="signup_intent" value="client"/);
  const action = read("src/app/auth/otp-actions.ts");
  assert.match(action, /formData\.get\("signup_intent"\) \?\? ""\) === "client"/);
  assert.match(action, /activateSelfSignedClient\(admin, \{ userId: user\.id, signupIntent: "client" \}\)/);
});

test("TUL-771: activation creates the client_profiles row first (account_status is recomputed from it)", () => {
  const src = read("src/lib/client-account/guest-activate.server.ts");
  const fn = src.slice(src.indexOf("export async function activateSelfSignedClient"));
  assert.ok(fn.indexOf('from("client_profiles")') > 0 && fn.indexOf('from("client_profiles")') < fn.indexOf('account_status: "active"'));
});
