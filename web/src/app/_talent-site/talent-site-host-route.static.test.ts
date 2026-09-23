/**
 * Static security invariants for the talent HOST route (`/_talent-site`).
 *
 * Phase 2 moves talent-authored content onto `<slug>.tulala.digital`, which is
 * a sibling of the apex that auth cookies are scoped to
 * (`lib/supabase/cookie-domain.ts` → `.tulala.digital`). Two properties keep
 * that safe, and neither is expressible in a runtime test, so they are asserted
 * against the source here:
 *
 *   1. The host route is ANONYMOUS. It resolves the talent from the proxy-set
 *      header and renders; it never reads the visitor's session. The one
 *      exception is `?preview=draft`, where `renderTalentMaxSite` loads the
 *      actor session to check ownership. If a session read ever leaked onto the
 *      public path, every talent host would become a session-dependent render
 *      on the cookie-shared apex.
 *   2. Talent-authored trees can never carry executable markup. The builder
 *      surfaces a talent can reach are pinned to
 *      `canInsertRawHtmlElements: false`, and the render-time href / form-action
 *      neutralizers stay in place. CSP allows `'unsafe-inline'` scripts, so
 *      these guards, not CSP, are what stop an injected `javascript:` sink from
 *      running on a `.tulala.digital` origin.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function src(relative: string): string {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

const HOST_ROUTE = "src/app/_talent-site/[[...pageSlug]]/page.tsx";

test("the talent host route never reads the visitor's session", () => {
  const source = src(HOST_ROUTE);
  for (const forbidden of [
    "getCachedActorSession",
    "requireTalentSelf",
    "createServerClient",
    "createServiceRoleClient",
    "getCachedServerSupabase",
    "auth.getUser",
    "getSession",
  ]) {
    assert.equal(
      source.includes(forbidden),
      false,
      `${HOST_ROUTE} must not reach for ${forbidden}: the host route renders anonymously`,
    );
  }
  // It identifies the talent from the proxy-set header, gated on the host
  // context, and from nothing else.
  assert.match(source, /resolveGatedTalentProfileId\(/);
  assert.match(source, /HOST_TALENT_PROFILE_HEADER/);
  assert.match(source, /HOST_CONTEXT_HEADER/);
});

test("renderTalentMaxSite reads the actor session ONLY under previewDraft", () => {
  const source = src("src/lib/talent-site/server/render-max-site.tsx");
  const calls = source.match(/getCachedActorSession\(\)/g) ?? [];
  assert.equal(calls.length, 1, "exactly one session read is expected");

  const guardAt = source.indexOf("if (previewDraft) {");
  const callAt = source.indexOf("getCachedActorSession()");
  const gateAt = source.indexOf("maxSitePublicGate({");
  assert.ok(guardAt > 0, "the previewDraft guard must exist");
  assert.ok(gateAt > 0, "the public gate must exist");
  assert.ok(
    guardAt < callAt && callAt < gateAt,
    "the session read must sit inside the previewDraft branch, ahead of the public gate",
  );
  // The flag itself is a strict boolean read of the caller's input, never a
  // truthy query-string value.
  assert.match(source, /const previewDraft = input\.previewDraft === true;/);
});

test("every talent-reachable builder surface pins raw HTML off", () => {
  for (const file of [
    "src/components/talent/site/TalentMaxBuilderMount.tsx",
    "src/components/talent/site/TalentSiteShellBuilderMount.tsx",
  ]) {
    const source = src(file);
    assert.match(
      source,
      /canInsertRawHtmlElements=\{false\}/,
      `${file} must pass canInsertRawHtmlElements={false}`,
    );
    assert.doesNotMatch(
      source,
      /canInsertRawHtmlElements=\{(?!false\})/,
      `${file} must not compute canInsertRawHtmlElements`,
    );
  }

  const config = src("src/lib/site-admin/builder-core/config.ts");
  const talentConfigAt = config.indexOf("export function buildTalentPageBuilderConfig");
  assert.ok(talentConfigAt > 0, "buildTalentPageBuilderConfig must exist");
  const talentConfig = config.slice(talentConfigAt, talentConfigAt + 4000);
  assert.match(
    talentConfig,
    /canInsertRawHtmlElements: false,/,
    "the talent page builder config must hard-code raw HTML off",
  );
  assert.doesNotMatch(
    talentConfig,
    /canInsertRawHtmlElements: (?!false,)/,
    "the talent page builder config must not take raw HTML from an option",
  );
});

test("the render-time href and form-action neutralizers are still in force", () => {
  const hrefs = src("src/lib/saas/public-hrefs.ts");
  assert.match(hrefs, /export function neutralizeDangerousHref\(/);
  assert.match(hrefs, /export function neutralizeFormAction\(/);
  // The guard must run BEFORE the empty-prefix fast path, or a talent HOST
  // render (which passes publicPathPrefix "") would skip it entirely.
  const guardAt = hrefs.indexOf("const guarded = neutralizeDangerousHref(href);");
  const fastPathAt = hrefs.indexOf("if (!publicPathPrefix ||");
  assert.ok(guardAt > 0 && fastPathAt > 0);
  assert.ok(
    guardAt < fastPathAt,
    "neutralizeDangerousHref must run ahead of the empty-prefix fast path",
  );

  assert.match(
    src("src/lib/site-admin/builder-node/render.tsx"),
    /isSafeRichTextHref/,
    "the builder renderer must keep the rich-text href guard",
  );
  assert.match(
    src("src/lib/site-admin/sections/contact_form/Component.tsx"),
    /neutralizeFormAction\(action\)/,
    "contact_form must keep neutralizing its action",
  );
});
