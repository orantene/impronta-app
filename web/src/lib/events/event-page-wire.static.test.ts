import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isPathAllowedForHostKind } from "@/lib/saas/surface-allow-list";
import { isReservedSlug } from "@/lib/site-admin/reserved-routes";

/**
 * `events.page_id` is READ, and the event has one canonical URL per language.
 *
 * The column shipped with the events table and nothing read it (Lumina
 * tracker L12): the builder page lived at `/lumina` while `/events/<slug>`
 * drew the engine's own view. These are the wires that make the owner's ask
 * true, each pinned to the source that carries it, so a refactor that drops
 * one fails here and not on a Google result:
 *
 *   1. the event route renders the linked builder page through the SAME
 *      component the `/p/<slug>` catch-all is (locale, metadata, shell,
 *      analytics), and tells it not to redirect back to itself;
 *   2. the catch-all sends a linked page's own URL to the event URL;
 *   3. the proxy 301s the non-canonical spellings and rewrites the Spanish
 *      segment onto the route on disk, and the gate admits `/eventos`;
 *   4. the role surfaces (home, directory) opt out of the redirect;
 *   5. the admin tab exists and its copy is in every catalog, and the old
 *      "not built" sentence is gone from all of them.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

test("the event route renders the linked builder page through the catch-all component, without the self-redirect", () => {
  const src = read("src/app/(public)/events/[slug]/page.tsx");
  assert.match(src, /import CmsPublicPage, \{ generateMetadata as cmsPageMetadata \} from "@\/app\/\(public\)\/p\/\[\[\.\.\.slug\]\]\/page"/);
  assert.match(src, /resolveLinkedBuilderPage\(supabase, scope\.tenantId, \(event\.page_id as string \| null\)/, "the page is resolved from events.page_id");
  assert.match(src, /cover_media_id, page_id"\)/, "page_id is in the event select");
  assert.match(src, /<CmsPublicPage\s+params=\{Promise\.resolve\(\{ slug: linkedPage\.slug\.split\("\/"\) \}\)\}\s+redirectWhenLinkedToEvent=\{false\}/);
  // The engine view survives as the fallback, after the linked-page branch.
  assert.ok(src.indexOf("<CmsPublicPage") < src.indexOf("<EventPageView"), "the builder page branch comes before the engine view");
  // Metadata: the page's own SEO, re-rooted to the event URL with hreflang.
  assert.match(src, /await cmsPageMetadata\(\{ params: Promise\.resolve\(\{ slug: page\.slug\.split\("\/"\) \}\) \}\)/);
  assert.match(src, /alternates: undefined, \.\.\.\(await eventAlternates\(locale, slug, page\.publishedLocales\)\)/);
  assert.match(src, /pathnameForLocale: \(code\) => eventPathWithoutLocale\(code, slug\)/, "hreflang uses the per-locale segment");
});

test("the catch-all sends a page linked to a published event to the event's canonical URL", () => {
  const src = read("src/app/(public)/p/[[...slug]]/page.tsx");
  assert.match(src, /import \{ notFound, permanentRedirect \} from "next\/navigation"/);
  assert.match(src, /redirectWhenLinkedToEvent = true,/, "the opt-out defaults to redirecting");
  assert.match(src, /resolveLinkedEventSlugForPageSlug\(supabase, publicScope\.tenantId, slugPath\)/);
  assert.match(src, /const target = builderPageRedirectForLinkedEvent\(\{/);
  assert.match(src, /requestPath: requestHeaders\.get\(ORIGINAL_PATHNAME_HEADER\)/, "the self-redirect guard reads the browser path");
  assert.match(src, /const search = requestHeaders\.get\(ORIGINAL_SEARCH_HEADER\) \?\? "";/, "the original search is read once");
  assert.match(src, /if \(target && !editorRequest\) permanentRedirect\(`\$\{target\}\$\{search\}`\);/, "the /q/<code> ?l= attribution survives the hop");
  // The check runs before any render branch, so section-composed pages are covered too.
  assert.ok(src.indexOf("permanentRedirect(`${target}") < src.indexOf("Wave 4.1 — cms_pages opted into FREEFORM"));
});

test("the role surfaces never redirect away from their own URL", () => {
  for (const rel of ["src/app/page.tsx", "src/app/(public)/directory/page.tsx"]) {
    const src = read(rel);
    assert.match(src, /<CmsPublicPage[\s\S]*?redirectWhenLinkedToEvent=\{false\}/, `${rel} opts out`);
  }
});

test("the proxy carries the event URL grammar: 301 the other spellings, rewrite the Spanish segment", () => {
  const src = read("src/proxy.ts");
  assert.match(src, /import \{ eventPathRedirectResponse \} from "@\/lib\/events\/event-path-middleware"/);
  assert.match(src, /import \{ resolveEventPathRewrite \} from "@\/lib\/events\/event-page-paths"/);
  assert.match(src, /const eventPathRedirect = eventPathRedirectResponse\(\{\s*request, hostKind: effectiveHostContext\.kind, pathname: originalPathname, languageSettings: effectiveLangSettings,\s*\}\);\s*if \(eventPathRedirect\) return eventPathRedirect;/);
  assert.match(src, /const eventPathRewrite = resolveEventPathRewrite\(effectiveHostContext\.kind, pathnameForAuth\);\s*if \(eventPathRewrite\) \{\s*nextUrl\.pathname = eventPathRewrite;\s*pathnameForAuth = eventPathRewrite;\s*\}/);
  // Order: the redirect runs AFTER the operator redirect table and the legacy
  // /p/ collapse (an operator rule keeps precedence), and the rewrite runs
  // AFTER the clean-URL rewrite on the already-stripped path.
  assert.ok(src.indexOf("if (cleanUrlRedirect) return cleanUrlRedirect;") < src.indexOf("const eventPathRedirect"));
  assert.ok(src.indexOf("nextUrl.pathname = cmsSlugRewrite;") < src.indexOf("const eventPathRewrite"));
  assert.ok(src.indexOf("const eventPathRewrite") < src.indexOf("brandedAdminRewritePath(pathnameForAuth"));
  const redirectAdapter = read("src/lib/events/event-path-middleware.ts");
  assert.match(redirectAdapter, /NextResponse\.redirect\(url, 301\)/, "permanent, as the owner asked");
  assert.match(redirectAdapter, /request\.method !== "GET" && request\.method !== "HEAD"\) return null/, "safe methods only");
});

test("/eventos is gated exactly like /events: agency and hub, nowhere else", () => {
  for (const path of ["/eventos", "/eventos/fiesta-de-lanzamiento-lumina"]) {
    assert.equal(isPathAllowedForHostKind("agency", path), true, `agency ${path}`);
    assert.equal(isPathAllowedForHostKind("hub", path), true, `hub ${path}`);
    assert.equal(isPathAllowedForHostKind("app", path), false, `app ${path}`);
    assert.equal(isPathAllowedForHostKind("marketing", path), false, `marketing ${path}`);
  }
  // Segment-aware: the Spanish word must not shadow a page slugged `eventos-2027`.
  assert.equal(isPathAllowedForHostKind("agency", "/eventos-2027"), false);
  // And the word itself is reserved, so no builder page can be authored at it.
  assert.equal(isReservedSlug("eventos"), true);
  assert.equal(isReservedSlug("events"), true);
});

test("the admin tab is wired and its copy exists in every catalog; the old not-built sentence is gone", () => {
  const detail = read("src/components/admin/shell/internal/page-modules/events/EventDetail.tsx");
  assert.match(detail, /import \{ EventPageTab \} from "\.\/event-tab-page"/);
  assert.match(detail, /case "page":\s*return <EventPageTab event=\{event\} onChanged=\{onChanged\} \/>;/);
  assert.doesNotMatch(detail, /dashboard\.events\.notBuilt\.page/);

  const tab = read("src/components/admin/shell/internal/page-modules/events/event-tab-page.tsx");
  assert.ok(tab.split("\n").length <= 800, "event-tab-page.tsx stays under the 800-line cap");
  const usedKeys = [...tab.matchAll(/t\("(dashboard\.events\.page\.[a-zA-Z]+)"\)/g)].map((m) => m[1]!);
  assert.ok(usedKeys.length >= 10, "the tab reads its copy through the catalog");
  assert.match(tab, /import \{ loadEventPageLink, setEventPage, type EventPageLinkView \} from "@\/app\/\(workspace\)\/\[tenantSlug\]\/admin\/_events-page-actions"/);
  assert.match(tab, /data-testid="events-page-canonical-en"/);
  assert.match(tab, /data-testid="events-page-canonical-es"/);

  for (const code of ["en", "es", "fr"]) {
    const catalog = JSON.parse(read(`messages/${code}.json`)) as { dashboard: { events: { notBuilt: Record<string, string>; page?: Record<string, string> } } };
    const events = catalog.dashboard.events;
    assert.equal("page" in events.notBuilt, false, `${code}: notBuilt.page is gone`);
    assert.ok(events.page, `${code}: dashboard.events.page exists`);
    for (const key of usedKeys) {
      const leaf = key.slice("dashboard.events.page.".length);
      assert.equal(typeof events.page?.[leaf], "string", `${code}: ${key}`);
    }
  }
});

test("the linked-page redirect never fires for an editor request (?edit=1)", () => {
  const src = readFileSync(new URL("../../app/(public)/p/[[...slug]]/page.tsx", import.meta.url), "utf8");
  assert.match(src, /const editorRequest = \/\[\?&\]edit=1\(\?:&\|\$\)\/\.test\(search\);/, "reads ?edit=1 from the original search");
  assert.match(src, /if \(target && !editorRequest\) permanentRedirect/, "the redirect is gated on not-editor");
});
