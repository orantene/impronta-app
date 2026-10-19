import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// TUL-1017: the auto widget hooks only run behind CAPTCHA_AUTO_WIDGET === "1".
const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

function callsOnlyBehindFlag(src: string, hook: string) {
  const callIdx = src.indexOf(`${hook}(`);
  assert.ok(callIdx > 0, `${hook} is called`);
  assert.equal(src.indexOf(`${hook}(`, callIdx + 1), -1, `${hook} is called once`);
  const flagIdx = src.lastIndexOf('if (process.env.CAPTCHA_AUTO_WIDGET === "1") {', callIdx);
  assert.ok(flagIdx > 0 && flagIdx < callIdx, `${hook} sits inside the flag check`);
  const between = src.slice(flagIdx, callIdx);
  const opens = (between.match(/\{/g) ?? []).length;
  const closes = (between.match(/\}/g) ?? []).length;
  assert.ok(opens > closes, `${hook} call is still inside the flag block`);
}

test("domain-verification cron calls the provisioning hook only behind the flag", () => {
  const src = read("src/app/api/cron/domain-verification/route.ts");
  callsOnlyBehindFlag(src, "provisionAutoTurnstileWidgetsForActivatedDomains");
  assert.match(src, /r\.to === "active" && r\.from !== "active"/);
});

test("custom domain removal calls the release hook only behind the flag", () => {
  const src = read("src/app/(workspace)/[tenantSlug]/admin/settings/domain-actions.ts");
  callsOnlyBehindFlag(src, "releaseAutoTurnstileWidgetForDomain");
});

test("the client never names the rotate-secret endpoint", () => {
  const src = read("src/lib/captcha/turnstile-auto-widget/cloudflare-client.ts");
  assert.doesNotMatch(src, /rotate_secret|rotate-secret/);
});

test("saving own keys in the Captcha drawer clears the tulala-auto marker", () => {
  const src = read("src/app/(workspace)/[tenantSlug]/admin/settings/integration-actions-specialised.ts");
  assert.match(src, /managed_by: null/);
});
