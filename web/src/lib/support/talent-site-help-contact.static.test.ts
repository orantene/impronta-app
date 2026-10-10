import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * TUL-310: talent-site footer Help must open the marketing contact form and
 * attach host + talent code on the guest ticket. Static wire check so a
 * refactor cannot drop the attachment path while unit tests still pass.
 */

const guestActions = readFileSync(join(process.cwd(), "src/lib/support/guest-actions.ts"), "utf8");
const contactForm = readFileSync(
  join(process.cwd(), "src/components/marketing/support/MarketingContactForm.tsx"),
  "utf8",
);
const footerSocket = readFileSync(join(process.cwd(), "src/lib/talent-site/footer-socket.ts"), "utf8");
const renderMax = readFileSync(
  join(process.cwd(), "src/lib/talent-site/server/render-max-site.tsx"),
  "utf8",
);

function actionBody(name: string): string {
  const start = guestActions.indexOf(`export async function ${name}(`);
  assert.ok(start > -1, `${name} not found`);
  const next = guestActions.indexOf("\nexport async function ", start + 1);
  return guestActions.slice(start, next === -1 ? guestActions.length : next);
}

test("footer Help href builder exists and is wired into the socket model", () => {
  assert.match(footerSocket, /talentSiteHelpHref/);
  assert.match(footerSocket, /tulala-help/);
  assert.match(footerSocket, /helpContext/);
  assert.match(renderMax, /helpContext/);
  assert.match(renderMax, /profileCode/);
});

test("marketing contact form forwards source/host/code to the guest action", () => {
  assert.match(contactForm, /talentSite\?\.source/);
  assert.match(contactForm, /talentSite\?\.host/);
  assert.match(contactForm, /talentSite\?\.code/);
});

test("submitMarketingContactAction attaches talent_profile_id + host/code metadata", () => {
  const body = actionBody("submitMarketingContactAction");
  assert.match(body, /parseTalentSiteHelpContactInput/);
  assert.match(body, /talentProfileId/);
  assert.match(body, /profile_code/);
  assert.match(body, /talent_site_footer|talentSite/);
  assert.match(body, /\.eq\("profile_code"/);
});
