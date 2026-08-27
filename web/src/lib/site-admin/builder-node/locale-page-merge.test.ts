import assert from "node:assert/strict";
import test from "node:test";

import type { BuilderNode } from "./types";
import {
  mergeLocalePageIntoOverlays,
  stripLocaleIdPrefix,
} from "./locale-page-merge";

/** Minimal heading node — the merge only reads id/kind/props/children. */
function heading(id: string, text: string, extra?: Record<string, unknown>): BuilderNode {
  return {
    id,
    kind: "heading",
    props: { text, level: 2, ...(extra ?? {}) },
  } as unknown as BuilderNode;
}

function section(id: string, children: BuilderNode[]): BuilderNode {
  return { id, kind: "section", props: {}, children } as unknown as BuilderNode;
}

function overlayOf(node: BuilderNode | undefined): Record<string, Record<string, string>> {
  return (node as { i18n?: Record<string, Record<string, string>> } | undefined)?.i18n ?? {};
}

function childrenOf(node: BuilderNode | undefined): BuilderNode[] {
  return (node as unknown as { children?: BuilderNode[] } | undefined)?.children ?? [];
}

test("stripLocaleIdPrefix strips a matching locale prefix", () => {
  assert.equal(stripLocaleIdPrefix("es-rb-home-hero", "es"), "rb-home-hero");
});

test("stripLocaleIdPrefix returns null when absent, so an unprefixed id is never a prefix match", () => {
  assert.equal(stripLocaleIdPrefix("rb-home-hero", "es"), null);
  assert.equal(stripLocaleIdPrefix("estimate-block", "es"), null);
});

test("carries translated text onto the primary node by exact id", () => {
  const result = mergeLocalePageIntoOverlays({
    primaryTree: [heading("h1", "Our talent")],
    secondaryTree: [heading("h1", "Nuestro talento")],
    locale: "es",
  });

  assert.deepEqual(overlayOf(result.tree[0]), { es: { text: "Nuestro talento" } });
  assert.equal(result.merged.length, 1);
  assert.equal(result.merged[0]!.matchedBy, "id");
});

test("matches ids cloned with a locale prefix (how the ES rows were seeded)", () => {
  const result = mergeLocalePageIntoOverlays({
    primaryTree: [heading("rb-home-hero", "Book the talent")],
    secondaryTree: [heading("es-rb-home-hero", "Contrata el talento")],
    locale: "es",
  });

  assert.deepEqual(overlayOf(result.tree[0]), { es: { text: "Contrata el talento" } });
  assert.equal(result.merged[0]!.matchedBy, "id-prefix");
});

test("falls back to tree position + kind when ids do not correspond", () => {
  const result = mergeLocalePageIntoOverlays({
    primaryTree: [section("s1", [heading("a", "Contact")])],
    secondaryTree: [section("s9", [heading("zzz", "Contacto")])],
    locale: "es",
  });

  assert.deepEqual(overlayOf(childrenOf(result.tree[0])[0]), { es: { text: "Contacto" } });
  assert.equal(result.merged[0]!.matchedBy, "position");
});

test("records unmatched secondary text instead of guessing a target", () => {
  const result = mergeLocalePageIntoOverlays({
    primaryTree: [heading("a", "Contact")],
    secondaryTree: [heading("a", "Contacto"), heading("orphan", "Sin pareja")],
    locale: "es",
  });

  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0]!.secondaryNodeId, "orphan");
  assert.equal(result.skipped[0]!.reason, "unmatched");
  // The orphan text landed nowhere — no other node absorbed it.
  assert.deepEqual(overlayOf(result.tree[0]), { es: { text: "Contacto" } });
});

test("skips a value identical to the primary text rather than storing dead weight", () => {
  const result = mergeLocalePageIntoOverlays({
    primaryTree: [heading("a", "Impronta")],
    secondaryTree: [heading("a", "Impronta")],
    locale: "es",
  });

  assert.equal(result.merged.length, 0);
  assert.equal(result.skipped[0]!.reason, "identical");
  assert.deepEqual(overlayOf(result.tree[0]), {});
});

test("preserves hand-authored overlay text over the bulk migration", () => {
  const result = mergeLocalePageIntoOverlays({
    primaryTree: [heading("a", "Contact", { i18n: { es: { text: "Escríbenos" } } })],
    secondaryTree: [heading("a", "Contacto")],
    locale: "es",
  });

  assert.deepEqual(overlayOf(result.tree[0]), { es: { text: "Escríbenos" } });
});

test("leaves overlays for other locales untouched", () => {
  const result = mergeLocalePageIntoOverlays({
    primaryTree: [heading("a", "Contact", { i18n: { fr: { text: "Contactez" } } })],
    secondaryTree: [heading("a", "Contacto")],
    locale: "es",
  });

  assert.deepEqual(overlayOf(result.tree[0]), {
    fr: { text: "Contactez" },
    es: { text: "Contacto" },
  });
});

