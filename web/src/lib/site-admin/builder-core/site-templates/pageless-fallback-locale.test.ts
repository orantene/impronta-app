import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import { EXAMPLE_IDENTITY, fixtureImageResolver } from "./examples";
import { DEFAULT_LOOK_BY_FAMILY } from "./look-defaults";
import { getLook } from "./looks";
import { composePagelessHome } from "./pageless-home";
import type { SiteLocale } from "./types";

// TUL-973: the page-less home's BASE text is the locale it is composed in, and
// the renderer lets the base win for the tenant's default locale. So an
// English-default workspace must be composed with an English base.

function texts(tree: BuilderNode[]): string[] {
  const out: string[] = [];
  const walk = (n: BuilderNode) => {
    const p = (n.props ?? {}) as Record<string, unknown>;
    for (const k of ["text", "label", "title", "emptyMessage"]) if (typeof p[k] === "string") out.push(p[k] as string);
    for (const c of (n as { children?: BuilderNode[] }).children ?? []) walk(c);
  };
  for (const n of tree) walk(n);
  return out;
}

function baseTextFor(locale: SiteLocale): string[] {
  const look = getLook(DEFAULT_LOOK_BY_FAMILY.dining);
  const ctx = { locale, family: "dining" as const, typeId: "restaurant", identity: EXAMPLE_IDENTITY, images: fixtureImageResolver, rosterActive: false };
  const { tree } = composePagelessHome({ look: look!, locale, identity: ctx.identity, images: fixtureImageResolver, typeId: "restaurant", ctx });
  return texts(tree ?? []);
}

test("composed in en, the page-less restaurant base text has no Spanish section copy", () => {
  const all = baseTextFor("en");
  assert.ok(all.length > 0, "tree has text");
  for (const es of ["Escríbenos", "Lo que ofrecemos", "El horario aún no está publicado", "Galería"]) {
    assert.ok(!all.some((t) => t.includes(es)), `no "${es}" in the English base`);
  }
});

test("the page-less fallback derives its locale from the tenant default, not a hardcoded es", () => {
  const src = readFileSync(new URL("./pageless-fallback.server.ts", import.meta.url), "utf8");
  assert.match(src, /siteWriteLocale\(/);
  assert.match(src, /default_locale/);
  assert.doesNotMatch(src, /input\.locale \?\? "es"/);
});
