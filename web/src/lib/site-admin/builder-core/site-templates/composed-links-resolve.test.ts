/**
 * TUL-506: every internal link a composed site renders (home, role pages,
 * header and footer) must point at a page the composer actually writes, or at
 * a platform route. A link to `/services` on a site whose catalogue page is
 * `servicios` is a 404 for every visitor.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { LOOKS, buildComponentsForType, exampleContext, fixtureImageResolver, instantiateSite } from "./index";

/** The slugs the composer writes (pageHrefsFor), as site-root links. */
const WRITTEN = { home: "/", catalogue: "/servicios", transaction: "/agendar", about: "/nosotros", contact: "/contacto", gallery: "/galeria" } as const;
/** Platform routes a composed site may link to. */
const PLATFORM = new Set(["/book", "/login", "/politicas", "/privacidad", "/legal/privacy", "/legal/terms", "/legal/cookies"]);

function internalLinks(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) for (const n of node) internalLinks(n, out);
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (typeof v === "string" && /href/i.test(k) && v.startsWith("/") && !v.startsWith("//")) out.push(v);
      else internalLinks(v, out);
    }
  }
  return out;
}

test("every internal link in a composed site resolves to a written page or a platform route", () => {
  const written = new Set<string>(Object.values(WRITTEN));
  for (const look of LOOKS) {
    for (const locale of ["es", "en"] as const) {
      const ctx = exampleContext("beauty", "lash-studio", locale);
      const identity = { ...ctx.identity, pageHrefs: { ...WRITTEN } };
      const site = instantiateSite({ look, locale, identity, images: fixtureImageResolver, components: buildComponentsForType("lash-studio", { ...ctx, identity }) });
      const links = internalLinks([site.pages, site.shell]);
      assert.ok(links.length > 0, `${look.id}/${locale}: no links found, test is blind`);
      for (const href of links) {
        const path = href.split(/[?#]/)[0] || "/";
        assert.ok(written.has(path) || PLATFORM.has(path), `${look.id}/${locale}: link ${href} resolves to no written page`);
      }
    }
  }
});
