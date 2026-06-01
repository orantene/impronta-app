import assert from "node:assert/strict";
import test from "node:test";

import {
  neutralizeDangerousHref,
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

// ── SECURITY: render-time scheme guard (defense in depth) ──────────────────

test("neutralizeDangerousHref neutralizes script-capable schemes to #", () => {
  // Dangerous schemes that execute when an <a> is clicked.
  assert.equal(neutralizeDangerousHref("javascript:alert(1)"), "#");
  assert.equal(neutralizeDangerousHref("JavaScript:alert(1)"), "#"); // case-insensitive
  assert.equal(neutralizeDangerousHref("  javascript:alert(1)"), "#"); // leading space
  assert.equal(neutralizeDangerousHref("javascript:alert(1)"), "#");
  // leading C0 control chars (NUL, STX) are stripped by browsers before the scheme
  assert.equal(
    neutralizeDangerousHref(String.fromCharCode(1, 2) + "javascript:alert(1)"),
    "#",
  );
  assert.equal(neutralizeDangerousHref("java\tscript:alert(1)"), "#"); // embedded tab (browser-stripped)
  assert.equal(neutralizeDangerousHref("java\nscript:alert(1)"), "#"); // embedded newline
  assert.equal(neutralizeDangerousHref("data:text/html,<script>alert(1)</script>"), "#");
  assert.equal(neutralizeDangerousHref("DATA:text/html,x"), "#");
  assert.equal(neutralizeDangerousHref("vbscript:msgbox(1)"), "#");
  // Other non-navigational schemes are neutralized too (allowlist, not denylist).
  assert.equal(neutralizeDangerousHref("blob:https://x/abc"), "#");
  assert.equal(neutralizeDangerousHref("file:///etc/passwd"), "#");
});

test("neutralizeDangerousHref preserves legitimate link schemes + relative hrefs", () => {
  assert.equal(neutralizeDangerousHref("https://example.com/x?y=1#z"), "https://example.com/x?y=1#z");
  assert.equal(neutralizeDangerousHref("http://example.com"), "http://example.com");
  assert.equal(neutralizeDangerousHref("mailto:hello@example.com"), "mailto:hello@example.com");
  assert.equal(neutralizeDangerousHref("tel:+1 (555) 123-4567"), "tel:+1 (555) 123-4567");
  assert.equal(neutralizeDangerousHref("sms:+15551234567"), "sms:+15551234567");
  // Scheme-less hrefs are navigational and untouched.
  assert.equal(neutralizeDangerousHref("/directory"), "/directory");
  assert.equal(neutralizeDangerousHref("/directory?sort=featured#top"), "/directory?sort=featured#top");
  assert.equal(neutralizeDangerousHref("#section"), "#section");
  assert.equal(neutralizeDangerousHref("?q=1"), "?q=1");
  assert.equal(neutralizeDangerousHref("./relative"), "./relative");
  assert.equal(neutralizeDangerousHref("../up"), "../up");
  assert.equal(neutralizeDangerousHref("//cdn.example.com/a"), "//cdn.example.com/a");
  assert.equal(neutralizeDangerousHref(""), "");
  // A colon inside a relative path is not a scheme — must pass through.
  assert.equal(neutralizeDangerousHref("/foo:bar"), "/foo:bar");
});

test("prefixPublicHref neutralizes dangerous schemes regardless of prefix", () => {
  // Tenant-prefixed surface.
  assert.equal(prefixPublicHref("javascript:alert(1)", "/impronta"), "#");
  assert.equal(prefixPublicHref("data:text/html,x", "/impronta"), "#");
  // Apex surface (empty prefix) — the early fast-path must NOT leak the href.
  assert.equal(prefixPublicHref("javascript:alert(1)", ""), "#");
  assert.equal(prefixPublicHref("vbscript:x", ""), "#");
  // Legit CTAs survive on both surfaces.
  assert.equal(prefixPublicHref("mailto:hi@x.com", "/impronta"), "mailto:hi@x.com");
  assert.equal(prefixPublicHref("tel:+15551234567", ""), "tel:+15551234567");
  assert.equal(prefixPublicHref("https://x.com", "/impronta"), "https://x.com");
});

test("prefixPublicHrefsDeep neutralizes dangerous CTA fields even on apex (empty prefix)", () => {
  const input = {
    href: "javascript:alert(1)",
    nested: {
      ctaHref: "data:text/html,x",
      rsvpUrl: "tel:+15551234567",
      brandHref: "mailto:hi@x.com",
      url: "javascript:notAGuardedField()", // generic field is not a CTA field — left as-is
    },
  };
  // Empty prefix = apex domain. Dangerous CTA fields still get neutralized.
  assert.deepEqual(prefixPublicHrefsDeep(input, ""), {
    href: "#",
    nested: {
      ctaHref: "#",
      rsvpUrl: "tel:+15551234567",
      brandHref: "mailto:hi@x.com",
      url: "javascript:notAGuardedField()",
    },
  });
  // Tenant-prefixed surface neutralizes too.
  assert.equal(
    (prefixPublicHrefsDeep({ href: "javascript:alert(1)" }, "/impronta") as { href: string }).href,
    "#",
  );
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
