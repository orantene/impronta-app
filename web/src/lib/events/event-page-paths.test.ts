import { test } from "node:test";
import assert from "node:assert/strict";

import {
  builderPageRedirectForLinkedEvent,
  canonicalEventPath,
  eventPathSegmentForLocale,
  eventPathWithoutLocale,
  resolveEventPathRewrite,
  resolveEventPathRouting,
} from "./event-page-paths";

/** Impronta's grammar: English unprefixed, Spanish under `/es`. */
const EN_DEFAULT = { defaultLocale: "en", publicLocales: ["en", "es"] };
/** A Spanish-first venue: Spanish unprefixed, English under `/en`. */
const ES_DEFAULT = { defaultLocale: "es", publicLocales: ["es", "en"] };
/** A solo-language tenant that never serves Spanish. */
const EN_ONLY = { defaultLocale: "en", publicLocales: ["en"] };

const SLUG = "fiesta-de-lanzamiento-lumina";

test("the segment is the locale's own word", () => {
  assert.equal(eventPathSegmentForLocale("en"), "events");
  assert.equal(eventPathSegmentForLocale("es"), "eventos");
  assert.equal(eventPathSegmentForLocale("es-MX"), "eventos");
  assert.equal(eventPathSegmentForLocale("fr"), "events");
  assert.equal(eventPathWithoutLocale("es", SLUG), `/eventos/${SLUG}`);
  assert.equal(eventPathWithoutLocale("en"), "/events");
});

test("canonicalEventPath applies the tenant's own URL grammar", () => {
  assert.equal(canonicalEventPath({ slug: SLUG, locale: "en", settings: EN_DEFAULT }), `/events/${SLUG}`);
  assert.equal(canonicalEventPath({ slug: SLUG, locale: "es", settings: EN_DEFAULT }), `/es/eventos/${SLUG}`);
  assert.equal(canonicalEventPath({ slug: SLUG, locale: "es", settings: ES_DEFAULT }), `/eventos/${SLUG}`);
  assert.equal(canonicalEventPath({ slug: SLUG, locale: "en", settings: ES_DEFAULT }), `/en/events/${SLUG}`);
  assert.equal(
    canonicalEventPath({ slug: SLUG, locale: "es", settings: EN_DEFAULT, pathPrefix: "/w/impronta" }),
    `/es/w/impronta/eventos/${SLUG}`,
  );
});

// ── The proxy decision ───────────────────────────────────────────────────────

const route = (pathname: string, settings = EN_DEFAULT, hostKind = "agency") =>
  resolveEventPathRouting({ hostKind, pathname, settings });

test("the owner's three URLs on an English-default tenant", () => {
  // The canonical English URL is left alone.
  assert.equal(route(`/events/${SLUG}`), null);
  // The canonical Spanish URL is served by the /events route on disk.
  assert.deepEqual(route(`/es/eventos/${SLUG}`), { kind: "rewrite", to: `/events/${SLUG}` });
  // The Spanish word without the prefix 301s onto the Spanish canonical.
  assert.deepEqual(route(`/eventos/${SLUG}`), { kind: "redirect", to: `/es/eventos/${SLUG}` });
  // The English word under the Spanish prefix 301s onto the Spanish canonical.
  assert.deepEqual(route(`/es/events/${SLUG}`), { kind: "redirect", to: `/es/eventos/${SLUG}` });
});

test("a Spanish-default tenant serves Spanish unprefixed and English under /en", () => {
  assert.deepEqual(route(`/eventos/${SLUG}`, ES_DEFAULT), { kind: "rewrite", to: `/events/${SLUG}` });
  assert.deepEqual(route(`/events/${SLUG}`, ES_DEFAULT), { kind: "redirect", to: `/eventos/${SLUG}` });
  assert.equal(route(`/en/events/${SLUG}`, ES_DEFAULT), null);
  assert.deepEqual(route(`/en/eventos/${SLUG}`, ES_DEFAULT), { kind: "redirect", to: `/eventos/${SLUG}` });
});

test("a tenant that never serves Spanish has no Spanish alias: the word is a typo", () => {
  assert.deepEqual(route(`/eventos/${SLUG}`, EN_ONLY), { kind: "redirect", to: `/events/${SLUG}` });
  assert.equal(route(`/events/${SLUG}`, EN_ONLY), null);
});

