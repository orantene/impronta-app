/**
 * Phase 6C — exhaustive resolveLinkRef + coercion tests.
 * Run: npx tsx --test src/lib/site-admin/links/resolve-link-ref.test.ts
 *
 * Every kind is asserted across BOTH storefront contexts:
 *   - path-based tenant   (pathPrefix = "/impronta")
 *   - host-based domain   (pathPrefix = "")
 * with explicit coverage of the route-safety "Finding B" cases.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { coerceLegacyHref, linkRefOrLegacy, type LinkRef } from "./link-ref";
import { resolveLinkRef, resolveLinkLike } from "./resolve-link-ref";

const PATH = { pathPrefix: "/impronta" } as const; // path-based tenant
const HOST = { pathPrefix: "" } as const; // host-based custom domain

test("tenant-page: prefix-aware on path-based, untouched on host-based", () => {
  const ref: LinkRef = { kind: "tenant-page", value: "/about" };
  assert.equal(resolveLinkRef(ref, PATH).href, "/impronta/about");
  assert.equal(resolveLinkRef(ref, HOST).href, "/about");
});

test("FINDING B: platform-auth-login is ROOT, never tenant-prefixed", () => {
  const ref: LinkRef = { kind: "platform-auth-login" };
  assert.equal(resolveLinkRef(ref, PATH).href, "/login"); // NOT /impronta/login
  assert.equal(resolveLinkRef(ref, HOST).href, "/login");
});

test("FINDING B: legacy '/login' string auto-coerces to safe auth kind", () => {
  const ref = coerceLegacyHref("/login");
  assert.equal(ref.kind, "platform-auth-login");
  // The whole point: even on a path-based tenant it stays root.
  assert.equal(resolveLinkRef(ref, PATH).href, "/login");
  assert.equal(resolveLinkLike("/login", PATH).href, "/login");
});

test("FINDING B: legacy '/talent/register' → register(role=talent), root, allow-listed", () => {
  const ref = coerceLegacyHref("/talent/register");
  assert.equal(ref.kind, "platform-auth-register");
  assert.equal(ref.value, "talent");
  // Resolves to the allow-listed root /register?role=talent (NOT the
  // un-allow-listed /talent/register, NOT /impronta/talent/register).
  assert.equal(resolveLinkRef(ref, PATH).href, "/register?role=talent");
  assert.equal(resolveLinkRef(ref, HOST).href, "/register?role=talent");
});

test("platform-auth-login preserves a specific auth path, still root", () => {
  const ref: LinkRef = { kind: "platform-auth-login", value: "/forgot-password" };
  assert.equal(resolveLinkRef(ref, PATH).href, "/forgot-password");
});

test("platform-auth-register without role → bare /register root", () => {
  assert.equal(resolveLinkRef({ kind: "platform-auth-register" }, PATH).href, "/register");
});

test("tenant-directory: base + filter, prefix-aware", () => {
  assert.equal(
    resolveLinkRef({ kind: "tenant-directory" }, PATH).href,
    "/impronta/directory",
  );
  assert.equal(
    resolveLinkRef({ kind: "tenant-directory", value: "?city=tulum" }, PATH).href,
    "/impronta/directory?city=tulum",
  );
  assert.equal(
    resolveLinkRef({ kind: "tenant-directory", value: "role=model" }, HOST).href,
    "/directory?role=model",
  );
});

test("talent-profile: /t/<code> prefix-aware; tolerates raw code or path", () => {
  assert.equal(
    resolveLinkRef({ kind: "talent-profile", value: "anto-x" }, PATH).href,
    "/impronta/t/anto-x",
  );
  assert.equal(
    resolveLinkRef({ kind: "talent-profile", value: "/t/anto-x" }, HOST).href,
    "/t/anto-x",
  );
});

test("inquiry-start: /contact (+ prefill), prefix-aware", () => {
  assert.equal(resolveLinkRef({ kind: "inquiry-start" }, PATH).href, "/impronta/contact");
  assert.equal(
    resolveLinkRef({ kind: "inquiry-start", value: "type=event" }, HOST).href,
    "/contact?type=event",
  );
});

test("app-dashboard: app-host absolute when origin given; degrades to root path", () => {
  const withOrigin = resolveLinkRef(
    { kind: "app-dashboard", value: "/admin" },
    { pathPrefix: "/impronta", appHostOrigin: "https://app.tulala.digital" },
  );
  assert.equal(withOrigin.href, "https://app.tulala.digital/admin");
  assert.equal(withOrigin.external, true);
  assert.equal(withOrigin.openInNew, true);
  // No origin → root-absolute path, never a broken URL, never tenant-prefixed.
  assert.equal(
    resolveLinkRef({ kind: "app-dashboard", value: "/admin" }, PATH).href,
    "/admin",
  );
});

test("external-url: as-is + external + new tab + rel", () => {
  const r = resolveLinkRef({ kind: "external-url", value: "https://x.com/a" }, PATH);
  assert.equal(r.href, "https://x.com/a");
  assert.equal(r.external, true);
  assert.equal(r.openInNew, true);
  assert.equal(r.rel, "noopener noreferrer");
});

test("scheme kinds: mailto / tel / whatsapp / anchor", () => {
  assert.equal(resolveLinkRef({ kind: "mailto", value: "a@b.com" }, PATH).href, "mailto:a@b.com");
  assert.equal(resolveLinkRef({ kind: "tel", value: "+52 984 000" }, PATH).href, "tel:+52984000");
  assert.equal(
    resolveLinkRef({ kind: "whatsapp", value: "+52 984 111 2222" }, PATH).href,
    "https://wa.me/529841112222",
  );
  assert.equal(
    resolveLinkRef({ kind: "whatsapp", value: "https://wa.me/123" }, PATH).href,
    "https://wa.me/123",
  );
  assert.equal(resolveLinkRef({ kind: "anchor", value: "services" }, PATH).href, "#services");
  assert.equal(resolveLinkRef({ kind: "anchor", value: "#top" }, PATH).href, "#top");
});

test("explicit external/openInNew overrides win over kind defaults", () => {
  const r = resolveLinkRef(
    { kind: "tenant-page", value: "/x", openInNew: true },
    PATH,
  );
  assert.equal(r.openInNew, true);
  assert.equal(r.rel, "noopener noreferrer");
});

test("coerceLegacyHref: schemes / external / anchor / talent / empty", () => {
  assert.deepEqual(coerceLegacyHref("mailto:a@b.com"), { kind: "mailto", value: "a@b.com" });
  assert.deepEqual(coerceLegacyHref("tel:+1"), { kind: "tel", value: "+1" });
  assert.deepEqual(coerceLegacyHref("#sec"), { kind: "anchor", value: "#sec" });
  assert.equal(coerceLegacyHref("https://wa.me/1").kind, "whatsapp");
  assert.equal(coerceLegacyHref("https://ex.com").kind, "external-url");
  assert.deepEqual(coerceLegacyHref("/t/jane"), { kind: "talent-profile", value: "jane" });
  assert.deepEqual(coerceLegacyHref(""), { kind: "tenant-page", value: "/" });
  assert.deepEqual(coerceLegacyHref("/about"), { kind: "tenant-page", value: "/about" });
});

test("linkRefOrLegacy schema: accepts object AND string (auto-coerced)", () => {
  const fromObj = linkRefOrLegacy.parse({ kind: "tenant-page", value: "/a" });
  assert.equal(fromObj.kind, "tenant-page");
  const fromStr = linkRefOrLegacy.parse("/login");
  assert.equal(fromStr.kind, "platform-auth-login"); // legacy upgrade
  const fromExt = linkRefOrLegacy.parse("https://x.com");
  assert.equal(fromExt.kind, "external-url");
});
