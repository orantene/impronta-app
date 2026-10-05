import assert from "node:assert/strict";
import test from "node:test";

import { buildOverlayTranslationReport } from "../src/lib/site-admin/builder-node/translation-status";
import { validateBuilderNodeTree } from "../src/lib/site-admin/builder-node/validate";
import type { BuilderNode } from "../src/lib/site-admin/builder-node/types";

import { parseArgs, splitPageI18n, type TranslationMap } from "./page-i18n-split";

/**
 * The shape the real page has: Spanish in every BASE prop, no overlay at all,
 * a marquee (nested `items.N.text`), an accordion FAQ (`title` on each item
 * plus paragraph children), a button with a non-string / empty prop mix, and
 * numerals that are the same in every language.
 */
function fixture(): BuilderNode[] {
  return [
    {
      id: "root",
      kind: "container",
      props: { layout: "stack" },
      children: [
        {
          id: "h1",
          kind: "heading",
          props: { text: "Fiesta de lanzamiento", level: 1 },
        },
        {
          id: "p1",
          kind: "paragraph",
          props: { text: "Una noche de luz y sonido." },
        },
        {
          id: "stat",
          kind: "heading",
          props: { text: "01", level: 3 },
        },
        {
          id: "cta",
          kind: "button",
          props: { label: "Reservar", href: "/reservar", tone: "primary" },
        },
        {
          id: "brand",
          kind: "paragraph",
          props: { text: "LUMINA" },
        },
        {
          id: "empty",
          kind: "paragraph",
          props: { text: "   " },
        },
        {
          id: "mq",
          kind: "marquee",
          props: {
            items: [
              { text: "Moda", href: "/moda" },
              { text: "Música" },
              { text: "2026" },
            ],
            speed: "medium",
          },
        },
        {
          id: "faq",
          kind: "accordion",
          props: {},
          children: [
            {
              id: "faq-1",
              kind: "accordion_item",
              props: { title: "¿Dónde es?" },
              children: [
                {
                  id: "faq-1-a",
                  kind: "paragraph",
                  props: { text: "En el centro de la ciudad." },
                },
              ],
            },
          ],
        },
      ],
    },
  ] as unknown as BuilderNode[];
}

const MAP: TranslationMap = {
  "Fiesta de lanzamiento": "Launch party",
  "Una noche de luz y sonido.": "A night of light and sound.",
  Reservar: "Book now",
  Moda: "Fashion",
  "¿Dónde es?": "Where is it?",
  "En el centro de la ciudad.": "In the city centre.",
  // Same in both languages: mapping to itself marks it done, not unmatched.
  LUMINA: "LUMINA",
};

function find(tree: BuilderNode[], id: string): BuilderNode {
  const walk = (nodes: BuilderNode[]): BuilderNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      const children = (node as { children?: BuilderNode[] }).children;
      if (Array.isArray(children)) {
        const hit = walk(children);
        if (hit) return hit;
      }
    }
    return null;
  };
  const hit = walk(tree);
  assert.ok(hit, `node ${id} not found`);
  return hit;
}

/** The overlay as the renderer reads it: `node.i18n`, else `props.i18n`. */
function overlayOf(node: BuilderNode): Record<string, Record<string, string>> | undefined {
  return (
    (node as { i18n?: Record<string, Record<string, string>> }).i18n ??
    (node.props as { i18n?: Record<string, Record<string, string>> })?.i18n
  );
}

test("every base string moves into the overlay; mapped ones become the new base", () => {
  const { tree, report } = splitPageI18n(fixture(), { to: "es", map: MAP });

  // Counts: 10 non-empty strings visited (h1, p1, stat, cta, brand, 3 marquee
  // items, faq title, faq answer); the whitespace paragraph is not a string.
  assert.equal(report.total, 10);
  assert.equal(report.moved, 10);
  // Translated = mapped AND different: h1, p1, cta, Moda, faq title, faq answer.
  assert.equal(report.translated, 6);
  // Numerals: "01" and "2026".
  assert.equal(report.numeric, 2);
  // Unmatched: only "Música" (LUMINA maps to itself).
  assert.deepEqual(report.unmatched, ["Música"]);

  // Top-level prop.
  const h1 = find(tree, "h1");
  assert.equal((h1.props as { text: string }).text, "Launch party");
  assert.equal(overlayOf(h1)?.es?.text, "Fiesta de lanzamiento");
  assert.equal((h1.props as { i18n?: unknown }).i18n !== undefined, true, "props.i18n mirrored");

  // Button: label moved + translated; href / tone untouched.
  const cta = find(tree, "cta");
  assert.deepEqual(cta.props, {
    label: "Book now",
    href: "/reservar",
    tone: "primary",
    i18n: { es: { label: "Reservar" } },
  });

  // Marquee nested paths.
  const mq = find(tree, "mq");
  const items = (mq.props as { items: Array<{ text: string; href?: string }> }).items;
  assert.deepEqual(items, [
    { text: "Fashion", href: "/moda" },
    { text: "Música" }, // unmatched: base stays, overlay filled
    { text: "2026" }, // numeral: base stays, overlay filled
  ]);
  assert.deepEqual(overlayOf(mq)?.es, {
    "items.0.text": "Moda",
    "items.1.text": "Música",
    "items.2.text": "2026",
  });
  assert.equal((mq.props as { speed: string }).speed, "medium");

  // Accordion title + nested paragraph.
  const faqItem = find(tree, "faq-1");
  assert.equal((faqItem.props as { title: string }).title, "Where is it?");
  assert.equal(overlayOf(faqItem)?.es?.title, "¿Dónde es?");
  const answer = find(tree, "faq-1-a");
  assert.equal((answer.props as { text: string }).text, "In the city centre.");
  assert.equal(overlayOf(answer)?.es?.text, "En el centro de la ciudad.");

  // Numeral stat: copied, base unchanged.
  const stat = find(tree, "stat");
  assert.equal((stat.props as { text: string }).text, "01");
  assert.equal(overlayOf(stat)?.es?.text, "01");
  assert.equal((stat.props as { level: number }).level, 3);

  // Whitespace-only text: untouched, no overlay invented.
  const empty = find(tree, "empty");
  assert.deepEqual(empty.props, { text: "   " });
  assert.equal(overlayOf(empty), undefined);

  // Structural nodes without text: untouched.
  const faq = find(tree, "faq");
  assert.deepEqual(faq.props, {});
  assert.equal(overlayOf(faq), undefined);
});