test("writes the overlay to props.i18n AND the node mirror, so it survives validation", () => {
  const result = mergeLocalePageIntoOverlays({
    primaryTree: [heading("a", "Contact")],
    secondaryTree: [heading("a", "Contacto")],
    locale: "es",
  });

  const node = result.tree[0] as unknown as { props: { i18n?: unknown }; i18n?: unknown };
  assert.deepEqual(node.props.i18n, { es: { text: "Contacto" } });
  assert.deepEqual(node.i18n, { es: { text: "Contacto" } });
});

test("never mutates the primary design — order, kinds and non-text props are unchanged", () => {
  const primaryTree = [
    section("s1", [heading("a", "One"), heading("b", "Two")]),
    section("s2", [heading("c", "Three")]),
  ];
  const before = JSON.stringify(primaryTree);

  const result = mergeLocalePageIntoOverlays({
    primaryTree,
    // Deliberately REORDERED sections on the Spanish side: the design must come
    // from the primary tree alone.
    secondaryTree: [
      section("s2", [heading("c", "Tres")]),
      section("s1", [heading("a", "Uno"), heading("b", "Dos")]),
    ],
    locale: "es",
  });

  assert.equal(JSON.stringify(primaryTree), before);
  assert.deepEqual(result.tree.map((n) => n.id), ["s1", "s2"]);
  assert.deepEqual(childrenOf(result.tree[0]).map((n) => n.id), ["a", "b"]);
  assert.deepEqual(overlayOf(childrenOf(result.tree[0])[0]), { es: { text: "Uno" } });
});

test("returns untouched subtrees by identity so unchanged branches reconcile as unchanged", () => {
  const untouched = section("s2", [heading("c", "Three")]);
  const result = mergeLocalePageIntoOverlays({
    primaryTree: [section("s1", [heading("a", "One")]), untouched],
    secondaryTree: [section("s1", [heading("a", "Uno")])],
    locale: "es",
  });

  assert.equal(result.tree[1], untouched);
});

test("carries every text prop, not just `text`", () => {
  const primary = {
    id: "img",
    kind: "image",
    props: { alt: "A model on set", src: "/a.jpg" },
  } as unknown as BuilderNode;
  const secondary = {
    id: "img",
    kind: "image",
    props: { alt: "Una modelo en el set", src: "/a.jpg" },
  } as unknown as BuilderNode;

  const result = mergeLocalePageIntoOverlays({
    primaryTree: [primary],
    secondaryTree: [secondary],
    locale: "es",
  });

  assert.deepEqual(overlayOf(result.tree[0]), { es: { alt: "Una modelo en el set" } });
});

test("applies a duplicated node id only once", () => {
  const result = mergeLocalePageIntoOverlays({
    primaryTree: [heading("dup", "One"), heading("dup", "One")],
    secondaryTree: [heading("dup", "Uno")],
    locale: "es",
  });

  assert.deepEqual(overlayOf(result.tree[0]), { es: { text: "Uno" } });
  assert.deepEqual(overlayOf(result.tree[1]), {});
});

test("folds NESTED form-field text into dotted overlay keys (the Spanish contact form)", () => {
  const primaryTree = [
    {
      id: "rb-contact-form",
      kind: "form",
      props: {
        fields: [
          { name: "name", label: "Name", placeholder: "Your name" },
          { name: "brief", label: "What are you booking?" },
        ],
      },
    },
  ] as unknown as BuilderNode[];
  const secondaryTree = [
    {
      id: "es-rb-contact-form",
      kind: "form",
      props: {
        fields: [
          { name: "name", label: "Nombre", placeholder: "Tu nombre" },
          { name: "brief", label: "\u00bfQu\u00e9 quieres reservar?" },
        ],
      },
    },
  ] as unknown as BuilderNode[];

  const result = mergeLocalePageIntoOverlays({
    primaryTree,
    secondaryTree,
    locale: "es",
  });

  const overlay = (result.tree[0] as { i18n?: Record<string, Record<string, string>> })
    .i18n?.es;
  assert.equal(overlay?.["fields.0.label"], "Nombre");
  assert.equal(overlay?.["fields.0.placeholder"], "Tu nombre");
  assert.equal(overlay?.["fields.1.label"], "\u00bfQu\u00e9 quieres reservar?");
  assert.equal(
    result.skipped.filter((s) => s.reason === "unmatched").length,
    0,
    "every nested string found its counterpart",
  );
});

test("folds a nested OBJECT prop (requestCta.label)", () => {
  const result = mergeLocalePageIntoOverlays({
    primaryTree: [
      {
        id: "n1",
        kind: "section",
        props: { requestCta: { href: "/contact", label: "Request" } },
      },
    ] as unknown as BuilderNode[],
    secondaryTree: [
      {
        id: "es-n1",
        kind: "section",
        props: { requestCta: { href: "/es/contact", label: "Solicitar" } },
      },
    ] as unknown as BuilderNode[],
    locale: "es",
  });
  const overlay = (result.tree[0] as { i18n?: Record<string, Record<string, string>> })
    .i18n?.es;
  assert.equal(overlay?.["requestCta.label"], "Solicitar");
  assert.ok(
    !Object.keys(overlay ?? {}).some((k) => k.includes("href")),
    "hrefs are never folded as translations",
  );
});
