import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { localizeHrefsDeep } from "./locale-hrefs-deep";
import { localeUrlSettings } from "@/i18n/pathnames";

const SETTINGS = localeUrlSettings("en", ["en", "es"]);

describe("localizeHrefsDeep", () => {
  it("prefixes an internal href for a non-default locale", () => {
    assert.deepEqual(localizeHrefsDeep({ href: "/contact" }, "es", SETTINGS), {
      href: "/es/contact",
    });
  });

  it("is a no-op for the default locale (byte-identical English render)", () => {
    const tree = [{ props: { href: "/contact" } }];
    assert.deepEqual(localizeHrefsDeep(tree, "en", SETTINGS), tree);
  });

  it("reaches NESTED href props — the requestCta.href the one-design collapse missed", () => {
    const node = {
      kind: "section",
      props: { requestCta: { href: "/contact", label: "Request" } },
    };
    assert.deepEqual(localizeHrefsDeep(node, "es", SETTINGS), {
      kind: "section",
      props: { requestCta: { href: "/es/contact", label: "Request" } },
    });
  });

  it("is idempotent — an already-prefixed href never becomes /es/es/...", () => {
    assert.deepEqual(localizeHrefsDeep({ href: "/es/contact" }, "es", SETTINGS), {
      href: "/es/contact",
    });
  });

  it("rewrites a stale OTHER-locale prefix to the active locale", () => {
    assert.deepEqual(localizeHrefsDeep({ href: "/es/contact" }, "en", SETTINGS), {
      href: "/contact",
    });
  });

  it("leaves external, mailto, tel, protocol-relative and anchor hrefs alone", () => {
    const input = {
      a: { href: "https://example.com/x" },
      b: { href: "mailto:hi@example.com" },
      c: { href: "tel:+52984" },
      d: { href: "//cdn.example.com/y" },
      e: { href: "#stories" },
    };
    assert.deepEqual(localizeHrefsDeep(input, "es", SETTINGS), input);
  });

  it("preserves query and hash while prefixing", () => {
    assert.deepEqual(
      localizeHrefsDeep({ href: "/directory?type=dj#top" }, "es", SETTINGS),
      { href: "/es/directory?type=dj#top" },
    );
  });

  it("covers every href-bearing key and walks arrays", () => {
    assert.deepEqual(
      localizeHrefsDeep(
        { items: [{ ctaHref: "/a" }, { rsvpUrl: "/b" }, { brandHref: "/c" }] },
        "es",
        SETTINGS,
      ),
      { items: [{ ctaHref: "/es/a" }, { rsvpUrl: "/es/b" }, { brandHref: "/es/c" }] },
    );
  });

  it("does NOT touch form action endpoints (locale-independent API routes)", () => {
    assert.deepEqual(
      localizeHrefsDeep({ action: "/api/cms/forms/submit" }, "es", SETTINGS),
      { action: "/api/cms/forms/submit" },
    );
  });

  it("tolerates null/undefined and non-object values", () => {
    assert.equal(localizeHrefsDeep(null, "es", SETTINGS), null);
    assert.equal(localizeHrefsDeep(undefined, "es", SETTINGS), undefined);
    assert.equal(localizeHrefsDeep("plain", "es", SETTINGS), "plain");
    assert.deepEqual(localizeHrefsDeep({ href: 42 }, "es", SETTINGS), { href: 42 });
  });
});