test("the report's Translations-panel view of the result: nothing left untranslated except the unmatched string", () => {
  const { tree } = splitPageI18n(fixture(), { to: "es", map: MAP });
  const panel = buildOverlayTranslationReport(tree, "es");
  assert.equal(panel.counts.no_counterpart, 0);
  assert.equal(panel.counts.translated, 6);
  // Música, LUMINA, 01, 2026 all carry an overlay equal to the base.
  assert.equal(panel.counts.identical, 4);
});

test("the transformed tree passes strict validation and keeps node.i18n mirrored", () => {
  const { tree } = splitPageI18n(fixture(), { to: "es", map: MAP });
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true, validated.ok ? "" : JSON.stringify(validated.issues));
  const h1 = find(validated.tree, "h1");
  assert.equal(overlayOf(h1)?.es?.text, "Fiesta de lanzamiento");
});

test("idempotent: a second run moves nothing and translates nothing", () => {
  const first = splitPageI18n(fixture(), { to: "es", map: MAP });
  const second = splitPageI18n(first.tree, { to: "es", map: MAP });
  assert.equal(second.report.moved, 0);
  assert.equal(second.report.translated, 0);
  assert.equal(second.report.changes.length, 0);
  // The one still-untranslated string is reported again, so the operator's
  // next round sees exactly what is left.
  assert.deepEqual(second.report.unmatched, ["Música"]);
  assert.deepEqual(second.tree, first.tree);
});

test("second round with the missing entry translates only that string", () => {
  const first = splitPageI18n(fixture(), { to: "es", map: MAP });
  const second = splitPageI18n(first.tree, { to: "es", map: { ...MAP, Música: "Music" } });
  assert.equal(second.report.moved, 0);
  assert.equal(second.report.translated, 1);
  assert.deepEqual(second.report.unmatched, []);
  const mq = find(second.tree, "mq");
  assert.equal((mq.props as { items: Array<{ text: string }> }).items[1]?.text, "Music");
  assert.equal(overlayOf(mq)?.es?.["items.1.text"], "Música");
});

test("an overlay the operator already filled is never overwritten", () => {
  const tree = fixture();
  const h1 = find(tree, "h1");
  (h1.props as Record<string, unknown>).i18n = { es: { text: "Fiesta LUMINA" } };
  const { tree: out, report } = splitPageI18n(tree, { to: "es", map: MAP });
  assert.equal(overlayOf(find(out, "h1"))?.es?.text, "Fiesta LUMINA");
  // Base differs from the overlay → already translated → base left alone.
  assert.equal((find(out, "h1").props as { text: string }).text, "Fiesta de lanzamiento");
  assert.equal(report.moved, 9);
});

test("untouched nodes keep their object identity (structural sharing)", () => {
  const input = fixture();
  const { tree } = splitPageI18n(input, { to: "es", map: {} });
  const before = find(input, "empty");
  const after = find(tree, "empty");
  assert.equal(after, before);
});

test("parseArgs: dry-run is the default, --apply opts in, from/to must differ", () => {
  const base = ["--tenant", "impronta", "--page", "lumina", "--from", "en", "--to", "es", "--map", "m.json"];
  assert.equal(parseArgs(base).apply, false);
  assert.equal(parseArgs([...base, "--dry-run"]).apply, false);
  assert.equal(parseArgs([...base, "--apply"]).apply, true);
  assert.equal(parseArgs(["--tenant=impronta", "--page=lumina", "--from=EN", "--to=es", "--map=m.json"]).from, "en");
  assert.throws(() => parseArgs([...base.slice(0, 6), "--to", "en", "--map", "m.json"]), /must differ/);
  assert.throws(() => parseArgs(base.slice(0, 8)), /--map is required/);
});
