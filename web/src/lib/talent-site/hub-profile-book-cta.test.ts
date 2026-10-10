import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { TALENT_BOOK_HREF, isTalentOpenHash } from "./contact-channels";
import { resolveHubProfileCta, talentSiteBookHref } from "./hub-profile-book-cta";
import { resolveMaxSiteLinkUrl } from "./max-site-link-url";

test("platform host + bookable services: primary Book is on-page #book", () => {
  assert.deepEqual(
    resolveHubProfileCta({ platformHost: true, hasBookableServices: true }),
    { kind: "book", href: "#book", external: false },
  );
});

test("non-bookable keeps Inquire even on the platform host", () => {
  assert.deepEqual(
    resolveHubProfileCta({ platformHost: true, hasBookableServices: false }),
    { kind: "inquire" },
  );
});

test("agency host keeps Inquire even when bookable", () => {
  assert.deepEqual(
    resolveHubProfileCta({ platformHost: false, hasBookableServices: true }),
    { kind: "inquire" },
  );
});

test("talentSiteBookHref replaces an existing hash, never stacks", () => {
  assert.equal(talentSiteBookHref("https://x.example.com/#about"), "https://x.example.com/#book");
});

test("#book and #talent-ask both open the guest entry", () => {
  assert.equal(TALENT_BOOK_HREF, "#book");
  assert.equal(isTalentOpenHash("#book"), true);
  assert.equal(isTalentOpenHash("#talent-ask"), true);
  assert.equal(isTalentOpenHash("#about"), false);
  assert.equal(isTalentOpenHash(""), false);
});

test("site bridge opens on the INITIAL fragment, not only on hashchange", () => {
  const src = readFileSync(join(process.cwd(), "src/app/%5Ftalent-site/TalentSiteContactBridge.tsx"), "utf8");
  // TUL-246: the cold-load open runs once and is queued behind the ready handshake, no timers.
  // TUL-232 composes with it: the cold load tries the slot deep link first (one bounded retry for a
  // deep link whose offering has not registered yet), then queues the plain entry.
  assert.match(src, /coldLoadHandledFor = window\.location\.href;\s*onHash\(false\);/);
  assert.doesNotMatch(src, /setTimeout\(onHash\b/);
  assert.match(src, /addEventListener\("hashchange", onHashChange\)/);
  assert.match(src, /<span id="book" data-talent-book-target=""/);
});

test("hub profile wires hasBookableServices and no longer drops Book behind the slot picker", () => {
  const src = readFileSync(join(process.cwd(), "src/app/t/[profileCode]/profile-view.tsx"), "utf8");
  assert.match(src, /<HubProfileCta [^>]*hasBookableServices=\{hubBookEntry\.kind === "sheet"\}/);
  assert.doesNotMatch(src, /const inquireButtons = \(btnClass: string\) =>\s*showSlotPicker \? null/);
});

test("max site link: custom domain, then subdomain (flag on), then path", () => {
  const base = { siteSlug: "book-jorgelina", subdomainsEnabled: true };
  assert.equal(resolveMaxSiteLinkUrl({ ...base, customDomain: "jorgelina.com" }), "https://jorgelina.com");
  assert.equal(
    resolveMaxSiteLinkUrl({ ...base, customDomain: null }),
    "https://book-jorgelina.tulala.digital",
  );
  assert.equal(
    resolveMaxSiteLinkUrl({ ...base, customDomain: null, isDemo: true }),
    "https://book-jorgelina-demo.tulala.digital",
  );
  assert.equal(
    resolveMaxSiteLinkUrl({ ...base, customDomain: null, subdomainsEnabled: false }),
    "/t/site/book-jorgelina",
  );
  assert.equal(resolveMaxSiteLinkUrl({ siteSlug: "", customDomain: null, subdomainsEnabled: true }), null);
});
