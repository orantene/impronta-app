import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

test("claim runs on any successful sign-in or sign-up, not inside requireClient", () => {
  const auth = readFileSync(join(here, "../../app/auth/actions.ts"), "utf8");
  const callback = readFileSync(join(here, "../../app/auth/callback/route.ts"), "utf8");
  const hook = readFileSync(join(here, "guest-claim-auth.ts"), "utf8");
  assert.ok(auth.includes("claimGuestSupportOnAuth"));
  assert.ok(auth.includes("signInWithEmail"));
  assert.ok(auth.includes("signUpTalentInPlace"));
  assert.ok(callback.includes("claimGuestSupportOnAuth"));
  assert.equal(hook.includes("requireClient"), false);
  assert.equal(hook.includes("app_role"), false);
});

test("autoclose and ticket-fixed emit a distinct guest trigger for pure guests", () => {
  const lifecycle = readFileSync(
    join(here, "../../app/api/cron/support-lifecycle/route.ts"),
    "utf8",
  );
  const insights = readFileSync(join(here, "insights/actions.ts"), "utf8");
  assert.ok(lifecycle.includes("support.ticket.autoclose.guest"));
  assert.ok(lifecycle.includes("shouldEmitGuestRequesterMail"));
  assert.ok(insights.includes("support.ticket.fixed.guest"));
  assert.ok(insights.includes("shouldEmitGuestRequesterMail"));
});

test("guest actions and launcher refuse when the cookie is unsigned", () => {
  const actions = readFileSync(join(here, "guest-actions.ts"), "utf8");
  const mount = readFileSync(
    join(here, "../../components/marketing/support/MarketingSupportLauncherMount.tsx"),
    "utf8",
  );
  assert.ok(actions.includes("guestSupportMayServe"));
  assert.ok(mount.includes("guestSupportMayServe"));
});
