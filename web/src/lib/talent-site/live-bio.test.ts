/**
 * TUL-230: the About paragraph is live and per language, with a language hint
 * when it falls back. Resolver, hint, the render transform, the seeds.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { renderBuilderNodes } from "@/lib/site-admin/builder-node/render";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import { resolveLiveBio, withBioHints } from "./live-bio";
import { applyTalentLiveText, treeHasLiveCandidates } from "./live-text";
import { buildTalentLiveText, type LiveTextSource } from "./live-text-values";
import { COLLECTION_DESIGNS } from "./theme-catalog/collection/designs";
import { buildMaisonDesignPayload } from "./theme-catalog/maison/design-payload";
import type { DesignPayload } from "./theme-catalog/types";

const BOTH = { en: "I paint nails in Merida.", es: "Pinto uñas en Mérida." };

test("resolver: the visitor's own language wins, no hint", () => {
  assert.deepEqual(resolveLiveBio({ bioI18n: BOTH, locale: "en", chain: ["en", "es"], primary: "es" }), { text: BOTH.en, hint: "" });
  assert.deepEqual(resolveLiveBio({ bioI18n: BOTH, locale: "es", chain: ["es"], primary: "es" }), { text: BOTH.es, hint: "" });
  assert.equal(resolveLiveBio({ bioI18n: BOTH, locale: "es-MX", primary: "es" }).text, BOTH.es, "a regional locale reads its language");
});

test("resolver: only the primary language exists, so the visitor gets it with a hint", () => {
  const r = resolveLiveBio({ bioI18n: { es: BOTH.es }, locale: "en", chain: ["en", "es"], primary: "es" });
  assert.deepEqual(r, { text: BOTH.es, hint: "Disponible en español" });
  // The primary is found even when her chain does not list it.
  assert.equal(resolveLiveBio({ bioI18n: { es: BOTH.es }, locale: "en", chain: [], primary: "es" }).text, BOTH.es);
  const r2 = resolveLiveBio({ bioI18n: { en: BOTH.en }, locale: "es", chain: ["es", "en"], primary: "en" });
  assert.deepEqual(r2, { text: BOTH.en, hint: "Disponible en inglés" });
});

test("resolver: only the base short bio, then nothing", () => {
  // TUL-187: short_bio is her primary language; an EN visitor gets the hint, not silent Spanish.
  assert.deepEqual(resolveLiveBio({ bioI18n: {}, shortBio: "  Hola  ", locale: "en", primary: "es" }), {
    text: "Hola",
    hint: "Disponible en español",
  });
  assert.deepEqual(resolveLiveBio({ bioI18n: {}, shortBio: "  Hola  ", locale: "es", primary: "es" }), {
    text: "Hola",
    hint: "",
  });
  assert.deepEqual(resolveLiveBio({ bioI18n: null, shortBio: null, locale: "es", primary: "es" }), { text: "", hint: "" });
  assert.deepEqual(resolveLiveBio({ bioI18n: { es: "   " }, locale: "es" }), { text: "", hint: "" });
});

const SRC: LiveTextSource = {
  displayName: "Alba",
  trade: { en: "Nail Artist", es: "Manicurista" },
  city: { en: "Merida", es: "Mérida" },
  primaryLocale: "es",
  proof: { years: null, languages: [], rating: null, count: 0, demo: false },
};

const para = (id: string, text: string, extra: Record<string, unknown> = {}): BuilderNode =>
  ({ id, kind: "paragraph", props: { text, ...extra } }) as unknown as BuilderNode;
const box = (id: string, children: BuilderNode[]): BuilderNode =>
  ({ id, kind: "container", props: { layout: "stack" }, children }) as unknown as BuilderNode;
const about = () => [box("about", [para("greet", "Hello"), para("bio", "{{richBio}}", { liveText: "bio", style: { align: "center" } }), para("loc", "Based in Merida")])];
const texts = (tree: BuilderNode[]): string[] =>
  tree.flatMap((n) => {
    const kids = (n as { children?: BuilderNode[] }).children;
    return kids ? texts(kids) : [String((n.props as { text?: string }).text)];
  });

test("render: an EN visitor reads the EN bio, an ES visitor the ES bio, no hint", () => {
  const src = { ...SRC, bioI18n: BOTH };
  const en = applyTalentLiveText(about(), buildTalentLiveText(src, "en", ["en", "es"]));
  assert.deepEqual(texts(en), ["Hello", BOTH.en, "Based in Merida"]);
  const es = applyTalentLiveText(about(), buildTalentLiveText(src, "es", ["es"]));
  assert.deepEqual(texts(es), ["Hello", BOTH.es, "Based in Merida"]);
});

test("render: a fallback shows the other language and the hint right under it, aligned like the bio", () => {
  const live = buildTalentLiveText({ ...SRC, bioI18n: { es: BOTH.es } }, "en", ["en", "es"]);
  const out = applyTalentLiveText(about(), live);
  assert.deepEqual(texts(out), ["Hello", BOTH.es, "Disponible en español", "Based in Merida"]);
  const hint = (out[0] as { children: BuilderNode[] }).children[2]!;
  assert.equal((hint.props as { style: { align?: string; tone?: string } }).style.align, "center");
  assert.equal((hint.props as { style: { tone?: string } }).style.tone, "muted");
  // Idempotent: applying again does not stack a second hint.
  assert.deepEqual(texts(applyTalentLiveText(out, live)), texts(out));
});

test("TUL-187: a baked About paragraph without liveText still binds and shows the language hint", () => {
  // Maison numbered releases strip liveText: "bio"; the stored text is still her Spanish bio.
  const baked = [box("about", [para("greet", "Hello"), para("bio", BOTH.es), para("loc", "Based in Merida")])];
  const live = buildTalentLiveText({ ...SRC, bioI18n: { es: BOTH.es, en: BOTH.en } }, "en", ["en", "es"]);
  assert.ok(live.seeds?.bio?.includes(BOTH.es), "her Spanish bio is a seed");
  const out = applyTalentLiveText(baked, live);
  assert.deepEqual(texts(out), ["Hello", BOTH.en, "Based in Merida"], "EN visitor reads the EN bio");
  const stamped = (out[0] as { children: BuilderNode[] }).children[1]!;
  assert.equal((stamped.props as { liveText?: string }).liveText, "bio", "legacy bind stamps liveText for the hint path");

  const onlyEs = buildTalentLiveText({ ...SRC, bioI18n: { es: BOTH.es } }, "en", ["en", "es"]);
  const fallback = applyTalentLiveText(baked, onlyEs);
  assert.deepEqual(texts(fallback), ["Hello", BOTH.es, "Disponible en español", "Based in Merida"]);
});

test("render: no bio hides the paragraph and its hint; a failed load keeps the baked text", () => {
  const none = applyTalentLiveText(about(), buildTalentLiveText({ ...SRC, bioI18n: {} }, "en", ["en"]));
  assert.deepEqual(texts(none), ["Hello", "Based in Merida"]);
  // The zero-width placeholder a no-bio apply leaves behind also drops out.
  const placeholder = [box("a", [para("bio", "​", { liveText: "bio" })])];
  assert.equal(applyTalentLiveText(placeholder, buildTalentLiveText({ ...SRC }, "en")).length, 0, "the empty wrapper goes too");
  // Loader failure ({ values: {} }): the baked text stays, nothing disappears.
  const tree = about();
  assert.equal(applyTalentLiveText(tree, { values: {} }), tree);
});

test("hints: identity when there is no bio node or no hint", () => {
  const plain = [para("a", "x"), para("b", "y")];
  assert.equal(withBioHints(plain, "Disponible en español"), plain);
  const withBio = [para("a", "x", { liveText: "bio" })];
  assert.equal(withBioHints(withBio, ""), withBio);
  assert.equal(withBioHints(withBio, undefined), withBio);
});

test("a tree without the bio key comes back byte-identical", () => {
  const tree = [box("c", [para("h", "Hello"), para("t", "Tag", { liveText: "hero_tagline" })])];
  const live = buildTalentLiveText({ ...SRC, bioI18n: { es: BOTH.es } }, "en", ["en", "es"]);
  const before = JSON.stringify(tree);
  const out = applyTalentLiveText(tree, live);
  assert.equal(JSON.stringify(out), before);
  assert.equal(out, tree, "and the very same array when nothing changed");
});

// ── Seeds ────────────────────────────────────────────────────────────────────

type Walk = (n: Record<string, unknown>) => void;
function walk(nodes: unknown, visit: Walk): void {
  if (!Array.isArray(nodes)) return;
  for (const raw of nodes) {
    if (!raw || typeof raw !== "object") continue;
    const n = raw as Record<string, unknown>;
    visit(n);
    walk(n.children, visit);
  }
}

test("every released design binds its About paragraph to the live bio; no paragraph still bakes {{richBio}} unbound", () => {
  const designs: ReadonlyArray<readonly [string, DesignPayload]> = [
    ["maison", buildMaisonDesignPayload()],
    ...COLLECTION_DESIGNS.map((d) => [d.slug, d.buildPayload()] as const),
  ];
  const unbound: string[] = [];
  const bound: string[] = [];
  for (const [slug, payload] of designs) {
    const bag = payload as unknown as Record<string, unknown>;
    let hit = false;
    for (const tree of ["homeTree", "shellTree", "optionalBlocks"]) {
      walk(bag[tree], (n) => {
        const p = (n.props ?? {}) as Record<string, unknown>;
        if (n.kind !== "paragraph" || p.text !== "{{richBio}}") return;
        if (p.liveText === "bio") hit = true;
        else unbound.push(slug);
      });
    }
    if (hit) bound.push(slug);
  }
  assert.deepEqual(unbound, [], "an unbound {{richBio}} paragraph would stay English for a Spanish visitor");
  assert.ok(bound.length >= 7, `bound designs: ${bound.join(", ")}`);
});

// ── Folio masthead blurb (block prop, not a paragraph) ──────────────────────

const masthead = (extra: Record<string, unknown> = {}): BuilderNode =>
  ({
    id: "m",
    kind: "masthead",
    props: { lines: ["Alba"], edition: "magazine", bio: "baked blurb", ctaLabel: "Consultar", ctaHref: "#ask", liveText: "bio", ...extra },
  }) as unknown as BuilderNode;
const html = (nodes: BuilderNode[]): string =>
  renderToStaticMarkup(
    renderBuilderNodes(nodes, { mode: "freeform", includeRendererStyles: false, includeFontLinks: false, dataSources: {} }),
  );

test("masthead: an EN visitor reads the EN blurb, an ES visitor the ES blurb, no hint", () => {
  const src = { ...SRC, bioI18n: BOTH };
  const en = html(applyTalentLiveText([masthead()], buildTalentLiveText(src, "en", ["en", "es"])));
  assert.match(en, /<p>I paint nails in Merida\.<\/p>/);
  assert.doesNotMatch(en, /baked blurb|data-bio-hint|Disponible en/);
  const es = html(applyTalentLiveText([masthead()], buildTalentLiveText(src, "es", ["es"])));
  assert.match(es, /<p>Pinto uñas en Mérida\.<\/p>/);
  assert.doesNotMatch(es, /data-bio-hint/);
});

test("masthead: the hint shows on a fallback only, right after the blurb", () => {
  const live = buildTalentLiveText({ ...SRC, bioI18n: { es: BOTH.es } }, "en", ["en", "es"]);
  const out = applyTalentLiveText([masthead()], live);
  assert.match(html(out), /<p>Pinto uñas en Mérida\.<\/p><p data-bio-hint="1"[^>]*>Disponible en español<\/p>/);
  assert.equal(applyTalentLiveText(out, live), out, "idempotent");
  // Back to the visitor's own language: a stale hint is dropped.
  const own = applyTalentLiveText(out, buildTalentLiveText({ ...SRC, bioI18n: BOTH }, "en", ["en", "es"]));
  assert.doesNotMatch(html(own), /data-bio-hint/);
});

test("masthead: no bio hides the blurb (no empty element), keeps the buttons; a failed load keeps the baked blurb", () => {
  const none = html(applyTalentLiveText([masthead()], buildTalentLiveText({ ...SRC, bioI18n: {} }, "en", ["en"])));
  assert.doesNotMatch(none, /baked blurb|<p><\/p>|data-bio-hint/);
  assert.match(none, /Consultar/);
  const tree = [masthead()];
  assert.equal(applyTalentLiveText(tree, { values: {} }), tree);
  assert.match(html(tree), /baked blurb/);
});

test("masthead: without liveText, an unmatched baked blurb stays put; a bio seed binds", () => {
  const tree = [masthead({ liveText: undefined })];
  const live = buildTalentLiveText({ ...SRC, bioI18n: BOTH }, "en", ["en", "es"]);
  const before = JSON.stringify(tree);
  const out = applyTalentLiveText(tree, live);
  assert.equal(out, tree);
  assert.equal(JSON.stringify(out), before);
  // TUL-187: any masthead with a blurb is a live candidate (the seed match decides at apply).
  assert.equal(treeHasLiveCandidates(tree), true);
  assert.equal(treeHasLiveCandidates([masthead()]), true);
  // Baked blurb that IS her Spanish bio: EN visitor gets the EN bio + no hint.
  const seeded = [masthead({ liveText: undefined, bio: BOTH.es })];
  const bound = applyTalentLiveText(seeded, live);
  assert.match(html(bound), /<p>I paint nails in Merida\.<\/p>/);
  assert.doesNotMatch(html(bound), /data-bio-hint|Pinto uñas/);
});

test("the Folio seed binds its masthead blurb to the live bio", () => {
  const folio = COLLECTION_DESIGNS.find((d) => d.slug === "folio");
  assert.ok(folio, "folio is a collection design");
  const bound: unknown[] = [];
  walk(folio.buildPayload().homeTree, (n) => {
    if (n.kind === "masthead") bound.push((n.props as Record<string, unknown>).liveText);
  });
  assert.deepEqual(bound, ["bio"]);
});
