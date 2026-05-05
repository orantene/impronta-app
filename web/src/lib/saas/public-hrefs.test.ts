import assert from "node:assert/strict";
import test from "node:test";

import {
  prefixPublicHref,
  prefixPublicHrefsDeep,
} from "./public-hrefs";
import {
  clientLocaleHref,
  publicLocaleHref,
  publicPathPrefixFromPathname,
} from "@/i18n/client-directory-href";

test("prefixPublicHref prefixes only internal root-relative hrefs", () => {
  assert.equal(prefixPublicHref("/directory", "/impronta"), "/impronta/directory");
  assert.equal(
    prefixPublicHref("/directory?sort=featured#top", "/impronta"),
    "/impronta/directory?sort=featured#top",
  );
  assert.equal(prefixPublicHref("/", "/impronta"), "/impronta");
  assert.equal(
    prefixPublicHref("/impronta/directory", "/impronta"),
    "/impronta/directory",
  );
  assert.equal(prefixPublicHref("https://example.com", "/impronta"), "https://example.com");
  assert.equal(prefixPublicHref("mailto:hello@example.com", "/impronta"), "mailto:hello@example.com");
  assert.equal(prefixPublicHref("#section", "/impronta"), "#section");
});

test("prefixPublicHrefsDeep prefixes configured CTA/link fields only", () => {
  const input = {
    href: "/contact",
    imageUrl: "/media/hero.jpg",
    nested: {
      ctaHref: "/directory",
      rsvpUrl: "/join",
      brandHref: "/",
      url: "/do-not-prefix-generic-url",
    },
  };

  assert.deepEqual(prefixPublicHrefsDeep(input, "/impronta"), {
    href: "/impronta/contact",
    imageUrl: "/media/hero.jpg",
    nested: {
      ctaHref: "/impronta/directory",
      rsvpUrl: "/impronta/join",
      brandHref: "/impronta",
      url: "/do-not-prefix-generic-url",
    },
  });
});

test("publicLocaleHref preserves tenant slug before locale prefixing", () => {
  assert.equal(publicPathPrefixFromPathname("/impronta"), "/impronta");
  assert.equal(publicPathPrefixFromPathname("/es/impronta/directory"), "/impronta");
  assert.equal(publicPathPrefixFromPathname("/directory"), "");
  assert.equal(
    publicLocaleHref("/impronta", "/directory?sort=featured", "en"),
    "/impronta/directory?sort=featured",
  );
  assert.equal(
    publicLocaleHref("/impronta", "/directory?sort=featured", "es"),
    "/es/impronta/directory?sort=featured",
  );
  assert.equal(clientLocaleHref("/es/impronta", "/t/TAL-1"), "/es/impronta/t/TAL-1");
});
