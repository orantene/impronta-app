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
      // NOTE: use a non-auth path (e.g., /rsvp/event-123) — Phase 6C added an
      // isPlatformAuthPath bypass that skips prefixing for /login, /register,
      // /join, etc. (those are NEVER tenant-scoped). Test asserts the rsvp
      // CTA semantics work for ordinary event-rsvp paths.
      rsvpUrl: "/rsvp/event-123",
      brandHref: "/",
      url: "/do-not-prefix-generic-url",
    },
  };

  assert.deepEqual(prefixPublicHrefsDeep(input, "/impronta"), {
    href: "/impronta/contact",
    imageUrl: "/media/hero.jpg",
    nested: {
      ctaHref: "/impronta/directory",
      rsvpUrl: "/impronta/rsvp/event-123",
      brandHref: "/impronta",
      url: "/do-not-prefix-generic-url",
    },
  });
});

test("prefixPublicHrefsDeep skips platform auth paths (Phase 6C carve-out)", () => {
  // /join, /login, /register, /talent/register are platform-level auth
  // routes and MUST NOT be tenant-prefixed. Without this carve-out a CTA
  // href=/login would resolve to /impronta/login → 404 on path-based tenants.
  const input = {
    nested: {
      ctaHref: "/login",
      rsvpUrl: "/join",
      brandHref: "/register",
    },
  };

  assert.deepEqual(prefixPublicHrefsDeep(input, "/impronta"), {
    nested: {
      ctaHref: "/login",
      rsvpUrl: "/join",
      brandHref: "/register",
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
