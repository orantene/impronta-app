import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { resolveResumeLocale } from "./resume-locale";
import { guestResumePath, signGuestResumeToken, verifyGuestResumeToken } from "./guest-resume-token";

test("resume link opens in the ticket's language, else the request language", () => {
  assert.equal(resolveResumeLocale("es", "en"), "es");
  assert.equal(resolveResumeLocale("en", "es"), "en");
  assert.equal(resolveResumeLocale(undefined, "es"), "es");
  assert.equal(resolveResumeLocale("fr", "en"), "en");
});

test("resume token round-trips to the same ticket", () => {
  process.env.GUEST_COOKIE_SECRET = "test-secret-for-resume";
  const path = guestResumePath("11111111-1111-1111-1111-111111111111");
  assert.ok(path.startsWith("/contact?t="));
  const token = decodeURIComponent(path.slice("/contact?t=".length));
  const v = verifyGuestResumeToken(token);
  assert.equal(v.ok && v.ticketId, "11111111-1111-1111-1111-111111111111");
  assert.equal(signGuestResumeToken("x") !== null, true);
});

test("contact page mounts the panel inline and the action can mint a guest cookie", () => {
  const resume = readFileSync("src/components/marketing/support/MarketingContactResume.tsx", "utf8");
  assert.ok(resume.includes("MarketingSupportPanel"), "must not depend on the optional launcher FAB");
  assert.ok(!resume.includes("openMarketingSupport"));
  const actions = readFileSync("src/lib/support/guest-actions.ts", "utf8");
  assert.ok(actions.includes("requireSignedGuest({ mint: true })"));
  const page = readFileSync("src/components/marketing/support/MarketingContactPage.tsx", "utf8");
  assert.ok(!page.includes("resumeGuestThreadAction"), "server render cannot set cookies");
});