test("the list follows the same grammar", () => {
  assert.deepEqual(route("/eventos"), { kind: "redirect", to: "/es/eventos" });
  assert.deepEqual(route("/es/eventos"), { kind: "rewrite", to: "/events" });
  assert.deepEqual(route("/es/events"), { kind: "redirect", to: "/es/eventos" });
  assert.equal(route("/events"), null);
});

test("a path-based tenant keeps its /w/<slug> prefix through the hop", () => {
  assert.deepEqual(route(`/w/impronta/eventos/${SLUG}`, EN_DEFAULT, "hub"), {
    kind: "redirect",
    to: `/es/w/impronta/eventos/${SLUG}`,
  });
  assert.deepEqual(route(`/es/w/impronta/events/${SLUG}`, EN_DEFAULT, "hub"), {
    kind: "redirect",
    to: `/es/w/impronta/eventos/${SLUG}`,
  });
  // Already canonical: the proxy strips the prefixes itself before the rewrite site.
  assert.equal(route(`/es/w/impronta/eventos/${SLUG}`, EN_DEFAULT, "hub")?.kind, "rewrite");
});

test("only tenant surfaces have events; deeper paths and odd slugs are not touched", () => {
  assert.equal(route(`/eventos/${SLUG}`, EN_DEFAULT, "marketing"), null);
  assert.equal(route(`/eventos/${SLUG}`, EN_DEFAULT, "app"), null);
  assert.equal(route(`/eventos/${SLUG}/tickets`), null);
  assert.equal(route("/eventos/__bad__"), null);
  assert.equal(route("/eventos/Upper"), null);
  assert.equal(route("/eventsfake/x"), null);
  assert.equal(route("/"), null);
});

test("resolveEventPathRewrite maps the stripped Spanish path onto the route on disk", () => {
  assert.equal(resolveEventPathRewrite("agency", `/eventos/${SLUG}`), `/events/${SLUG}`);
  assert.equal(resolveEventPathRewrite("hub", "/eventos"), "/events");
  assert.equal(resolveEventPathRewrite("agency", `/events/${SLUG}`), null);
  assert.equal(resolveEventPathRewrite("marketing", `/eventos/${SLUG}`), null);
  assert.equal(resolveEventPathRewrite("agency", `/eventos/${SLUG}/more`), null);
});

// ── The builder page's own URL ───────────────────────────────────────────────

test("a builder page linked to an event sends the visitor to the event's canonical URL in their language", () => {
  assert.equal(
    builderPageRedirectForLinkedEvent({ linkedEventSlug: SLUG, locale: "en", settings: EN_DEFAULT, requestPath: "/lumina" }),
    `/events/${SLUG}`,
  );
  assert.equal(
    builderPageRedirectForLinkedEvent({ linkedEventSlug: SLUG, locale: "es", settings: EN_DEFAULT, requestPath: "/es/lumina" }),
    `/es/eventos/${SLUG}`,
  );
  assert.equal(
    builderPageRedirectForLinkedEvent({ linkedEventSlug: SLUG, locale: "en", settings: EN_DEFAULT, requestPath: "/p/lumina" }),
    `/events/${SLUG}`,
  );
  assert.equal(
    builderPageRedirectForLinkedEvent({
      linkedEventSlug: SLUG, locale: "es", settings: EN_DEFAULT, pathPrefix: "/w/impronta", requestPath: "/es/w/impronta/lumina",
    }),
    `/es/w/impronta/eventos/${SLUG}`,
  );
});

test("no link, no redirect; and never a redirect to the URL being served", () => {
  assert.equal(builderPageRedirectForLinkedEvent({ linkedEventSlug: null, locale: "en", settings: EN_DEFAULT }), null);
  assert.equal(builderPageRedirectForLinkedEvent({ linkedEventSlug: "  ", locale: "en", settings: EN_DEFAULT }), null);
  assert.equal(builderPageRedirectForLinkedEvent({ linkedEventSlug: "Bad Slug", locale: "en", settings: EN_DEFAULT }), null);
  assert.equal(
    builderPageRedirectForLinkedEvent({ linkedEventSlug: SLUG, locale: "en", settings: EN_DEFAULT, requestPath: `/events/${SLUG}` }),
    null,
  );
});
