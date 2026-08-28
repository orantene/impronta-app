/**
 * Clean public URLs — the `/p/<slug>` ↔ `/<slug>` grammar.
 *
 * Every redirect assertion here pins the DESTINATION, never just "it
 * redirects". A guard that only checks for a 3xx passes just as happily when
 * the target is wrong, and this repo has already shipped one that did exactly
 * that (see the guards-green-measuring-nothing incident).
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveCleanUrlRewriteTarget,
  resolveLegacyCmsRedirectPath,
} from "./clean-urls";
import { normalizeCleanRedirectDestination } from "./clean-url-middleware";
import { isPathAllowedForHostKind } from "@/lib/saas/surface-allow-list";

const isPathAllowed = (path: string) => isPathAllowedForHostKind("agency", path);
const langSettings = { publicLocales: ["en", "es"] };

function redirect(pathname: string, hostKind = "agency"): string | null {
  return resolveLegacyCmsRedirectPath({
    hostKind,
    pathname,
    languageSettings: langSettings,
    isPathAllowed,
  });
}

function rewrite(canonicalPath: string, hostKind = "agency"): string | null {
  return resolveCleanUrlRewriteTarget({ hostKind, canonicalPath, isPathAllowed });
}

// ── P1: serving clean URLs ─────────────────────────────────────────────────

test("a tenant path the platform does not own rewrites to the CMS catch-all", () => {
  assert.equal(rewrite("/about"), "/p/about");
  assert.equal(rewrite("/contact"), "/p/contact");
  assert.equal(rewrite("/services/photography"), "/p/services/photography");
});

test("platform routes are never treated as page slugs", () => {
  for (const path of [
    "/login",
    "/register",
    "/directory",
    "/posts",
    "/models",
    "/admin",
    "/t/abc123",
    "/api/directory",
    "/checkout/success",
    "/unsubscribe/tok",
  ]) {
    assert.equal(rewrite(path), null, `${path} must stay a platform route`);
  }
});

test("the site shell sentinel is never publicly routable", () => {
  // Underscores fail the slug grammar, so `/__site_shell__` at the public root
  // cannot be rewritten into the internal shell-editing surface.
  assert.equal(rewrite("/__site_shell__"), null);
  assert.equal(rewrite("/p/__site_shell__"), null);
});

test("only tenant surfaces serve clean page URLs", () => {
  for (const kind of ["marketing", "hub", "app", "not_found"]) {
    assert.equal(rewrite("/about", kind), null, `${kind} must not serve page slugs`);
  }
});

test("malformed paths are left alone", () => {
  assert.equal(rewrite("/"), null);
  assert.equal(rewrite("/About"), null);
  assert.equal(rewrite("/a b"), null);
  assert.equal(rewrite("/about/"), null);
});

// ── P2: the 301 layer ──────────────────────────────────────────────────────

test("legacy /p/<slug> redirects to the clean root URL", () => {
  assert.equal(redirect("/p/about"), "/about");
  assert.equal(redirect("/p/services/photography"), "/services/photography");
});

test("locale prefixes are preserved across the redirect", () => {
  assert.equal(redirect("/es/p/about"), "/es/about");
  assert.equal(redirect("/es/p/services/photography"), "/es/services/photography");
  // The default locale is stripped upstream, but if `/en/` ever reaches here
  // it must still come out the other side rather than being dropped.
  assert.equal(redirect("/en/p/about"), "/en/about");
});

test("the /w/<tenantSlug> workspace prefix is preserved", () => {
  assert.equal(redirect("/w/acme/p/about"), "/w/acme/about");
  assert.equal(redirect("/es/w/acme/p/about"), "/es/w/acme/about");
  assert.equal(
    redirect("/es/w/acme/p/services/photography"),
    "/es/w/acme/services/photography",
  );
});

test("an unknown leading segment is not mistaken for a locale", () => {
  // "acme" is not in publicLocales, so this is not `<locale>/p/...`; it is a
  // path that happens to contain "p" and must not collapse.
  assert.equal(redirect("/acme/p/about"), null);
});

test("the site shell editing surface never redirects", () => {
  // `/p/__site_shell__` is the flag-gated, staff-only shell editor. A 301 to
  // `/__site_shell__` would send the operator to a public 404.
  assert.equal(redirect("/p/__site_shell__"), null);
});

test("a grandfathered slug that collides with a platform route keeps serving", () => {
  // These slugs are now blocked at creation, but rows created before the
  // reserved list grew must keep resolving to the page rather than being
  // 301'd onto a completely different surface.
  assert.equal(redirect("/p/directory"), null);
  assert.equal(redirect("/p/login"), null);
  assert.equal(redirect("/p/posts"), null);
});

test("bare /p does not redirect", () => {
  assert.equal(redirect("/p"), null);
  assert.equal(redirect("/es/p"), null);
  assert.equal(redirect("/w/acme/p"), null);
});

test("non-tenant surfaces do not collapse /p", () => {
  for (const kind of ["marketing", "hub", "app", "not_found"]) {
    assert.equal(redirect("/p/about", kind), null);
  }
});

test("paths that are not the CMS namespace are untouched", () => {
  assert.equal(redirect("/about"), null);
  assert.equal(redirect("/posts/hello"), null);
  assert.equal(redirect("/pages/about"), null);
  assert.equal(redirect("/es/directory"), null);
});

// ── Tenant-authored redirect destinations ──────────────────────────────────

test("a tenant redirect pointing at the retired /p/ form is collapsed", () => {
  // `/about → /p/about` was a sensible rule to write while `/p/` was the real
  // URL. Left alone it becomes an infinite loop the moment `/p/about` 301s
  // back to `/about`.
  const locales = ["en", "es"];
  assert.equal(normalizeCleanRedirectDestination("/p/about", locales), "/about");
  assert.equal(normalizeCleanRedirectDestination("/es/p/about", locales), "/es/about");
  assert.equal(
    normalizeCleanRedirectDestination("/w/acme/p/about", locales),
    "/w/acme/about",
  );
});

test("redirect destinations that are not legacy CMS paths are untouched", () => {
  const locales = ["en", "es"];
  for (const path of ["/about", "/directory", "/p/login", "/", "/posts/hello"]) {
    assert.equal(normalizeCleanRedirectDestination(path, locales), path);
  }
});

// ── The two directions must agree ──────────────────────────────────────────

test("every redirect destination rewrites back to the URL it came from", () => {
  // The 301 and the internal rewrite are inverses. If they ever disagree, a
  // legacy link 301s to a URL that then 404s — the exact way a redirect layer
  // silently breaks old links.
  for (const legacy of ["/p/about", "/p/contact", "/p/services/photography"]) {
    const destination = redirect(legacy);
    assert.ok(destination, `${legacy} should redirect`);
    assert.equal(rewrite(destination!), legacy);
  }
});
