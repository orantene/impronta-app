import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { TALENT_BOOK_HREF, isTalentOpenHash } from "./contact-channels";
import { resolveHubProfileCta, talentSiteBookHref } from "./hub-profile-book-cta";
import { resolveMaxSiteLinkUrl } from "./max-site-link-url";

test("platform host + site: primary Book deep-links to the dedicated #book anchor", () => {
  assert.deepEqual(
    resolveHubProfileCta({ platformHost: true, maxSiteUrl: "https://jorgelina.example.com" }),
    { kind: "book", href: "https://jorgelina.example.com#book", external: true },
  );
});

test("platform host + path-address site: relative href, not external", () => {
  assert.deepEqual(
    resolveHubProfileCta({ platformHost: true, maxSiteUrl: "/t/site/jorgelina" }),
    { kind: "book", href: "/t/site/jorgelina#book", external: false },
  );
});

test("no site keeps Inquire", () => {
  for (const maxSiteUrl of [null, undefined, "", "   "]) {
    assert.deepEqual(resolveHubProfileCta({ platformHost: true, maxSiteUrl }), { kind: "inquire" });
  }
});

test("agency host keeps Inquire even with a site", () => {
  assert.deepEqual(
    resolveHubProfileCta({ platformHost: false, maxSiteUrl: "https://x.example.com" }),
    { kind: "inquire" },
  );
});

test("an existing hash is replaced, never stacked", () => {
  assert.equal(talentSiteBookHref("https://x.example.com/#about"), "https://x.example.com/#book");
});

test("intake switches: Book only when the ask entry has a working entry point", () => {
  const site = "https://x.example.com";
  for (const askEntry of ["chat", "form"] as const) {
    assert.equal(resolveHubProfileCta({ platformHost: true, maxSiteUrl: site, askEntry }).kind, "book");
  }
  for (const askEntry of ["unavailable", "hidden", "closed_notice", "existing_client"] as const) {
    assert.deepEqual(resolveHubProfileCta({ platformHost: true, maxSiteUrl: site, askEntry }), {
      kind: "inquire",
    });
  }
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

test("TUL-77: ask-label clicks open the guest entry even when href is /agendar", () => {
  const src = readFileSync(join(process.cwd(), "src/app/%5Ftalent-site/TalentSiteContactBridge.tsx"), "utf8");
  // Intercept by label as well as href — otherwise Escríbenos → /agendar only reloads.
  assert.match(src, /!isAskHref\(href\) && !isAskLabel\(label\)/);
  assert.match(src, /"escríbenos"/);
  assert.match(src, /"get in touch"/);
});

test("hub profile wires askEntry and no longer drops Book behind the slot picker", () => {
  const src = readFileSync(join(process.cwd(), "src/app/t/[profileCode]/profile-view.tsx"), "utf8");
  assert.match(src, /<HubProfileCta [^>]*askEntry=\{talentAskEntry\}/);
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
