import assert from "node:assert/strict";
import { test } from "node:test";

import { isStaleSlug, slugsReferencedByShell } from "./archive-stale-pages";

test("only the rebuild's own leftovers match", () => {
  for (const slug of ["about-new", "home-new", "untitled-mrbhwmse", "untitled-x"]) {
    assert.equal(isStaleSlug(slug), true, `${slug} should be stale`);
  }
  // The real pages must never match, including ones whose names contain the
  // patterns. "news" ends in "new" + s; a looser check would archive it.
  for (const slug of ["about", "home", "contact", "news", "renew", "newsletter"]) {
    assert.equal(isStaleSlug(slug), false, `${slug} must be protected`);
  }
});

test("shell hrefs resolve to the slugs they protect", () => {
  const shell = [
    { props: { links: [{ href: "/p/about" }, { href: "/es/p/contact" }] } },
    { props: { href: "/directory" } },
    { props: { href: "https://instagram.com/x" } },
  ];
  const slugs = slugsReferencedByShell(shell);
  assert.ok(slugs.has("about"));
  assert.ok(slugs.has("contact"), "a locale prefix must not hide the slug");
  assert.ok(slugs.has("directory"));
  assert.ok(!slugs.has("https://instagram.com/x"), "external links are not slugs");
});

test("a link to the site root protects the empty slug", () => {
  // Conservative on purpose: the walk cannot tell "the / route" from "a page
  // whose slug is empty", so it protects the row. Archiving a homepage because
  // its slug looked blank is not a recoverable kind of tidy.
  const slugs = slugsReferencedByShell([{ props: { href: "/" } }]);
  assert.ok(slugs.has(""));
});
